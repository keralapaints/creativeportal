import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: String, // requirement_new, task_assigned, self_assigned, status, conflict, completed, reviewed, reminder, comment
    title: String,
    message: String,
    link: String,
    read: { type: Boolean, default: false },
    emailed: { type: Boolean, default: false },
    emailError: String,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);