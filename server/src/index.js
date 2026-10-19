import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import requirementRoutes from './routes/requirements.js';
import taskRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import driveRoutes from './routes/drive.js';
import auditRoutes from './routes/audit.js';
import categoryRoutes from './routes/categories.js';
import campaignRoutes from './routes/campaigns.js';
import statsRoutes from './routes/stats.js';
import { protect } from './middleware/auth.js';
import { startReminders } from './services/reminders.js';
import { ensureCategories, categoryMap } from './models/Category.js';
import {
  ROLES, DEPARTMENTS, WORK_DEPARTMENTS, REQUIREMENT_TYPES, PRIORITIES, REQUIREMENT_STATUS, REQUIREMENT_FLOW,
  OPEN_REQUIREMENT, FULFILLED_REQUIREMENT, TASK_STATUS, OUTSOURCE_STATUS, PERFORMANCE,
} from './utils/config.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/meta', protect, async (_req, res) => res.json({
  ROLES, DEPARTMENTS, WORK_DEPARTMENTS, REQUIREMENT_TYPES, PRIORITIES, REQUIREMENT_STATUS, REQUIREMENT_FLOW,
  OPEN_REQUIREMENT, FULFILLED_REQUIREMENT, TASK_STATUS, OUTSOURCE_STATUS, PERFORMANCE,
  USAGE_TYPES: await categoryMap(), // requirement categories from the database (admin-editable)
  emailEnabled: Boolean(process.env.SMTP_HOST), driveCheck: Boolean(process.env.GOOGLE_API_KEY),
}));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/stats', statsRoutes);

// Serve the built React app (single deploy)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid value.' });
  if (err.code === 11000) return res.status(400).json({ message: 'That value is already in use.' });
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 5000;
connectDB(process.env.MONGO_URI)
  .then(async () => {
    await ensureCategories();
    app.listen(PORT, () => console.log(`API running on :${PORT}`));
    startReminders();
  })
  .catch((e) => { console.error('DB connection failed', e.message); process.exit(1); });