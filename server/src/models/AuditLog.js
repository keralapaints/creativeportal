import mongoose from 'mongoose';

// Global, append-only audit trail of every status change and action
const auditSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    entity: { type: String, enum: ['requirement', 'task', 'user'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    code: String,
    message: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditSchema.index({ createdAt: -1 });
auditSchema.index({ entity: 1, entityId: 1 });

const AuditLog = mongoose.model('AuditLog', auditSchema);

// Fire-and-forget: never blocks or breaks the request
export function audit(entry) {
  AuditLog.create(entry).catch((e) => console.error('audit failed', e.message));
}

export default AuditLog;