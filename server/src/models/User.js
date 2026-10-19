import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DEPARTMENTS } from '../utils/config.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['admin', 'coordinator', 'staff', 'vendor'], default: 'staff' },
    department: { type: String, enum: [...Object.keys(DEPARTMENTS), null], default: null },
    company: { type: String, trim: true }, // external vendors
    phone: { type: String, trim: true },
    emailNotifications: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.matchPassword = function matchPassword(plain) { return bcrypt.compare(plain, this.password); };
userSchema.methods.toJSON = function toJSON() { const o = this.toObject(); delete o.password; return o; };

export default mongoose.model('User', userSchema);
