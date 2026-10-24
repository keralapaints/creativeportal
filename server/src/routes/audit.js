import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { protect, allow } from '../middleware/auth.js';
import { escapeRx } from '../utils/dates.js';

const router = Router();
router.use(protect, allow('admin', 'director', 'coordinator'));

router.get('/', async (req, res) => {
  const { entity, q, before } = req.query;
  const f = {};
  if (entity) f.entity = entity;
  if (q) { const rx = new RegExp(escapeRx(q), 'i'); f.$or = [{ code: rx }, { message: rx }]; }
  if (before) f.createdAt = { $lt: new Date(before) };
  const items = await AuditLog.find(f).populate('user', 'name role department').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items, next: items.length === 100 ? items[items.length - 1].createdAt : null });
});

export default router;