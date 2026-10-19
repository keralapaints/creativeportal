import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { DEPARTMENTS, WORK_DEPARTMENTS } from '../utils/config.js';

export async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Sign in to continue.' });
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id);
    if (!user || !user.active) return res.status(401).json({ message: 'This account is not active.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Your session has expired. Sign in again.' });
  }
}

export const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission for this action.' });
  next();
};

// Vendors only see their own outsourced tasks
export const noVendor = (req, res, next) => {
  if (req.user.role === 'vendor') return res.status(403).json({ message: 'Vendors can only open their outsourced tasks.' });
  next();
};

export const isManager = (u) => u.role === 'admin' || u.role === 'coordinator';
export const isVendor = (u) => u.role === 'vendor';
export const canRaise = (u) => isManager(u) || (u.role === 'staff' && Boolean(DEPARTMENTS[u.department]?.raises));
export const isWorker = (u) => u.role === 'staff' && WORK_DEPARTMENTS.includes(u.department);

// Mark usage / rate performance / request an update: raiser, raiser's department, marketing, or managers
export const canMarkUsage = (doc, u) =>
  isManager(u)
  || String(doc.raisedBy?._id || doc.raisedBy) === String(u._id)
  || (u.role === 'staff' && u.department && (u.department === doc.department || u.department === 'marketing'));

export const signToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
