import { Router } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { protect, isManager } from '../middleware/auth.js';
import { notify } from '../services/notify.js';
import { DEPARTMENTS } from '../utils/config.js';

const router = Router();
router.use(protect);

router.get('/', async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.read = false;
  if (req.query.type) filter.type = req.query.type;
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 100),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ items, unread });
});

router.get('/unread-count', async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
});

router.post('/read-all', async (req, res) => {
  const f = { user: req.user._id, read: false };
  if (req.body?.type) f.type = req.body.type;
  await Notification.updateMany(f, { read: true });
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Not found.' });
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  res.json({ ok: true });
});

// Admin / coordinator: custom alert to staff (popup on their dashboard + email)
router.post('/alert', async (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ message: 'Only a coordinator or admin can send alerts.' });
  const { target = 'all', department, role, userIds = [], title, message, link } = req.body;
  if (!title?.trim() || !message?.trim()) return res.status(400).json({ message: 'Add a title and a message.' });
  const f = { active: true };
  if (target === 'department') { if (!DEPARTMENTS[department]) return res.status(400).json({ message: 'Pick a department.' }); f.department = department; }
  else if (target === 'role') { if (!['director', 'admin', 'coordinator', 'staff', 'vendor'].includes(role)) return res.status(400).json({ message: 'Pick a role.' }); f.role = role; }
  else if (target === 'users') { f._id = { $in: userIds.filter((id) => mongoose.isValidObjectId(id)) }; }
  const users = await User.find(f).select('_id');
  const ids = users.map((u) => u._id).filter((id) => String(id) !== String(req.user._id));
  if (!ids.length) return res.status(400).json({ message: 'Nobody matches that selection.' });
  await notify(ids, { type: 'alert', title: title.trim(), message: `${message.trim()} — ${req.user.name}`, link: link || '/', actor: req.user });
  res.json({ sent: ids.length });
});

export default router;