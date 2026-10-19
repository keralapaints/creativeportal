import { Router } from 'express';
import Requirement from '../models/Requirement.js';
import { protect, noVendor } from '../middleware/auth.js';
import { DAY } from '../utils/dates.js';

const router = Router();
router.use(protect, noVendor);

// Dashboard analytics shown to every role: totals + last 30 days trend
router.get('/overview', async (_req, res) => {
  const since = new Date(Date.now() - 29 * DAY); since.setHours(0, 0, 0, 0);
  const [byStatus, recent] = await Promise.all([
    Requirement.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Requirement.find({ $or: [{ createdAt: { $gte: since } }, { fulfilledAt: { $gte: since } }, { 'usage.at': { $gte: since } }, { 'updateRequests.at': { $gte: since } }] })
      .select('createdAt fulfilledAt usage.at updateRequests.at').lean(),
  ]);
  const s = Object.fromEntries(byStatus.map((x) => [x._id, x.n]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(+since + i * DAY);
    return { day: d.toISOString().slice(0, 10), raised: 0, fulfilled: 0, completed: 0, updateNeeded: 0 };
  });
  const bump = (date, key) => {
    if (!date) return;
    const i = Math.floor((new Date(date) - since) / DAY);
    if (i >= 0 && i < 30) days[i][key] += 1;
  };
  recent.forEach((r) => {
    bump(r.createdAt, 'raised');
    bump(r.fulfilledAt, 'fulfilled');
    bump(r.usage?.at, 'completed');
    (r.updateRequests || []).forEach((u) => bump(u.at, 'updateNeeded'));
  });
  res.json({
    counts: {
      total: Object.entries(s).filter(([k]) => k !== 'cancelled').reduce((a, [, n]) => a + n, 0),
      pending: s.new || 0,
      ongoing: (s.approved || 0) + (s.assigned || 0) + (s.in_progress || 0),
      fulfilled: s.fulfilled || 0,
      updateNeeded: s.update_needed || 0,
      completed: s.task_completed || 0,
    },
    trend: days,
  });
});

export default router;