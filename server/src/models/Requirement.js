import mongoose from 'mongoose';
import { DEPARTMENTS, REQUIREMENT_TYPES, PRIORITIES, REQUIREMENT_STATUS, PERFORMANCE } from '../utils/config.js';
import { audit } from './AuditLog.js';

const { Schema } = mongoose;

const commentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true, trim: true },
  at: { type: Date, default: Date.now },
});

const activitySchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: 'User' }, message: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const updateRequestSchema = new Schema({
  reason: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  references: [String],
  tasks: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, default: Date.now },
  status: { type: String, enum: ['open', 'fulfilled'], default: 'open' },
  fulfilledAt: Date,
  fulfilledBy: { type: Schema.Types.ObjectId, ref: 'User' },
});

const requirementSchema = new Schema(
  {
    code: { type: String, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    purpose: { type: String, trim: true }, // usage purpose
    type: { type: String, enum: Object.keys(REQUIREMENT_TYPES), required: true }, // creative format
    usageType: { type: String, default: null }, // requirement category key (Category collection)
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    department: { type: String, enum: [...Object.keys(DEPARTMENTS), null], default: null }, // raising department
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    deadline: Date,
    references: [String],
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // new → approved → assigned → in_progress → fulfilled → (update_needed → fulfilled)* → task_completed
    status: { type: String, enum: Object.keys(REQUIREMENT_STATUS), default: 'new' },
    sourcing: { type: String, enum: ['internal', 'outsourced'], default: 'internal' },
    targetDepartment: { type: String, default: null }, // creative / production, set at approval
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: String,
    assignedAt: Date,
    readyToFulfill: { type: Boolean, default: false },
    fulfilledAt: Date,
    fulfilledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fulfillNote: String,

    updateCount: { type: Number, default: 0 },
    updateRequests: [updateRequestSchema],

    // Marketing usage (G)
    usage: {
      note: String,
      link: String, // live link
      date: Date,
      at: Date,
      by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    performance: {
      rating: { type: String, enum: [...Object.keys(PERFORMANCE), null], default: null },
      note: String,
      by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      at: Date,
    },

    comments: [commentSchema],
    activity: [activitySchema],
  },
  { timestamps: true }
);

requirementSchema.index({ status: 1, department: 1 });
requirementSchema.index({ raisedBy: 1, status: 1 });
requirementSchema.index({ campaign: 1 });

requirementSchema.methods.log = function log(user, message) {
  this.activity.push({ user: user?._id || user, message });
  audit({ user: user?._id || user || null, entity: 'requirement', entityId: this._id, code: this.code, message });
};

export default mongoose.model('Requirement', requirementSchema);