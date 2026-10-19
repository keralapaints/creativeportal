import Requirement from '../models/Requirement.js';
import Task from '../models/Task.js';
import { OPEN_REQUIREMENT, REQUIREMENT_STATUS } from '../utils/config.js';
import { notify, managerIds } from './notify.js';

const STEP = { new: 0, approved: 1, assigned: 2, in_progress: 3 };

/**
 * Keep an open requirement in line with its tasks:
 *   no tasks         → stays New / Approved
 *   tasks created    → Assigned (to staff, a department or a vendor)
 *   any task started → In Progress
 * During an update request it stays "Update Needed" until the coordinator fulfils it again.
 * Fulfilled and Completed are set by people.
 */
export async function syncRequirement(id, actor) {
  const r = await Requirement.findById(id);
  if (!r || !OPEN_REQUIREMENT.includes(r.status)) return;
  const tasks = await Task.find({ requirement: id, status: { $ne: 'cancelled' } }).select('status');

  let status = r.status;
  if (r.status !== 'update_needed') {
    if (!tasks.length) status = r.status === 'new' ? 'new' : 'approved';
    else if (tasks.some((t) => ['in_progress', 'paused', 'completed', 'closed'].includes(t.status))) status = 'in_progress';
    else status = 'assigned';
  }

  const ready = tasks.length > 0 && tasks.every((t) => t.status === 'closed');
  const becameReady = ready && !r.readyToFulfill;
  if (status === r.status && ready === r.readyToFulfill) return;

  const before = r.status;
  r.readyToFulfill = ready;
  if (status !== before) {
    r.status = status;
    if (status === 'assigned' && !r.assignedAt) r.assignedAt = new Date();
    if (['assigned', 'in_progress'].includes(status) && !r.approvedAt) r.approvedAt = new Date();
    r.log(actor, `Status changed to ${REQUIREMENT_STATUS[status]}`);
  }
  if (becameReady) r.log(actor, r.status === 'update_needed' ? 'Updated work closed. Ready to mark fulfilled again' : 'All tasks closed. Ready to mark fulfilled');
  await r.save();

  const link = `/requirements/${r._id}`;
  if (status !== before && STEP[status] > STEP[before]) {
    notify([r.raisedBy], { type: 'status', title: `${r.code}: ${REQUIREMENT_STATUS[status]}`, message: `"${r.title}" is now ${REQUIREMENT_STATUS[status].toLowerCase()}.`, link, actor });
  }
  if (becameReady) {
    notify(await managerIds(), {
      type: 'status', title: `${r.code} ready to fulfill`,
      message: r.status === 'update_needed'
        ? `The updated work for "${r.title}" is reviewed. Mark it fulfilled again to notify the raiser.`
        : `Every task for "${r.title}" is closed. Mark it fulfilled to notify the raiser.`,
      link, actor,
    });
  }
}