import mongoose from 'mongoose';
import { WORK_DEPARTMENTS, PRIORITIES, TASK_STATUS } from '../utils/config.js';
import { audit } from './AuditLog.js';

const { Schema } = mongoose;

const commentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['comment', 'feedback', 'conflict', 'update'], default: 'comment' },
  at: { type: Date, default: Date.now },
});

const activitySchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: 'User' }, message: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const taskSchema = new Schema(
  {
    code: { type: String, unique: true },
    requirement: { type: Schema.Types.ObjectId, ref: 'Requirement', required: true },
    title: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    department: { type: String, enum: WORK_DEPARTMENTS, required: true },

    // Internal tasks sit in a priority queue per staff member (or per department while unassigned)
    sourcing: { type: String, enum: ['internal', 'outsourced'], default: 'internal' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    order: { type: Number, default: null },
    deadline: Date,

    allowSelfAssign: { type: Boolean, default: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: Date,
    selfAssigned: { type: Boolean, default: false },

    // Outsourced projects
    vendor: {
      name: String,
      contact: String, // person
      phone: String,
      email: String,
      cost: Number,
      user: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // vendor login (limited access)
    },
    pausedAt: Date,
    pauseReason: String,

    status: { type: String, enum: Object.keys(TASK_STATUS), default: 'open' },
    startedAt: Date,
    submittedAt: Date,
    completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    driveLink: String,
    driveFileName: String,
    driveChecked: { type: Boolean, default: false },
    submissionNote: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: Date,
    closedAt: Date,
    reworkCount: { type: Number, default: 0 },

    conflict: {
      active: { type: Boolean, default: false },
      reason: String,
      raisedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      raisedAt: Date,
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      resolvedAt: Date,
      resolution: String,
      count: { type: Number, default: 0 },
    },

    update: {
      active: { type: Boolean, default: false },
      round: { type: Number, default: 0 },
      reason: String,
      description: String,
      references: [String],
      requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      at: Date,
    },

    reminderSentAt: Date,
    overdueNotifiedAt: Date,
    comments: [commentSchema],
    activity: [activitySchema],
  },
  { timestamps: true }
);

taskSchema.index({ assignee: 1, status: 1, priority: 1, order: 1 });
taskSchema.index({ department: 1, status: 1 });
taskSchema.index({ sourcing: 1, status: 1 });
taskSchema.index({ 'vendor.user': 1 });
taskSchema.index({ requirement: 1 });

taskSchema.methods.log = function log(user, message) {
  this.activity.push({ user: user?._id || user, message });
  audit({ user: user?._id || user || null, entity: 'task', entityId: this._id, code: this.code, message });
};

export default mongoose.model('Task', taskSchema);