import { Router } from 'express';
import User from '../models/User.js';
import { protect, allow, isManager } from '../middleware/auth.js';
import { DEPARTMENTS } from '../utils/config.js';

const router = Router();
router.use(protect);

router.get('/', async (req, res) => {
  if (req.user.role === 'vendor') return res.status(403).json({ message: 'Not available for vendors.' });
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  if (req.query.role) filter.role = req.query.role;
  const manager = isManager(req.user);
  if (!manager || req.query.active === 'true') filter.active = true;
  if (!manager) filter.role = { $ne: 'vendor' };
  const users = await User.find(filter)
    .select(manager ? 'name email role department company phone active emailNotifications createdAt' : 'name role department')
    .sort({ role: 1, department: 1, name: 1 });
  res.json(users);
});

function validate({ role = 'staff', department }) {
  if (!['admin', 'coordinator', 'staff', 'vendor'].includes(role)) return 'Pick a valid role.';
  if (department && !DEPARTMENTS[department]) return 'Pick a valid department.';
  if (role === 'staff' && !department) return 'Staff need a department.';
  return null;
}

router.post('/', allow('admin'), async (req, res) => {
  const { name, email, password, role = 'staff', phone, company } = req.body;
  const department = role === 'vendor' ? null : (req.body.department || null);
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ message: 'Enter a name, email and a password of at least 6 characters.' });
  const err = validate({ role, department });
  if (err) return res.status(400).json({ message: err });
  if (role === 'vendor' && !company?.trim()) return res.status(400).json({ message: 'Enter the vendor company name.' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ message: 'Someone already uses this email.' });
  res.status(201).json(await User.create({ name, email, password, role, department, phone, company }));
});

router.patch('/:id', allow('admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  const role = req.body.role ?? user.role;
  let department = req.body.department === undefined ? user.department : (req.body.department || null);
  if (role === 'vendor') department = null;
  const err = validate({ role, department });
  if (err) return res.status(400).json({ message: err });
  if (String(user._id) === String(req.user._id) && (req.body.active === false || (req.body.role && req.body.role !== 'admin'))) {
    return res.status(400).json({ message: 'You cannot deactivate or demote your own account.' });
  }
  ['name', 'email', 'role', 'phone', 'active', 'emailNotifications', 'company'].forEach((f) => { if (req.body[f] !== undefined) user[f] = req.body[f]; });
  user.department = department;
  if (req.body.password) {
    if (req.body.password.length < 6) return res.status(400).json({ message: 'Password needs at least 6 characters.' });
    user.password = req.body.password;
  }
  await user.save();
  res.json(user);
});

export default router;