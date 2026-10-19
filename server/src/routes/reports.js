import { Router } from 'express';
import mongoose from 'mongoose';
import Requirement from '../models/Requirement.js';
import Task from '../models/Task.js';
import Campaign from '../models/Campaign.js';
import { categoryMap } from '../models/Category.js';
import { protect, isManager } from '../middleware/auth.js';
import { DEPARTMENTS, REQUIREMENT_TYPES, REQUIREMENT_STATUS, PRIORITIES, PERFORMANCE, ACTIVE_TASK, OPEN_REQUIREMENT } from '../utils/config.js';
import { DAY } from '../utils/dates.js';

const router = Router();
router.use(protect);

const valid = (id) => mongoose.isValidObjectId(id);

router.get('/', async (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ message: 'Reports are for coordinators and admins.' });
  const q = req.query;
  const to = q.to ? new Date(`${q.to}T23:59:59`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00`) : new Date(+to - 30 * DAY);
  const range = { $gte: from, $lte: to };
  const now = new Date();

  // ---- filters ----
  const rf = { createdAt: range };
  if (q.department) rf.department = q.department;
  if (q.status) rf.status = q.status === 'ongoing' ? { $in: ['approved', 'assigned', 'in_progress'] } : q.status;
  if (q.priority) rf.priority = q.priority;
  if (q.type) rf.type = q.type;
  if (q.usageType) rf.usageType = q.usageType;
  if (q.campaign && valid(q.campaign)) rf.campaign = new mongoose.Types.ObjectId(q.campaign);
  if (q.sourcing) rf.sourcing = q.sourcing;

  const reqs = await Requirement.find(rf).select('code department type usageType status priority sourcing campaign createdAt fulfilledAt usage performance updateCount').lean();
  const reqIds = reqs.map((r) => r._id);

  const tf = { requirement: { $in: reqIds } };
  if (q.workDepartment) tf.department = q.workDepartment;
  if (q.staff && valid(q.staff)) tf.assignee = q.staff;
  if (q.sourcing) tf.sourcing = q.sourcing === 'outsourced' ? 'outsourced' : { $ne: 'outsourced' };
  const tasks = await Task.find(tf)
    .select('code title department sourcing priority status deadline assignedAt submittedAt closedAt reworkCount requirement assignee vendor')
    .populate([{ path: 'assignee', select: 'name department' }, { path: 'requirement', select: 'code type usageType department campaign' }]).lean();

  const cats = await categoryMap();
  const camps = await Campaign.find().select('name').lean();
  const campName = Object.fromEntries(camps.map((c) => [String(c._id), c.name]));
  const days = (a, b) => (a && b ? (new Date(b) - new Date(a)) / DAY : null);
  const avg = (xs) => { const v = xs.filter((x) => x !== null); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null; };
  const isOverdue = (t) => t.deadline && new Date(t.deadline) < now && ACTIVE_TASK.includes(t.status);
  const closed = tasks.filter((t) => t.status === 'closed');
  const onTimePct = (list) => { const w = list.filter((t) => t.deadline && t.submittedAt); return w.length ? Math.round((w.filter((t) => new Date(t.submittedAt) <= new Date(t.deadline)).length / w.length) * 100) : null; };

  // ---- key reports ----
  const statusBreakdown = Object.entries(REQUIREMENT_STATUS).map(([k, label]) => ({ key: k, label, count: reqs.filter((r) => r.status === k).length })).filter((x) => x.count);
  const priorityFunnel = PRIORITIES.map((p) => ({ key: p, active: tasks.filter((t) => t.priority === p && ACTIVE_TASK.includes(t.status)).length, total: tasks.filter((t) => t.priority === p).length }));

  const people = {};
  tasks.filter((t) => t.assignee && t.sourcing !== 'outsourced').forEach((t) => {
    const id = String(t.assignee._id);
    people[id] ||= { name: t.assignee.name, department: t.assignee.department, list: [] };
    people[id].list.push(t);
  });
  const byStaff = Object.values(people).map((p) => ({
    name: p.name, department: p.department,
    total: p.list.length,
    active: p.list.filter((t) => ACTIVE_TASK.includes(t.status)).length,
    closed: p.list.filter((t) => t.status === 'closed').length,
    overdue: p.list.filter(isOverdue).length,
    avgDays: avg(p.list.filter((t) => t.status === 'closed').map((t) => days(t.assignedAt, t.submittedAt))),
    onTime: onTimePct(p.list),
    rework: p.list.reduce((s, t) => s + (t.reworkCount || 0), 0),
  })).sort((a, b) => b.total - a.total);

  const out = tasks.filter((t) => t.sourcing === 'outsourced');
  const vendors = {};
  out.forEach((t) => {
    const k = t.vendor?.name || 'Unknown';
    vendors[k] ||= { name: k, total: 0, active: 0, closed: 0, cost: 0 };
    vendors[k].total += 1; vendors[k].cost += t.vendor?.cost || 0;
    if (ACTIVE_TASK.includes(t.status)) vendors[k].active += 1;
    if (t.status === 'closed') vendors[k].closed += 1;
  });
  const outsourced = {
    counts: {
      pending: out.filter((t) => ['open', 'assigned'].includes(t.status)).length,
      ongoing: out.filter((t) => t.status === 'in_progress').length,
      paused: out.filter((t) => t.status === 'paused').length,
      fulfilled: out.filter((t) => ['completed', 'closed'].includes(t.status)).length,
    },
    cost: out.reduce((s, t) => s + (t.vendor?.cost || 0), 0),
    vendors: Object.values(vendors).sort((a, b) => b.total - a.total),
  };

  const campaignMap = {};
  reqs.filter((r) => r.campaign).forEach((r) => {
    const k = String(r.campaign);
    campaignMap[k] ||= { key: k, name: campName[k] || 'Campaign', total: 0, used: 0, ...Object.fromEntries(Object.keys(PERFORMANCE).map((p) => [p, 0])) };
    campaignMap[k].total += 1;
    if (r.status === 'task_completed') campaignMap[k].used += 1;
    if (r.performance?.rating) campaignMap[k][r.performance.rating] += 1;
  });

  const performance = Object.entries(PERFORMANCE).map(([k, label]) => ({ key: k, label, count: reqs.filter((r) => r.performance?.rating === k).length }));

  // 6-month trend (independent of the range)
  const sixAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);
  const trendReqs = await Requirement.find({ $or: [{ createdAt: { $gte: sixAgo } }, { fulfilledAt: { $gte: sixAgo } }] }).select('createdAt fulfilledAt').lean();
  const trend = [];
  for (let i = 0; i < 6; i += 1) {
    const s = new Date(sixAgo.getFullYear(), sixAgo.getMonth() + i, 1);
    const e = new Date(sixAgo.getFullYear(), sixAgo.getMonth() + i + 1, 1);
    trend.push({
      month: s.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
      raised: trendReqs.filter((r) => r.createdAt >= s && r.createdAt < e).length,
      completed: trendReqs.filter((r) => r.fulfilledAt && r.fulfilledAt >= s && r.fulfilledAt < e).length,
    });
  }

  res.json({
    from, to,
    totals: {
      requirements: reqs.length,
      pending: reqs.filter((r) => r.status === 'new').length,
      ongoing: reqs.filter((r) => ['approved', 'assigned', 'in_progress'].includes(r.status)).length,
      fulfilled: reqs.filter((r) => r.status === 'fulfilled').length,
      updateNeeded: reqs.filter((r) => r.status === 'update_needed').length,
      completed: reqs.filter((r) => r.status === 'task_completed').length,
      updateRequests: reqs.reduce((s, r) => s + (r.updateCount || 0), 0),
      tasks: tasks.length,
      tasksClosed: closed.length,
      overdueTasks: tasks.filter(isOverdue).length,
      avgTurnaround: avg(closed.map((t) => days(t.assignedAt, t.submittedAt))),
      onTime: onTimePct(closed),
      outsourcedCost: outsourced.cost,
    },
    statusBreakdown,
    priorityFunnel,
    byStaff,
    outsourced,
    campaigns: Object.values(campaignMap).sort((a, b) => b.total - a.total),
    performance,
    requirementsByDepartment: Object.entries(DEPARTMENTS).filter(([, d]) => d.raises).map(([k, d]) => {
      const mine = reqs.filter((r) => r.department === k);
      return { key: k, label: d.label, raised: mine.length, open: mine.filter((r) => OPEN_REQUIREMENT.includes(r.status)).length, fulfilled: mine.filter((r) => r.status === 'fulfilled').length, updates: mine.reduce((s, r) => s + (r.updateCount || 0), 0), used: mine.filter((r) => r.status === 'task_completed').length };
    }),
    requirementsByUsage: Object.entries(cats).map(([k, v]) => ({ key: k, label: v.label, raised: reqs.filter((r) => r.usageType === k).length, used: reqs.filter((r) => r.usageType === k && r.status === 'task_completed').length })).filter((x) => x.raised),
    requirementsByType: Object.entries(REQUIREMENT_TYPES).map(([k, label]) => ({ key: k, label, count: reqs.filter((r) => r.type === k).length })).filter((x) => x.count).sort((a, b) => b.count - a.count),
    trend,
    rows: tasks.map((t) => ({
      task: t.code, title: t.title, requirement: t.requirement?.code,
      category: cats[t.requirement?.usageType]?.label || '', format: REQUIREMENT_TYPES[t.requirement?.type] || '',
      campaign: campName[String(t.requirement?.campaign)] || '',
      raisedBy: DEPARTMENTS[t.requirement?.department]?.label || '', department: DEPARTMENTS[t.department]?.label,
      sourcing: t.sourcing || 'internal', doneBy: t.sourcing === 'outsourced' ? (t.vendor?.name || '') : (t.assignee?.name || ''),
      cost: t.vendor?.cost ?? '', priority: t.priority, status: t.status,
      deadline: t.deadline, submitted: t.submittedAt, closed: t.closedAt, rework: t.reworkCount || 0, overdue: isOverdue(t) ? 'yes' : '',
    })),
  });
});

export default router;