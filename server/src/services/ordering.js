import Task from '../models/Task.js';
import { ACTIVE_TASK } from '../utils/config.js';

/*
 * Priority & Queue engine
 * Internal tasks are numbered 1..n inside a queue:
 *   - assigned tasks: one queue per staff member and priority
 *   - unassigned tasks: one queue per department and priority
 * Outsourced tasks are tracked separately and never get a number.
 */
export const scopeOf = (t) => (t.assignee
  ? { assignee: t.assignee._id || t.assignee }
  : { assignee: null, department: t.department });

const groupQuery = (scope, priority) => ({ ...scope, priority, sourcing: { $ne: 'outsourced' }, status: { $in: ACTIVE_TASK } });

// Put a task at a position (1-based) in its queue; others shift. Caller saves the task.
export async function placeTask(task, priority, position = null) {
  task.priority = priority;
  if (task.sourcing === 'outsourced') { task.order = null; return; }
  const others = await Task.find({ ...groupQuery(scopeOf(task), priority), _id: { $ne: task._id } })
    .select('_id').sort({ order: 1, createdAt: 1 });
  const list = others.map((t) => t._id);
  const idx = position ? Math.min(Math.max(Number(position) - 1, 0), list.length) : list.length;
  list.splice(idx, 0, task._id);
  const ops = list
    .map((id, i) => ({ id, order: i + 1 }))
    .filter(({ id }) => String(id) !== String(task._id))
    .map(({ id, order }) => ({ updateOne: { filter: { _id: id }, update: { $set: { order } } } }));
  if (ops.length) await Task.bulkWrite(ops);
  task.order = idx + 1;
}

// Renumber a queue 1..n after a task leaves it
export async function compactGroup(priority, scope) {
  if (!scope) return;
  const list = await Task.find(groupQuery(scope, priority)).select('_id').sort({ order: 1, createdAt: 1 });
  if (!list.length) return;
  await Task.bulkWrite(list.map((t, i) => ({ updateOne: { filter: { _id: t._id }, update: { $set: { order: i + 1 } } } })));
}

// Adds queueSize to each active internal task: the number is only shown when queueSize > 1
export async function annotateQueues(tasks) {
  const relevant = tasks.filter((t) => t.sourcing !== 'outsourced' && ACTIVE_TASK.includes(t.status));
  if (!relevant.length) return tasks;
  const rows = await Task.aggregate([
    { $match: { sourcing: { $ne: 'outsourced' }, status: { $in: ACTIVE_TASK } } },
    { $group: { _id: { a: '$assignee', d: { $cond: [{ $ifNull: ['$assignee', false] }, null, '$department'] }, p: '$priority' }, n: { $sum: 1 } } },
  ]);
  const key = (a, d, p) => `${a || ''}|${a ? '' : d}|${p}`;
  const map = new Map(rows.map((r) => [key(r._id.a ? String(r._id.a) : '', r._id.d, r._id.p), r.n]));
  relevant.forEach((t) => {
    const a = t.assignee ? String(t.assignee._id || t.assignee) : '';
    t.queueSize = map.get(key(a, t.department, t.priority)) || 1;
  });
  return tasks;
}