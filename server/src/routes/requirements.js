import { Router } from 'express';
import mongoose from 'mongoose';
import Requirement from '../models/Requirement.js';
import Task from '../models/Task.js';
import Campaign from '../models/Campaign.js';
import { categoryMap } from '../models/Category.js';
import { nextSeq } from '../models/Counter.js';
import { protect, noVendor, isManager, isAdmin, canRaise, canMarkUsage } from '../middleware/auth.js';
import {
  DEPARTMENTS, WORK_DEPARTMENTS, REQUIREMENT_TYPES, PRIORITIES, ACTIVE_TASK, OPEN_REQUIREMENT, FULFILLED_REQUIREMENT,
  REQUIREMENT_STATUS, PERFORMANCE,
} from '../utils/config.js';
import { escapeRx } from '../utils/dates.js';
import { notify, managerIds } from '../services/notify.js';
import { compactGroup, placeTask, scopeOf } from '../services/ordering.js';

const router = Router();
router.use(protect, noVendor);

const POP = [
  { path: 'raisedBy', select: 'name department role' },
  { path: 'approvedBy', select: 'name' },
  { path: 'fulfilledBy', select: 'name' },
  { path: 'campaign', select: 'name active startDate endDate' },
  { path: 'usage.by', select: 'name' },
  { path: 'performance.by', select: 'name' },
  { path: 'updateRequests.requestedBy', select: 'name' },
  { path: 'updateRequests.fulfilledBy', select: 'name' },
  { path: 'comments.user', select: 'name department role' },
  { path: 'activity.user', select: 'name' },
];
const fail = (res, code, message) => res.status(code).json({ message });
const valid = (id) => mongoose.isValidObjectId(id);
const link = (r) => `/requirements/${r._id}`;

async function withTasks(id) {
  const doc = await Requirement.findById(id).populate(POP);
  if (!doc) return null;
  const tasks = await Task.find({ requirement: id })
    .select('-activity -comments')
    .populate([{ path: 'assignee', select: 'name department' }, { path: 'vendor.user', select: 'name company' }])
    .sort({ createdAt: 1 });
  return { ...doc.toObject(), tasks };
}

async function load(req, res) {
  if (!valid(req.params.id)) { fail(res, 404, 'Requirement not found.'); return null; }
  const doc = await Requirement.findById(req.params.id);
  if (!doc) { fail(res, 404, 'Requirement not found.'); return null; }
  return doc;
}

async function checkCategory(key) {
  const cats = await categoryMap();
  return cats[key]?.active ? cats[key] : null;
}
async function checkCampaign(id) {
  if (!id) return null;
  if (!valid(id)) return false;
  return (await Campaign.findById(id).select('_id name')) || false;
}

/* ---------- Requirement Zone ---------- */
router.get('/', async (req, res) => {
  const { status = 'open', department, type, usageType, campaign, sourcing, priority, performance, mine, q } = req.query;
  const f = {};
  if (status === 'open') f.status = { $in: OPEN_REQUIREMENT };
  else if (status === 'ongoing') f.status = { $in: ['approved', 'assigned', 'in_progress'] };
  else if (status === 'ready') { f.status = { $in: ['in_progress', 'update_needed'] }; f.readyToFulfill = true; }
  else if (status !== 'all' && REQUIREMENT_STATUS[status]) f.status = status;
  if (department) f.department = department;
  if (type) f.type = type;
  if (usageType) f.usageType = usageType;
  if (campaign && valid(campaign)) f.campaign = campaign;
  if (sourcing) f.sourcing = sourcing;
  if (priority) f.priority = priority;
  if (performance) f['performance.rating'] = performance;
  if (mine === 'raised') f.raisedBy = req.user._id;
  if (mine === 'department' && req.user.department) f.department = req.user.department;
  if (q) { const rx = new RegExp(escapeRx(q), 'i'); f.$or = [{ title: rx }, { code: rx }, { description: rx }]; }

  const list = await Requirement.find(f).select('-activity -comments')
    .populate([{ path: 'raisedBy', select: 'name department' }, { path: 'campaign', select: 'name' }])
    .sort({ createdAt: -1 }).limit(500).lean();
  const tasks = await Task.find({ requirement: { $in: list.map((r) => r._id) } })
    .select('requirement status department assignee sourcing vendor.name').populate('assignee', 'name').lean();
  const byReq = {};
  tasks.forEach((t) => { (byReq[t.requirement] ||= []).push(t); });
  res.json(list.map((r) => ({ ...r, tasks: byReq[r._id] || [] })));
});

/* ---------- A. Raise ---------- */
router.post('/', async (req, res) => {
  if (!canRaise(req.user)) return fail(res, 403, 'Your department cannot raise requirements.');
  const { title, description, purpose, type, usageType, campaign, priority = 'medium', deadline, references, department } = req.body;
  if (!title?.trim()) return fail(res, 400, 'Give the requirement a title.');
  if (!REQUIREMENT_TYPES[type]) return fail(res, 400, 'Pick the creative format.');
  const cat = await checkCategory(usageType);
  if (!cat) return fail(res, 400, 'Pick the requirement type (Campaign Creative, Daily Poster, …).');
  if (!PRIORITIES.includes(priority)) return fail(res, 400, 'Pick a priority.');
  const camp = await checkCampaign(campaign);
  if (camp === false) return fail(res, 400, 'Pick a valid campaign.');
  const dept = isManager(req.user) ? (department || req.user.department || null) : req.user.department;
  if (dept && !DEPARTMENTS[dept]) return fail(res, 400, 'Pick a valid department.');

  const doc = new Requirement({
    code: `REQ-${String(await nextSeq('requirement')).padStart(4, '0')}`,
    title: title.trim(), description, purpose, type, usageType, campaign: camp?._id || null, priority, department: dept,
    deadline: deadline || undefined,
    references: (references || []).map((s) => s.trim()).filter(Boolean),
    raisedBy: req.user._id,
  });
  doc.log(req.user, 'Raised the requirement');
  await doc.save();
  notify(await managerIds(), {
    type: 'requirement_new', title: `New requirement ${doc.code}`,
    message: `${req.user.name}${dept ? ` (${DEPARTMENTS[dept].label})` : ''} raised "${doc.title}" – ${cat.label}, ${REQUIREMENT_TYPES[type]}, ${priority} priority.`,
    link: link(doc), actor: req.user,
  });
  res.status(201).json(await withTasks(doc._id));
});

router.get('/:id', async (req, res) => {
  if (!valid(req.params.id)) return fail(res, 404, 'Requirement not found.');
  const doc = await withTasks(req.params.id);
  if (!doc) return fail(res, 404, 'Requirement not found.');
  res.json(doc);
});

/* ---------- Edit ---------- */
router.patch('/:id', async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  const owner = String(doc.raisedBy) === String(req.user._id);
  if (!OPEN_REQUIREMENT.includes(doc.status)) return fail(res, 400, 'This requirement is closed.');
  if (!isManager(req.user) && !(owner && doc.status === 'new')) return fail(res, 403, 'You can edit this only until the coordinator approves it.');
  const { title, description, purpose, type, usageType, campaign, priority, deadline, references, department } = req.body;
  if (type && !REQUIREMENT_TYPES[type]) return fail(res, 400, 'Pick a creative format.');
  if (usageType && usageType !== doc.usageType && !(await checkCategory(usageType))) return fail(res, 400, 'Pick a requirement type.');
  if (priority && !PRIORITIES.includes(priority)) return fail(res, 400, 'Pick a priority.');
  if (campaign !== undefined) {
    const camp = await checkCampaign(campaign);
    if (camp === false) return fail(res, 400, 'Pick a valid campaign.');
    doc.campaign = camp?._id || null;
  }
  if (title !== undefined) doc.title = title;
  if (description !== undefined) doc.description = description;
  if (purpose !== undefined) doc.purpose = purpose;
  if (type) doc.type = type;
  if (usageType) doc.usageType = usageType;
  if (priority) doc.priority = priority;
  if (deadline !== undefined) doc.deadline = deadline || undefined;
  if (references !== undefined) doc.references = references.filter(Boolean);
  if (department !== undefined && isManager(req.user)) doc.department = department || null;
  doc.log(req.user, 'Edited the requirement');
  await doc.save();
  res.json(await withTasks(doc._id));
});

/* ---------- B. Coordinator review & categorisation → Approved ---------- */
router.post('/:id/approve', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can approve requirements.');
  const doc = await load(req, res); if (!doc) return;
  if (doc.status !== 'new') return fail(res, 400, 'This requirement is already approved.');
  const { usageType, targetDepartment, priority, sourcing = 'internal', deadline, note } = req.body;
  if (usageType && !(await checkCategory(usageType))) return fail(res, 400, 'Pick a requirement type.');
  if (targetDepartment && !WORK_DEPARTMENTS.includes(targetDepartment)) return fail(res, 400, 'Pick Creative or Production.');
  if (priority && !PRIORITIES.includes(priority)) return fail(res, 400, 'Pick a priority.');
  if (!['internal', 'outsourced'].includes(sourcing)) return fail(res, 400, 'Choose internal or outsourced.');

  if (usageType) doc.usageType = usageType;
  if (priority) doc.priority = priority;
  if (deadline !== undefined) doc.deadline = deadline || undefined;
  doc.targetDepartment = targetDepartment || null;
  doc.sourcing = sourcing;
  doc.reviewNote = note?.trim() || undefined;
  doc.status = 'approved'; doc.approvedAt = new Date(); doc.approvedBy = req.user._id;
  doc.log(req.user, `Approved · ${sourcing === 'outsourced' ? 'Outsourced' : 'Internal'}${targetDepartment ? ` · ${DEPARTMENTS[targetDepartment].label}` : ''} · ${doc.priority} priority`);
  await doc.save();
  notify([doc.raisedBy], { type: 'status', title: `${doc.code}: Approved`, message: `${req.user.name} approved "${doc.title}"${sourcing === 'outsourced' ? ' (outsourced to a vendor)' : ''}.`, link: link(doc), actor: req.user });
  res.json(await withTasks(doc._id));
});

/* ---------- E. Coordinator marks fulfilled (first time or after an update) ---------- */
router.post('/:id/fulfill', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can mark a requirement fulfilled.');
  const doc = await load(req, res); if (!doc) return;
  if (!OPEN_REQUIREMENT.includes(doc.status)) return fail(res, 400, 'This requirement is not open.');
  const tasks = await Task.find({ requirement: doc._id, status: { $ne: 'cancelled' } }).select('status');
  if (!tasks.length) return fail(res, 400, 'Create and finish at least one task first.');
  if (tasks.some((t) => t.status !== 'closed')) return fail(res, 400, 'Every task must be reviewed and closed before the requirement is fulfilled.');

  const afterUpdate = doc.status === 'update_needed';
  doc.status = 'fulfilled';
  doc.fulfilledAt = new Date(); doc.fulfilledBy = req.user._id;
  doc.fulfillNote = req.body.note?.trim() || undefined; doc.readyToFulfill = false;
  if (afterUpdate) {
    const open = doc.updateRequests.find((u) => u.status === 'open');
    if (open) { open.status = 'fulfilled'; open.fulfilledAt = new Date(); open.fulfilledBy = req.user._id; }
  }
  doc.log(req.user, afterUpdate ? `Marked fulfilled again after update #${doc.updateCount}` : 'Marked as Fulfilled');
  await doc.save();
  notify([doc.raisedBy, ...(afterUpdate ? doc.updateRequests.map((u) => u.requestedBy) : [])], {
    type: 'fulfilled', title: `${doc.code}: Fulfilled${afterUpdate ? ' (updated)' : ''}`,
    message: afterUpdate
      ? `The updated creatives for "${doc.title}" are ready. Use them, then mark the task completed (or request another update).`
      : `All creatives for "${doc.title}" are delivered. Use them, then mark how they were used to complete it.`,
    link: link(doc), actor: req.user,
  });
  res.json(await withTasks(doc._id));
});

/* ---------- F. Update request → back to the same staff / vendor ---------- */
router.post('/:id/update-request', async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  if (!canMarkUsage(doc, req.user)) return fail(res, 403, 'Only an admin, coordinator or the requirement raiser can request an update.');
  if (!FULFILLED_REQUIREMENT.includes(doc.status)) return fail(res, 400, 'Updates can be requested after the requirement is fulfilled.');
  const reason = req.body.reason?.trim();
  if (!reason) return fail(res, 400, 'Give a reason for the update.');
  const description = req.body.description?.trim() || undefined;
  const references = (req.body.references || []).map((s) => s.trim()).filter(Boolean);

  const closed = await Task.find({ requirement: doc._id, status: 'closed' }).populate('assignee', 'name active').populate('vendor.user', 'name active');
  const chosen = Array.isArray(req.body.taskIds) && req.body.taskIds.length
    ? closed.filter((t) => req.body.taskIds.includes(String(t._id)))
    : closed;
  if (!chosen.length) return fail(res, 400, 'Pick at least one delivered task to update.');

  const round = doc.updateCount + 1;
  for (const t of chosen) {
    const outsourced = t.sourcing === 'outsourced';
    const sameStaff = outsourced || (t.assignee && t.assignee.active !== false);
    t.status = sameStaff ? 'assigned' : 'open';
    if (!sameStaff) t.assignee = null;
    t.startedAt = undefined; t.submittedAt = undefined; t.closedAt = undefined; t.pausedAt = undefined;
    t.reviewedBy = null; t.reviewedAt = undefined; t.reminderSentAt = undefined; t.overdueNotifiedAt = undefined;
    t.update = { active: true, round, reason, description, references, requestedBy: req.user._id, at: new Date() };
    t.comments.push({ user: req.user._id, text: `Update requested: ${reason}${description ? `\n${description}` : ''}`, kind: 'update' });
    await placeTask(t, t.priority, 1); // top of that person's queue
    const who = outsourced ? (t.vendor?.name || 'the vendor') : sameStaff ? t.assignee.name : 'the department';
    t.log(req.user, `Update #${round} requested · reverted to ${who}`);
    await t.save();
  }

  doc.updateCount = round;
  doc.status = 'update_needed';
  doc.readyToFulfill = false;
  doc.updateRequests.push({ reason, description, references, tasks: chosen.map((t) => t._id), requestedBy: req.user._id });
  doc.log(req.user, `Requested update #${round}: ${reason}`);
  await doc.save();

  for (const t of chosen) {
    const to = t.sourcing === 'outsourced' ? t.vendor?.user?._id : t.assignee?._id;
    if (to) notify([to], { type: 'update_request', title: `Update requested on ${t.code}`, message: `"${t.title}" was sent back to you. Reason: ${reason.slice(0, 140)}`, link: `/tasks/${t._id}`, actor: req.user });
  }
  notify([...(await managerIds()), doc.raisedBy], {
    type: 'update_request', title: `${doc.code}: Update Needed`,
    message: `${req.user.name} requested an update on "${doc.title}" (${chosen.length} task${chosen.length > 1 ? 's' : ''}). Reason: ${reason.slice(0, 120)}`,
    link: link(doc), actor: req.user,
  });
  res.json(await withTasks(doc._id));
});

/* ---------- G. Marketing: performance rating (before or after completion) ---------- */
router.post('/:id/performance', async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  if (!canMarkUsage(doc, req.user)) return fail(res, 403, 'Only marketing, the raiser or a coordinator can rate performance.');
  if (![...FULFILLED_REQUIREMENT, 'task_completed'].includes(doc.status)) return fail(res, 400, 'Rate performance after the creative is fulfilled.');
  const rating = req.body.rating;
  if (!PERFORMANCE[rating]) return fail(res, 400, 'Pick High, Medium, Low or Rejected.');
  doc.performance = { rating, note: req.body.note?.trim() || undefined, by: req.user._id, at: new Date() };
  doc.log(req.user, `Rated performance: ${PERFORMANCE[rating]}`);
  await doc.save();
  res.json(await withTasks(doc._id));
});

/* ---------- G. Marketing: mark used / published → Completed ---------- */
router.post('/:id/usage', async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  if (!canMarkUsage(doc, req.user)) return fail(res, 403, 'Only marketing, the raiser or a coordinator can mark usage.');
  if (!FULFILLED_REQUIREMENT.includes(doc.status)) return fail(res, 400, 'Usage can be marked after the requirement is fulfilled.');
  const usageType = req.body.usageType || doc.usageType;
  const cats = await categoryMap();
  if (!cats[usageType]) return fail(res, 400, 'Pick the requirement type.');
  const note = req.body.note?.trim();
  if (!note) return fail(res, 400, 'Describe where and how the creative was used.');
  if (req.body.campaign !== undefined) {
    const camp = await checkCampaign(req.body.campaign);
    if (camp === false) return fail(res, 400, 'Pick a valid campaign.');
    doc.campaign = camp?._id || null;
  }
  if (req.body.rating) {
    if (!PERFORMANCE[req.body.rating]) return fail(res, 400, 'Pick High, Medium, Low or Rejected.');
    doc.performance = { rating: req.body.rating, note: req.body.ratingNote?.trim() || doc.performance?.note, by: req.user._id, at: new Date() };
  }

  doc.usageType = usageType;
  doc.usage = { note, link: req.body.link?.trim() || undefined, date: req.body.date || new Date(), at: new Date(), by: req.user._id };
  doc.status = 'task_completed';
  doc.log(req.user, `Marked used / published · Completed${doc.performance?.rating ? ` · ${PERFORMANCE[doc.performance.rating]}` : ''}`);
  await doc.save();
  notify(await managerIds(), {
    type: 'usage', title: `${doc.code}: Completed`,
    message: `${req.user.name} marked "${doc.title}" as used${doc.performance?.rating ? ` (${PERFORMANCE[doc.performance.rating]})` : ''}: ${note.slice(0, 120)}`,
    link: link(doc), actor: req.user,
  });
  res.json(await withTasks(doc._id));
});

/* ---------- Cancel ---------- */
router.post('/:id/cancel', async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  const owner = String(doc.raisedBy) === String(req.user._id);
  if (!isManager(req.user) && !owner) return fail(res, 403, 'Only the person who raised it or a coordinator can cancel it.');
  if (!OPEN_REQUIREMENT.includes(doc.status)) return fail(res, 400, 'This requirement can no longer be cancelled.');

  const tasks = await Task.find({ requirement: doc._id, status: { $in: [...ACTIVE_TASK, 'completed'] } });
  const groups = [];
  for (const t of tasks) {
    groups.push([t.priority, scopeOf(t)]);
    t.status = 'cancelled'; t.order = null;
    t.log(req.user, 'Cancelled with the requirement');
    await t.save();
  }
  for (const [p, s] of groups) await compactGroup(p, s);
  doc.status = 'cancelled';
  doc.log(req.user, req.body.reason ? `Cancelled: ${req.body.reason}` : 'Cancelled');
  await doc.save();
  const recipients = [doc.raisedBy, ...(await managerIds()), ...tasks.map((t) => t.assignee), ...tasks.map((t) => t.vendor?.user)];
  notify(recipients, { type: 'status', title: `${doc.code} cancelled`, message: `"${doc.title}" was cancelled by ${req.user.name}.`, link: link(doc), actor: req.user });
  res.json(await withTasks(doc._id));
});

router.post('/:id/comments', async (req, res) => {
  const doc = await load(req, res); if (!doc) return;
  if (!req.body.text?.trim()) return fail(res, 400, 'Write a comment first.');
  doc.comments.push({ user: req.user._id, text: req.body.text.trim() });
  await doc.save();
  const recipients = [doc.raisedBy, ...(isManager(req.user) ? [] : await managerIds())];
  notify(recipients, { type: 'comment', title: `New comment on ${doc.code}`, message: `${req.user.name}: ${req.body.text.trim().slice(0, 140)}`, link: link(doc), actor: req.user });
  res.json(await withTasks(doc._id));
});

router.delete('/:id', async (req, res) => {
    if (!isAdmin(req.user)) return fail(res, 403, 'Only an admin or director can delete requirements.');
  if (!valid(req.params.id)) return fail(res, 404, 'Requirement not found.');
  const tasks = await Task.find({ requirement: req.params.id });
  await Task.deleteMany({ requirement: req.params.id });
  await Requirement.deleteOne({ _id: req.params.id });
  for (const t of tasks) await compactGroup(t.priority, scopeOf(t));
  res.json({ message: 'Deleted.' });
});

export default router;