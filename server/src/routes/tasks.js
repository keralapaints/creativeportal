import { Router } from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import Requirement from '../models/Requirement.js';
import User from '../models/User.js';
import { nextSeq } from '../models/Counter.js';
import { protect, isManager, isAdmin, isWorker, isVendor } from '../middleware/auth.js';
import { DEPARTMENTS, WORK_DEPARTMENTS, PRIORITIES, PRIORITY_RANK, ACTIVE_TASK, TASK_STATUS, OPEN_REQUIREMENT } from '../utils/config.js';
import { endOfToday, escapeRx } from '../utils/dates.js';
import { placeTask, compactGroup, scopeOf, annotateQueues } from '../services/ordering.js';
import { notify, managerIds, departmentStaffIds } from '../services/notify.js';
import { checkDriveLink } from '../services/drive.js';
import { syncRequirement } from '../services/requirements.js';

const router = Router();
router.use(protect);

const POP = [
  { path: 'requirement', select: 'code title type usageType department raisedBy deadline description purpose references status campaign performance', populate: [{ path: 'campaign', select: 'name' }, { path: 'raisedBy', select: 'name department' }] },
  { path: 'assignee', select: 'name department' },
  { path: 'assignedBy', select: 'name' },
  { path: 'completedBy', select: 'name' },
  { path: 'reviewedBy', select: 'name' },
  { path: 'vendor.user', select: 'name company email phone' },
  { path: 'conflict.raisedBy', select: 'name' },
  { path: 'conflict.resolvedBy', select: 'name' },
  { path: 'comments.user', select: 'name role department company' },
  { path: 'activity.user', select: 'name' },
];
const LIST_POP = [
  { path: 'requirement', select: 'code title type usageType department status campaign performance', populate: { path: 'campaign', select: 'name' } },
  { path: 'assignee', select: 'name department' },
  { path: 'vendor.user', select: 'name company' },
];

const fail = (res, code, message) => res.status(code).json({ message });
const link = (t) => `/tasks/${t._id}`;
const idOf = (x) => String(x?._id || x || '');
const isAssignee = (t, u) => t.assignee && idOf(t.assignee) === String(u._id);
const isVendorOf = (t, u) => isVendor(u) && t.vendor?.user && idOf(t.vendor.user) === String(u._id);
const isDoer = (t, u) => isAssignee(t, u) || isVendorOf(t, u);
const label = (p) => p[0].toUpperCase() + p.slice(1);
const outsourced = (t) => t.sourcing === 'outsourced';

export const funnelSort = (a, b) =>
  (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) ||
  ((a.order ?? 9999) - (b.order ?? 9999)) ||
  ((a.deadline ? +new Date(a.deadline) : Infinity) - (b.deadline ? +new Date(b.deadline) : Infinity));

async function load(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { fail(res, 404, 'Task not found.'); return null; }
  const t = await Task.findById(req.params.id);
  if (!t) { fail(res, 404, 'Task not found.'); return null; }
  if (isVendor(req.user) && !isVendorOf(t, req.user)) { fail(res, 403, 'This task is not assigned to you.'); return null; }
  return t;
}
const send = async (res, t, extra = {}) => {
  const obj = (await Task.findById(t._id).populate(POP)).toObject();
  await annotateQueues([obj]);
  res.json({ ...obj, ...extra });
};
// After any change: refresh the requirement status, then reply
const finish = async (req, res, t, extra = {}) => {
  await syncRequirement(t.requirement, req.user);
  return send(res, t, extra);
};

async function checkAssignee(userId, department) {
  const u = await User.findById(userId);
  if (!u || !u.active) return { error: 'Pick an active staff member.' };
  if (u.role !== 'staff' || u.department !== department) return { error: `${u.name} is not in the ${DEPARTMENTS[department].label}.` };
  return { user: u };
}

async function vendorFrom(body) {
  const v = body.vendor || {};
  let user = null;
  if (v.user) {
    user = await User.findById(v.user);
    if (!user || user.role !== 'vendor' || !user.active) return { error: 'Pick an active vendor account.' };
  }
  const name = (v.name || user?.company || user?.name || '').trim();
  if (!name) return { error: 'Enter the vendor name or pick a vendor account.' };
  const cost = v.cost === '' || v.cost === undefined || v.cost === null ? undefined : Number(v.cost);
  if (cost !== undefined && (Number.isNaN(cost) || cost < 0)) return { error: 'Cost must be a positive number.' };
  return {
    vendor: {
      name, contact: v.contact?.trim() || user?.name, phone: v.phone?.trim() || user?.phone,
      email: v.email?.trim() || user?.email, cost, user: user?._id || null,
    },
  };
}

/* ---------- list ---------- */
router.get('/', async (req, res) => {
  const u = req.user;
  const { view = 'active', department, status, assignee, requirement, priority, sourcing, q } = req.query;
  const f = {};
  if (isVendor(u)) f['vendor.user'] = u._id;
  else if (!isManager(u)) {
    if (!isWorker(u)) return res.json([]);
    f.department = u.department;
    f.sourcing = { $ne: 'outsourced' };
  } else if (department) f.department = department;

  // Internal views exclude outsourced work; the "outsourced" view shows only that
  if (!isVendor(u) && isManager(u)) {
    if (view === 'outsourced' || sourcing === 'outsourced') f.sourcing = 'outsourced';
    else if (sourcing !== 'all') f.sourcing = { $ne: 'outsourced' };
  }

  switch (view) {
    case 'active': f.status = { $in: ACTIVE_TASK }; break;
    case 'mine': f.assignee = u._id; f.status = { $in: [...ACTIVE_TASK, 'completed'] }; break;
    case 'available': f.status = 'open'; f.allowSelfAssign = true; f.assignee = null; break;
    case 'review': f.status = 'completed'; break;
    case 'conflicts': f['conflict.active'] = true; break;
    case 'today': f.status = { $in: ACTIVE_TASK }; f.deadline = { $lte: endOfToday() }; break;
    case 'closed': f.status = { $in: ['closed', 'cancelled'] }; break;
    default: break; // outsourced / all
  }
  if (status && TASK_STATUS[status]) f.status = status;
  if (assignee && mongoose.isValidObjectId(assignee)) f.assignee = assignee;
  if (requirement && mongoose.isValidObjectId(requirement)) f.requirement = requirement;
  if (priority && PRIORITIES.includes(priority)) f.priority = priority;
  if (q) { const rx = new RegExp(escapeRx(q), 'i'); f.$or = [{ title: rx }, { code: rx }, { 'vendor.name': rx }]; }

  const list = await Task.find(f).select('-activity -comments').populate(LIST_POP).limit(1000).lean();
  if (view === 'closed') list.sort((a, b) => +new Date(b.closedAt || b.updatedAt) - +new Date(a.closedAt || a.updatedAt));
  else list.sort(funnelSort);
  res.json(await annotateQueues(list));
});

/* ---------- Priority funnel tab: one queue per staff member + unassigned per department ---------- */
router.get('/queues', async (req, res) => {
  const u = req.user;
  if (isVendor(u)) return fail(res, 403, 'Not available for vendors.');
  const f = { status: { $in: ACTIVE_TASK }, sourcing: { $ne: 'outsourced' } };
  if (!isManager(u)) {
    if (!isWorker(u)) return res.json({ staff: [], unassigned: {} });
    f.department = u.department;
  } else if (req.query.department) f.department = req.query.department;

  const tasks = await Task.find(f).select('-activity -comments').populate(LIST_POP).lean();
  tasks.sort(funnelSort);
  await annotateQueues(tasks);

  const staffFilter = { role: 'staff', active: true, department: isManager(u) ? { $in: req.query.department ? [req.query.department] : WORK_DEPARTMENTS } : u.department };
  const people = await User.find(staffFilter).select('name department').sort({ department: 1, name: 1 }).lean();
  const staff = people.map((p) => ({ user: p, tasks: tasks.filter((t) => idOf(t.assignee) === String(p._id)) }));
  // Staff see their own queue first
  if (!isManager(u)) staff.sort((a, b) => (String(b.user._id) === String(u._id)) - (String(a.user._id) === String(u._id)));
  const unassigned = Object.fromEntries((req.query.department ? [req.query.department] : WORK_DEPARTMENTS)
    .filter((d) => isManager(u) || d === u.department)
    .map((d) => [d, tasks.filter((t) => !t.assignee && t.department === d)]));
  res.json({ staff, unassigned });
});

router.get('/:id', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  send(res, t);
});

/* ---------- C. Coordinator creates a task: internal staff or outsourced vendor ---------- */
router.post('/', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can create tasks.');
  const { requirement, title, notes, department, assignee, allowSelfAssign = true, priority, position, deadline, sourcing = 'internal' } = req.body;
  if (!mongoose.isValidObjectId(requirement)) return fail(res, 400, 'Pick a requirement.');
  const reqDoc = await Requirement.findById(requirement);
  if (!reqDoc) return fail(res, 404, 'Requirement not found.');
  if (!OPEN_REQUIREMENT.includes(reqDoc.status)) return fail(res, 400, `This requirement is ${reqDoc.status === 'cancelled' ? 'cancelled' : 'already fulfilled. Use "Request update" to send work back'}.`);
  if (!WORK_DEPARTMENTS.includes(department)) return fail(res, 400, 'Pick Creative or Production.');
  const prio = PRIORITIES.includes(priority) ? priority : reqDoc.priority;
  const isOut = sourcing === 'outsourced';

  let person = null; let vendor = null;
  if (isOut) {
    const r = await vendorFrom(req.body);
    if (r.error) return fail(res, 400, r.error);
    vendor = r.vendor;
  } else if (assignee) {
    const r = await checkAssignee(assignee, department);
    if (r.error) return fail(res, 400, r.error);
    person = r.user;
  }

  const task = new Task({
    code: `TSK-${String(await nextSeq('task')).padStart(4, '0')}`,
    requirement: reqDoc._id,
    title: (title || reqDoc.title).trim(),
    notes, department, sourcing: isOut ? 'outsourced' : 'internal',
    allowSelfAssign: isOut ? false : Boolean(allowSelfAssign),
    deadline: deadline || reqDoc.deadline || undefined,
    status: isOut || person ? 'assigned' : 'open',
    assignee: person?._id || null,
    assignedBy: isOut || person ? req.user._id : null,
    assignedAt: isOut || person ? new Date() : undefined,
    vendor: vendor || undefined,
  });
  await placeTask(task, prio, position || null);
  task.log(req.user, isOut
    ? `Outsourced to ${vendor.name}${vendor.cost !== undefined ? ` · cost ${vendor.cost}` : ''} · ${label(prio)} priority`
    : `Created for ${DEPARTMENTS[department].label} · ${label(prio)}${person ? ` · ${person.name} #${task.order}` : ''}`);
  await task.save();

  if (reqDoc.status === 'new') { reqDoc.status = 'approved'; reqDoc.approvedAt = new Date(); reqDoc.approvedBy = req.user._id; }
  if (isOut && reqDoc.sourcing !== 'outsourced') reqDoc.sourcing = 'outsourced';
  reqDoc.log(req.user, `Created task ${task.code}${isOut ? ` · outsourced to ${vendor.name}` : ` for ${DEPARTMENTS[department].label}${person ? ` (${person.name})` : ''}`}`);
  await reqDoc.save();

  if (person) {
    notify([person._id], { type: 'task_assigned', title: `New task ${task.code}`, message: `${req.user.name} assigned you "${task.title}" (${prio} priority${task.deadline ? `, due ${task.deadline.toLocaleDateString('en-IN')}` : ''}).`, link: link(task), actor: req.user });
  } else if (isOut && vendor.user) {
    notify([vendor.user], { type: 'task_assigned', title: `New outsourced task ${task.code}`, message: `${req.user.name} sent you "${task.title}"${task.deadline ? `, due ${task.deadline.toLocaleDateString('en-IN')}` : ''}.`, link: link(task), actor: req.user });
  } else if (!isOut && task.allowSelfAssign) {
    notify(await departmentStaffIds(department), { type: 'task_available', title: `Task available: ${task.code}`, message: `"${task.title}" is open for self-assignment in ${DEPARTMENTS[department].label}.`, link: link(task), actor: req.user });
  }
  res.status(201);
  finish(req, res, task);
});

/* ---------- edit details (incl. vendor) ---------- */
router.patch('/:id', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can edit tasks.');
  const t = await load(req, res); if (!t) return;
  const { title, notes, deadline, allowSelfAssign, department } = req.body;
  const changes = [];
  if (title !== undefined && title.trim()) { t.title = title.trim(); changes.push('title'); }
  if (notes !== undefined) { t.notes = notes; changes.push('notes'); }
  if (deadline !== undefined) {
    t.deadline = deadline || undefined; t.reminderSentAt = undefined; t.overdueNotifiedAt = undefined;
    changes.push(deadline ? `deadline ${new Date(deadline).toLocaleDateString('en-IN')}` : 'deadline removed');
  }
  if (allowSelfAssign !== undefined && !outsourced(t)) { t.allowSelfAssign = Boolean(allowSelfAssign); changes.push(allowSelfAssign ? 'self-assign on' : 'self-assign off'); }
  if (req.body.vendor && outsourced(t)) {
    const r = await vendorFrom(req.body);
    if (r.error) return fail(res, 400, r.error);
    const prev = t.vendor?.user ? String(t.vendor.user) : '';
    t.vendor = r.vendor;
    changes.push(`vendor details (${r.vendor.name})`);
    if (r.vendor.user && String(r.vendor.user) !== prev) {
      notify([r.vendor.user], { type: 'task_assigned', title: `New outsourced task ${t.code}`, message: `${req.user.name} sent you "${t.title}".`, link: link(t), actor: req.user });
    }
  }
  let oldScope = null;
  if (department && department !== t.department) {
    if (!WORK_DEPARTMENTS.includes(department)) return fail(res, 400, 'Pick Creative or Production.');
    if (!ACTIVE_TASK.includes(t.status)) return fail(res, 400, 'Only open tasks can move department.');
    oldScope = scopeOf(t);
    t.department = department;
    if (!outsourced(t) && t.assignee) { t.assignee = null; t.status = 'open'; t.startedAt = undefined; }
    await placeTask(t, t.priority, null);
    changes.push(`moved to ${DEPARTMENTS[department].label}`);
  }
  if (!changes.length) return finish(req, res, t);
  t.log(req.user, `Updated ${changes.join(', ')}`);
  await t.save();
  if (oldScope) await compactGroup(t.priority, oldScope);
  if (t.assignee) notify([t.assignee], { type: 'status', title: `${t.code} updated`, message: `${req.user.name} changed ${changes.join(', ')} on "${t.title}".`, link: link(t), actor: req.user });
  finish(req, res, t);
});

/* ---------- priority funnel: set priority + order (drag & drop uses this) ---------- */
router.post('/:id/position', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can reorder tasks.');
  const t = await load(req, res); if (!t) return;
  if (!ACTIVE_TASK.includes(t.status)) return fail(res, 400, 'Only tasks that are not finished can be reordered.');
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : t.priority;
  const old = { priority: t.priority, order: t.order };
  await placeTask(t, priority, req.body.position || null);
  if (old.priority !== priority) await compactGroup(old.priority, scopeOf(t));
  t.log(req.user, outsourced(t) ? `Priority set to ${label(priority)}` : `Moved from ${label(old.priority)} #${old.order} to ${label(priority)} #${t.order}`);
  await t.save();
  if (t.assignee && old.priority !== priority) {
    notify([t.assignee], { type: 'status', title: `${t.code} is now ${priority} priority`, message: `"${t.title}" moved to ${label(priority)} #${t.order}.`, link: link(t), actor: req.user });
  }
  finish(req, res, t);
});

router.post('/:id/move', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can reorder tasks.');
  const t = await load(req, res); if (!t) return;
  if (!ACTIVE_TASK.includes(t.status) || outsourced(t)) return fail(res, 400, 'Only open internal tasks can be reordered.');
  const to = Math.max(1, (t.order || 1) + (req.body.direction === 'up' ? -1 : 1));
  const from = t.order;
  await placeTask(t, t.priority, to);
  if (from !== t.order) t.log(req.user, `Moved ${req.body.direction} to ${label(t.priority)} #${t.order}`);
  await t.save();
  finish(req, res, t);
});

/* ---------- assign / reassign / unassign (moves the task between staff queues) ---------- */
router.post('/:id/assign', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can assign tasks.');
  const t = await load(req, res); if (!t) return;
  if (outsourced(t)) return fail(res, 400, 'This task is outsourced. Edit the vendor instead.');
  if (!ACTIVE_TASK.includes(t.status)) return fail(res, 400, 'This task is already finished.');
  const previous = t.assignee;
  const oldScope = scopeOf(t);

  if (!req.body.userId) {
    if (!previous) return fail(res, 400, 'Nobody is assigned.');
    t.assignee = null; t.status = 'open'; t.startedAt = undefined; t.selfAssigned = false;
    await placeTask(t, t.priority, null);
    t.log(req.user, 'Unassigned');
    await t.save();
    await compactGroup(t.priority, oldScope);
    notify([previous], { type: 'task_assigned', title: `${t.code} removed from you`, message: `${req.user.name} unassigned you from "${t.title}".`, link: link(t), actor: req.user });
    return finish(req, res, t);
  }

  const r = await checkAssignee(req.body.userId, t.department);
  if (r.error) return fail(res, 400, r.error);
  if (previous && String(previous) === String(r.user._id)) return finish(req, res, t);
  t.assignee = r.user._id; t.assignedBy = req.user._id; t.assignedAt = new Date(); t.selfAssigned = false;
  t.status = 'assigned'; t.startedAt = undefined;
  await placeTask(t, t.priority, req.body.position || null); // end of their queue unless a position is given
  t.log(req.user, `${previous ? 'Reassigned' : 'Assigned'} to ${r.user.name} · ${label(t.priority)} #${t.order}`);
  await t.save();
  await compactGroup(t.priority, oldScope);
  notify([r.user._id], { type: 'task_assigned', title: `New task ${t.code}`, message: `${req.user.name} assigned you "${t.title}" (${t.priority} priority #${t.order}).`, link: link(t), actor: req.user });
  if (previous) notify([previous], { type: 'task_assigned', title: `${t.code} reassigned`, message: `"${t.title}" was moved to ${r.user.name}.`, link: link(t), actor: req.user });
  finish(req, res, t);
});

router.post('/:id/self-assign', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  if (!isWorker(req.user) || req.user.department !== t.department || outsourced(t)) return fail(res, 403, `Only ${DEPARTMENTS[t.department].label} staff can take this task.`);
  if (!t.allowSelfAssign) return fail(res, 403, 'The coordinator assigns this task. Self-assignment is off.');
  if (t.status !== 'open' || t.assignee) return fail(res, 400, 'Someone already took this task.');
  const oldScope = scopeOf(t);
  t.assignee = req.user._id; t.assignedBy = req.user._id; t.assignedAt = new Date(); t.selfAssigned = true; t.status = 'assigned';
  await placeTask(t, t.priority, null);
  t.log(req.user, `Self-assigned · ${label(t.priority)} #${t.order}`);
  await t.save();
  await compactGroup(t.priority, oldScope);
  notify(await managerIds(), { type: 'self_assigned', title: `${t.code} self-assigned`, message: `${req.user.name} took "${t.title}".`, link: link(t), actor: req.user });
  finish(req, res, t);
});

router.post('/:id/release', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  if (!isAssignee(t, req.user)) return fail(res, 403, 'Only the assigned person can release this task.');
  if (!ACTIVE_TASK.includes(t.status)) return fail(res, 400, 'This task is already finished.');
  const oldScope = scopeOf(t);
  t.assignee = null; t.status = 'open'; t.startedAt = undefined; t.selfAssigned = false;
  await placeTask(t, t.priority, null);
  t.log(req.user, 'Released the task');
  await t.save();
  await compactGroup(t.priority, oldScope);
  notify(await managerIds(), { type: 'status', title: `${t.code} released`, message: `${req.user.name} released "${t.title}". It needs a new owner.`, link: link(t), actor: req.user });
  finish(req, res, t);
});

/* ---------- status: start (Ongoing), pause, resume ---------- */
router.post('/:id/start', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  if (!isDoer(t, req.user) && !isManager(req.user)) return fail(res, 403, 'Only the assigned person can start this task.');
  if (t.status !== 'assigned') return fail(res, 400, 'Only assigned tasks can be started.');
  t.status = 'in_progress'; t.startedAt = new Date();
  t.log(req.user, outsourced(t) ? 'Marked Ongoing' : 'Marked in progress');
  await t.save();
  const reqDoc = await Requirement.findById(t.requirement).select('raisedBy code');
  notify([reqDoc?.raisedBy], { type: 'status', title: `${t.code} in progress`, message: `Work started on "${t.title}" (${reqDoc?.code}).`, link: `/requirements/${t.requirement}`, actor: req.user });
  finish(req, res, t);
});

router.post('/:id/pause', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  if (!outsourced(t)) return fail(res, 400, 'Only outsourced projects can be paused.');
  if (!isManager(req.user) && !isVendorOf(t, req.user)) return fail(res, 403, 'Only the coordinator or the vendor can pause this.');
  if (!['assigned', 'in_progress'].includes(t.status)) return fail(res, 400, 'Only pending or ongoing projects can be paused.');
  t.status = 'paused'; t.pausedAt = new Date(); t.pauseReason = req.body.reason?.trim() || undefined;
  t.log(req.user, `Paused${t.pauseReason ? `: ${t.pauseReason}` : ''}`);
  await t.save();
  notify([...(await managerIds()), t.vendor?.user], { type: 'status', title: `${t.code} paused`, message: `"${t.title}" was paused${t.pauseReason ? `: ${t.pauseReason}` : ''}.`, link: link(t), actor: req.user });
  finish(req, res, t);
});

router.post('/:id/resume', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  if (t.status !== 'paused') return fail(res, 400, 'This project is not paused.');
  if (!isManager(req.user) && !isVendorOf(t, req.user)) return fail(res, 403, 'Only the coordinator or the vendor can resume this.');
  t.status = 'in_progress'; t.pausedAt = undefined; if (!t.startedAt) t.startedAt = new Date();
  t.log(req.user, 'Resumed · Ongoing');
  await t.save();
  notify([...(await managerIds()), t.vendor?.user], { type: 'status', title: `${t.code} resumed`, message: `"${t.title}" is ongoing again.`, link: link(t), actor: req.user });
  finish(req, res, t);
});

/* ---------- submit deliverable (Mark as Fulfilled) ---------- */
router.post('/:id/complete', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  if (!isDoer(t, req.user) && !isManager(req.user)) return fail(res, 403, 'Only the assigned person can complete this task.');
  if (!['assigned', 'in_progress', 'paused'].includes(t.status)) return fail(res, 400, 'This task cannot be completed now.');
  const drive = await checkDriveLink(req.body.driveLink);
  if (!drive.valid) return fail(res, 400, drive.message);
  if (drive.checked && !drive.accessible && process.env.DRIVE_REQUIRE_ACCESS === 'true') return fail(res, 400, drive.message);

  const prio = t.priority; const scope = scopeOf(t);
  t.status = 'completed'; t.submittedAt = new Date(); t.completedBy = req.user._id; t.order = null; t.pausedAt = undefined;
  if (!t.startedAt) t.startedAt = t.submittedAt;
  t.driveLink = drive.url; t.driveFileName = drive.name; t.driveChecked = Boolean(drive.checked && drive.accessible);
  t.submissionNote = req.body.note || undefined;
  if (t.conflict.active) { t.conflict.active = false; t.conflict.resolvedAt = new Date(); t.conflict.resolution = 'Closed by completing the task'; }
  t.log(req.user, t.update?.active ? `Submitted the updated deliverable (update #${t.update.round})` : 'Submitted the deliverable (Drive link)');
  await t.save();
  await compactGroup(prio, scope);

  const reqDoc = await Requirement.findById(t.requirement).select('raisedBy code');
  notify([...(await managerIds()), reqDoc?.raisedBy], {
    type: 'completed', title: t.update?.active ? `${t.code} update submitted` : `${t.code} fulfilled`,
    message: `${outsourced(t) ? t.vendor?.name : req.user.name} ${t.update?.active ? 'submitted the updated deliverable for' : 'delivered'} "${t.title}" (${reqDoc?.code}). It is waiting for review.`,
    link: link(t), actor: req.user,
  });
  finish(req, res, t, drive.checked && !drive.accessible ? { warning: drive.message } : {});
});

/* ---------- E. coordinator review → close or send back ---------- */
router.post('/:id/review', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can review tasks.');
  const t = await load(req, res); if (!t) return;
  if (t.status !== 'completed') return fail(res, 400, 'Only submitted tasks can be reviewed.');
  const feedback = req.body.feedback?.trim();
  t.reviewedBy = req.user._id; t.reviewedAt = new Date();
  const doer = outsourced(t) ? t.vendor?.user : t.assignee;

  if (req.body.action === 'rework') {
    if (!feedback) return fail(res, 400, 'Tell them what to change.');
    t.status = outsourced(t) || t.assignee ? 'assigned' : 'open';
    t.reworkCount += 1; t.submittedAt = undefined; t.startedAt = undefined;
    t.comments.push({ user: req.user._id, text: feedback, kind: 'feedback' });
    await placeTask(t, t.priority, 1);
    t.log(req.user, `Sent back for changes${outsourced(t) ? '' : ` (${label(t.priority)} #1)`}`);
    await t.save();
    notify([doer], { type: 'reviewed', title: `${t.code} needs changes`, message: `${req.user.name}: ${feedback.slice(0, 160)}`, link: link(t), actor: req.user });
  } else {
    t.status = 'closed'; t.closedAt = new Date();
    if (t.update?.active) t.update.active = false;
    if (feedback) t.comments.push({ user: req.user._id, text: feedback, kind: 'feedback' });
    t.log(req.user, 'Reviewed and closed');
    await t.save();
    notify([doer], { type: 'reviewed', title: `${t.code} approved and closed`, message: feedback ? `${req.user.name}: ${feedback.slice(0, 160)}` : `"${t.title}" was reviewed and closed.`, link: link(t), actor: req.user });
  }
  finish(req, res, t);
});

/* ---------- conflicts ---------- */
router.post('/:id/conflict', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  const allowed = isDoer(t, req.user) || isManager(req.user) || (isWorker(req.user) && req.user.department === t.department && !outsourced(t));
  if (!allowed) return fail(res, 403, 'Only people working on this task can raise a conflict.');
  if (!ACTIVE_TASK.includes(t.status)) return fail(res, 400, 'Conflicts can only be raised on tasks that are not finished.');
  if (t.conflict.active) return fail(res, 400, 'A conflict is already open on this task.');
  const reason = req.body.reason?.trim();
  if (!reason) return fail(res, 400, 'Explain the conflict.');
  t.conflict = { active: true, reason, raisedBy: req.user._id, raisedAt: new Date(), count: (t.conflict.count || 0) + 1 };
  t.comments.push({ user: req.user._id, text: reason, kind: 'conflict' });
  t.log(req.user, 'Raised a conflict');
  await t.save();
  notify(await managerIds(), { type: 'conflict', title: `Conflict on ${t.code}`, message: `${req.user.name}: ${reason.slice(0, 160)}`, link: link(t), actor: req.user });
  finish(req, res, t);
});

router.post('/:id/conflict/resolve', async (req, res) => {
  if (!isManager(req.user)) return fail(res, 403, 'Only a coordinator or admin can resolve conflicts.');
  const t = await load(req, res); if (!t) return;
  if (!t.conflict.active) return fail(res, 400, 'There is no open conflict on this task.');
  const resolution = req.body.resolution?.trim();
  if (!resolution) return fail(res, 400, 'Write how the conflict was resolved.');
  const old = { priority: t.priority, order: t.order };
  if (ACTIVE_TASK.includes(t.status) && (req.body.priority || req.body.position)) {
    const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : t.priority;
    await placeTask(t, priority, req.body.position || null);
    if (old.priority !== priority) await compactGroup(old.priority, scopeOf(t));
  }
  t.conflict.active = false; t.conflict.resolvedBy = req.user._id; t.conflict.resolvedAt = new Date(); t.conflict.resolution = resolution;
  t.comments.push({ user: req.user._id, text: `Resolved: ${resolution}`, kind: 'conflict' });
  const moved = old.priority !== t.priority || old.order !== t.order;
  t.log(req.user, `Resolved the conflict${moved ? ` · now ${label(t.priority)} #${t.order}` : ''}`);
  await t.save();
  notify([t.conflict.raisedBy, t.assignee], { type: 'conflict', title: `Conflict on ${t.code} resolved`, message: `${req.user.name}: ${resolution.slice(0, 160)}`, link: link(t), actor: req.user });
  finish(req, res, t);
});

router.post('/:id/comments', async (req, res) => {
  const t = await load(req, res); if (!t) return;
  const text = req.body.text?.trim();
  if (!text) return fail(res, 400, 'Write a comment first.');
  t.comments.push({ user: req.user._id, text, kind: isManager(req.user) ? 'feedback' : 'comment' });
  await t.save();
  const doer = outsourced(t) ? t.vendor?.user : t.assignee;
  const recipients = isManager(req.user) ? [doer] : [doer, ...(await managerIds())];
  notify(recipients, { type: 'comment', title: `Comment on ${t.code}`, message: `${req.user.name}: ${text.slice(0, 160)}`, link: link(t), actor: req.user });
  finish(req, res, t);
});

router.delete('/:id', async (req, res) => {
    if (!isAdmin(req.user)) return fail(res, 403, 'Only an admin or director can delete tasks.');
  const t = await load(req, res); if (!t) return;
  const scope = scopeOf(t);
  await t.deleteOne();
  await compactGroup(t.priority, scope);
  await syncRequirement(t.requirement, req.user);
  res.json({ message: 'Deleted.' });
});

export default router;