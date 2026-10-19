import Task from '../models/Task.js';
import { DAY } from '../utils/dates.js';
import { notify, managerIds } from './notify.js';

const RUNNING = ['open', 'assigned', 'in_progress']; // paused projects don't get reminders
const doerOf = (t) => (t.sourcing === 'outsourced' ? t.vendor?.user : t.assignee);

async function run() {
  const now = new Date();
  const managers = await managerIds();

  const soon = await Task.find({ status: { $in: RUNNING }, deadline: { $gte: now, $lte: new Date(+now + DAY) }, reminderSentAt: null });
  for (const t of soon) {
    const doer = doerOf(t);
    await notify(doer ? [doer] : managers, {
      type: 'reminder', title: `${t.code} is due soon`,
      message: `"${t.title}" is due ${t.deadline.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.${doer ? '' : ' Nobody is assigned yet.'}`,
      link: `/tasks/${t._id}`,
    });
    t.reminderSentAt = now;
    await t.save();
  }

  const late = await Task.find({ status: { $in: RUNNING }, deadline: { $lt: now }, overdueNotifiedAt: null });
  for (const t of late) {
    const doer = doerOf(t);
    await notify([...(doer ? [doer] : []), ...managers], {
      type: 'reminder', title: `${t.code} is overdue`, message: `"${t.title}" passed its deadline and is not completed.`, link: `/tasks/${t._id}`,
    });
    t.overdueNotifiedAt = now;
    await t.save();
  }
}

export function startReminders() {
  const tick = () => run().catch((e) => console.error('reminders failed', e.message));
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 60 * 1000);
}