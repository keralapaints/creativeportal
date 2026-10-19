import { Router } from 'express';
import User from '../models/User.js';
import { protect, signToken } from '../middleware/auth.js';

const router = Router();

// Tells the client whether the first admin still needs to be created.
router.get('/status', async (_req, res) => {
  const count = await User.estimatedDocumentCount();
  res.json({ needsSetup: count === 0 });
});

router.post('/setup', async (req, res) => {
  const count = await User.estimatedDocumentCount();
  if (count > 0) return res.status(400).json({ message: 'Setup is already done. Sign in instead.' });
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: 'Enter a name, email and a password of at least 6 characters.' });
  }
  const user = await User.create({ name, email, password, role: 'admin' });
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase().trim() }).select('+password');
  if (!user || !(await user.matchPassword(password || ''))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  if (!user.active) return res.status(403).json({ message: 'This account has been deactivated. Contact your admin.' });
  res.json({ token: signToken(user), user });
});

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

router.patch('/preferences', protect, async (req, res) => {
  if (typeof req.body.emailNotifications === 'boolean') req.user.emailNotifications = req.body.emailNotifications;
  await req.user.save();
  res.json({ user: req.user });
});

router.patch('/password', protect, async (req, res) => {
  const { current, next } = req.body;
  if (!next || next.length < 6) return res.status(400).json({ message: 'New password needs at least 6 characters.' });
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(current || ''))) {
    return res.status(400).json({ message: 'Current password is incorrect.' });
  }
  user.password = next;
  await user.save();
  res.json({ message: 'Password changed.' });
});

export default router;