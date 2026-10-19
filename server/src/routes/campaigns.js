import { Router } from 'express';
import mongoose from 'mongoose';
import Campaign from '../models/Campaign.js';
import Requirement from '../models/Requirement.js';
import { protect, noVendor, isManager } from '../middleware/auth.js';
import { PERFORMANCE } from '../utils/config.js';

const router = Router();
router.use(protect, noVendor);

const canManage = (u) => isManager(u) || u.department === 'marketing';

// List with usage + performance summary per campaign
router.get('/', async (req, res) => {
  const f = req.query.all === 'true' ? {} : { active: true };
  const list = await Campaign.find(f).sort({ active: -1, startDate: -1, name: 1 }).lean();
  const stats = await Requirement.aggregate([
    { $match: { campaign: { $in: list.map((c) => c._id) }, status: { $ne: 'cancelled' } } },
    { $group: { _id: { c: '$campaign', s: '$status', p: '$performance.rating' }, n: { $sum: 1 } } },
  ]);
  const by = {};
  stats.forEach(({ _id, n }) => {
    const k = String(_id.c);
    by[k] ||= { total: 0, used: 0, performance: Object.fromEntries(Object.keys(PERFORMANCE).map((p) => [p, 0])) };
    by[k].total += n;
    if (_id.s === 'task_completed') by[k].used += n;
    if (_id.p) by[k].performance[_id.p] += n;
  });
  res.json(list.map((c) => ({ ...c, stats: by[String(c._id)] || { total: 0, used: 0, performance: {} } })));
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Campaign not found.' });
  const c = await Campaign.findById(req.params.id).populate('createdBy', 'name').lean();
  if (!c) return res.status(404).json({ message: 'Campaign not found.' });
  const requirements = await Requirement.find({ campaign: c._id })
    .select('code title type usageType status performance usage department deadline priority raisedBy createdAt')
    .populate('raisedBy', 'name').sort({ createdAt: -1 }).lean();
  res.json({ ...c, requirements });
});

router.post('/', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ message: 'Only marketing or a coordinator can create campaigns.' });
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ message: 'Give the campaign a name.' });
  const c = await Campaign.create({
    name, description: req.body.description, startDate: req.body.startDate || undefined,
    endDate: req.body.endDate || undefined, createdBy: req.user._id,
  });
  res.status(201).json(c);
});

router.patch('/:id', async (req, res) => {
  if (!canManage(req.user)) return res.status(403).json({ message: 'Only marketing or a coordinator can edit campaigns.' });
  const c = await Campaign.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Campaign not found.' });
  ['name', 'description', 'active'].forEach((f) => { if (req.body[f] !== undefined) c[f] = req.body[f]; });
  ['startDate', 'endDate'].forEach((f) => { if (req.body[f] !== undefined) c[f] = req.body[f] || undefined; });
  await c.save();
  res.json(c);
});

export default router;