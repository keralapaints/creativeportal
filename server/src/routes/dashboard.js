import { Router } from 'express';
import Requirement from '../models/Requirement.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { protect, isManager, isWorker, isVendor, canRaise } from '../middleware/auth.js';
import { DEPARTMENTS, ACTIVE_TASK, OPEN_REQUIREMENT, FULFILLED_REQUIREMENT, PRIORITIES } from '../utils/config.js';
import { endOfToday } from '../utils/dates.js';
import { annotateQueues } from '../services/ordering.js';
import { funnelSort } from './tasks.js';

const router = Router();
router.use(protect);

const TASK_POP = [
  { path: 'requirement', select: 'code title type usageType department status campaign performance raisedBy', populate: [{ path: 'campaign', select: 'name' }, { path: 'raisedBy', select: 'name department' }] },
  { path: 'assignee', select: 'name department' },
  { path: 'vendor.user', select: 'name company' },
];
const TASK_FIELDS = '-activity -comments';
const REQ_FIELDS = 'code title type usageType department priority deadline status readyToFulfill raisedBy createdAt fulfilledAt usage updateCount updateRequests sourcing campaign performance';
const REQ_POP = [{ path: 'raisedBy', select: 'name' }, { path: 'campaign', select: 'name' }];

async function withTaskSummary(list) {
  const tasks = await Task.find({ requirement: { $in: list.map((r) => r._id) } }).select('requirement status assignee department sourcing vendor.name').populate('assignee', 'name').lean();
  const by = {};
  tasks.forEach((t) => { (by[t.requirement] ||= []).push(t); });
  return list.map((r) => ({ ...r, tasks: by[r._id] || [] }));
}

router.get('/', async (req, res) => {
  const u = req.user;
  const now = new Date();
  const eod = endOfToday();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const out = { unread: await Notification.countDocuments({ user: u._id, read: false }) };

  /* ---------- External vendor: only their outsourced work ---------- */
  if (isVendor(u)) {
    const mine = await Task.find({ 'vendor.user': u._id, status: { $ne: 'cancelled' } }).select(TASK_FIELDS).populate(TASK_POP).sort({ deadline: 1 }).lean();
    out.vendor = {
      tasks: mine,
      counts: {
        pending: mine.filter((t) => ['open', 'assigned'].includes(t.status)).length,
        ongoing: mine.filter((t) => t.status === 'in_progress').length,
        paused: mine.filter((t) => t.status === 'paused').length,
        fulfilled: mine.filter((t) => ['completed', 'closed'].includes(t.status)).length,
      },
    };
    return res.json(out);
  }

  /* ---------- Coordinator / Admin ---------- */
  if (isManager(u)) {
    const [reqs, active, review, usageUpdates, closedThisMonth, usedThisMonth, staff] = await Promise.all([
      Requirement.find({ status: { $in: OPEN_REQUIREMENT } }).select(REQ_FIELDS).populate(REQ_POP).sort({ createdAt: -1 }).lean(),
      Task.find({ status: { $in: ACTIVE_TASK } }).select(TASK_FIELDS).populate(TASK_POP).lean(),
      Task.find({ status: 'completed' }).select(TASK_FIELDS).populate(TASK_POP).sort({ submittedAt: 1 }).lean(),
      Requirement.find({ status: 'task_completed' }).select(REQ_FIELDS).populate([...REQ_POP, { path: 'usage.by', select: 'name' }]).sort({ 'usage.at': -1 }).limit(8).lean(),
      Task.countDocuments({ status: 'closed', closedAt: { $gte: monthStart } }),
      Requirement.countDocuments({ status: 'task_completed', 'usage.at': { $gte: monthStart } }),
      User.find({ role: 'staff', active: true, department: { $in: ['creative', 'production'] } }).select('name department').sort({ department: 1, name: 1 }).lean(),
    ]);
    active.sort(funnelSort);
    const internal = active.filter((t) => t.sourcing !== 'outsourced');
    const outsourced = active.filter((t) => t.sourcing === 'outsourced');
    const overdue = active.filter((t) => t.deadline && new Date(t.deadline) < now);

    // Per-staff queue summary for the Priority Funnel
    const queues = staff.map((p) => {
      const mine = internal.filter((t) => String(t.assignee?._id) === String(p._id));
      return {
        user: p,
        ...Object.fromEntries(PRIORITIES.map((pr) => [pr, mine.filter((t) => t.priority === pr).length])),
        total: mine.length,
        overdue: mine.filter((t) => t.deadline && new Date(t.deadline) < now).length,
      };
    });
    const unassigned = Object.fromEntries(['creative', 'production'].map((d) => [d, internal.filter((t) => !t.assignee && t.department === d).length]));

    const byDepartment = Object.entries(DEPARTMENTS).map(([key, d]) => {
      const row = { key, label: d.label, raises: d.raises, works: d.works, requirementsOpen: reqs.filter((r) => r.department === key).length };
      if (d.works) {
        const mine = internal.filter((t) => t.department === key);
        row.tasks = {
          open: mine.filter((t) => t.status === 'open').length,
          assigned: mine.filter((t) => t.status === 'assigned').length,
          in_progress: mine.filter((t) => t.status === 'in_progress').length,
          review: review.filter((t) => t.department === key && t.sourcing !== 'outsourced').length,
          overdue: mine.filter((t) => t.deadline && new Date(t.deadline) < now).length,
        };
      }
      return row;
    });

    Object.assign(out, {
      counts: {
        pendingReview: reqs.filter((r) => r.status === 'new').length,
        toAssign: reqs.filter((r) => r.status === 'approved').length,
        readyToFulfill: reqs.filter((r) => r.readyToFulfill).length,
        updateRequests: reqs.filter((r) => r.status === 'update_needed').length,
        unassigned: internal.filter((t) => t.status === 'open').length,
        awaitingReview: review.length,
        conflicts: active.filter((t) => t.conflict?.active).length,
        overdue: overdue.length,
        outsourcedActive: outsourced.length,
        closedThisMonth,
        usedThisMonth,
      },
      pendingReview: reqs.filter((r) => r.status === 'new').slice(0, 10),
      toAssign: reqs.filter((r) => r.status === 'approved').slice(0, 10),
      readyToFulfill: reqs.filter((r) => r.readyToFulfill),
      updateRequests: reqs.filter((r) => r.status === 'update_needed'),
      usageUpdates,
      queues,
      unassignedCounts: unassigned,
      outsourced: {
        tasks: outsourced.slice(0, 8),
        counts: {
          pending: outsourced.filter((t) => ['open', 'assigned'].includes(t.status)).length,
          ongoing: outsourced.filter((t) => t.status === 'in_progress').length,
          paused: outsourced.filter((t) => t.status === 'paused').length,
          fulfilled: review.filter((t) => t.sourcing === 'outsourced').length,
        },
      },
      conflicts: active.filter((t) => t.conflict?.active),
      today: active.filter((t) => t.deadline && new Date(t.deadline) <= eod),
      pendingTaskReview: review.slice(0, 15),
      byDepartment,
    });
    if (u.role === 'admin') {
      const users = await User.aggregate([{ $match: { active: true } }, { $group: { _id: '$role', n: { $sum: 1 } } }]);
      out.users = Object.fromEntries(users.map((x) => [x._id, x.n]));
    }
  }

  /* ---------- Staff (Creative / Production): every task of theirs, client splits into tabs ---------- */
  if (isWorker(u)) {
    const [mine, closed, available] = await Promise.all([
      Task.find({ assignee: u._id, sourcing: { $ne: 'outsourced' }, status: { $in: [...ACTIVE_TASK, 'completed'] } }).select(TASK_FIELDS).populate(TASK_POP).lean(),
      Task.find({ assignee: u._id, status: 'closed' }).select(TASK_FIELDS).populate(TASK_POP).sort({ closedAt: -1 }).limit(40).lean(),
      Task.find({ department: u.department, sourcing: { $ne: 'outsourced' }, status: 'open', allowSelfAssign: true, assignee: null }).select(TASK_FIELDS).populate(TASK_POP).lean(),
    ]);
    mine.sort(funnelSort); available.sort(funnelSort);
    await annotateQueues([...mine, ...available]);
    out.staff = {
      tasks: [...mine, ...closed],
      available,
      today: mine.filter((t) => ACTIVE_TASK.includes(t.status) && t.deadline && new Date(t.deadline) <= eod),
      closedThisMonth: closed.filter((t) => t.closedAt && new Date(t.closedAt) >= monthStart).length,
    };
  }

  /* ---------- Requirement raiser (Marketing / Tech / Outlet / Production) ---------- */
  if (!isManager(u) && canRaise(u)) {
    const marketing = u.department === 'marketing';
    const list = await Requirement.find({ department: u.department, status: { $ne: 'cancelled' } })
      .select(REQ_FIELDS).populate(REQ_POP).sort({ createdAt: -1 }).limit(80).lean();
    // Marketing marks usage for every fulfilled creative, not only its own
    const fulfilledAll = marketing
      ? await Requirement.find({ status: { $in: FULFILLED_REQUIREMENT } }).select(REQ_FIELDS).populate(REQ_POP).sort({ fulfilledAt: -1 }).lean()
      : null;
    const rows = await withTaskSummary(list);
    const fulfilled = fulfilledAll || rows.filter((r) => FULFILLED_REQUIREMENT.includes(r.status));
    const ongoing = rows.filter((r) => OPEN_REQUIREMENT.includes(r.status) && r.status !== 'update_needed');
    out.raiser = {
      marketing,
      raised: rows.slice(0, 12),
      ongoing,
      fulfilled,
      updateNeeded: rows.filter((r) => r.status === 'update_needed'),
      completed: rows.filter((r) => r.status === 'task_completed').slice(0, 12),
      counts: {
        raised: rows.length,
        ongoing: ongoing.length,
        fulfilled: fulfilled.length,
        updateNeeded: rows.filter((r) => r.status === 'update_needed').length,
        completed: rows.filter((r) => r.status === 'task_completed').length,
      },
    };
  }

  res.json(out);
});

export default router;