// Demo data. Run: npm run seed
// WARNING: wipes users, requirements, tasks, campaigns, categories, notifications, audit logs and counters.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Requirement from './models/Requirement.js';
import Task from './models/Task.js';
import Notification from './models/Notification.js';
import AuditLog from './models/AuditLog.js';
import Campaign from './models/Campaign.js';
import Category, { ensureCategories } from './models/Category.js';
import Counter, { nextSeq } from './models/Counter.js';

const PASSWORD = 'password123';
const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY);
const ahead = (d) => new Date(Date.now() + d * DAY);

async function run() {
  await connectDB(process.env.MONGO_URI);
  await Promise.all([User, Requirement, Task, Notification, AuditLog, Campaign, Category, Counter].map((M) => M.deleteMany({})));
  await ensureCategories();

  const mk = (name, email, role, department = null, extra = {}) => User.create({ name, email, password: PASSWORD, role, department, ...extra });
  const admin = await mk('Admin', 'admin@studio.test', 'admin');
  const coord = await mk('Meera (Coordinator)', 'coordinator@studio.test', 'coordinator');
  const anu = await mk('Anu', 'anu@studio.test', 'staff', 'marketing');
  const tom = await mk('Tom', 'tom@studio.test', 'staff', 'tech');
  const riya = await mk('Riya', 'riya@studio.test', 'staff', 'outlet');
  const rahul = await mk('Rahul', 'rahul@studio.test', 'staff', 'production');
  const sneha = await mk('Sneha', 'sneha@studio.test', 'staff', 'creative');
  const arjun = await mk('Arjun', 'arjun@studio.test', 'staff', 'creative');
  const vendor = await mk('Vinod (PrintHub)', 'vendor@studio.test', 'vendor', null, { company: 'PrintHub Studio', phone: '+91 98470 00000' });

  const summer = await Campaign.create({ name: 'Summer Campaign', description: 'Summer range launch', startDate: ago(20), endDate: ahead(25), createdBy: anu._id });
  const q1 = await Campaign.create({ name: 'Campaign Q1', startDate: ago(90), endDate: ago(10), createdBy: anu._id });

  const req = async (by, data) => {
    const r = new Requirement({ code: `REQ-${String(await nextSeq('requirement')).padStart(4, '0')}`, raisedBy: by._id, department: by.department, ...data });
    r.log(by, 'Raised the requirement');
    await r.save();
    return r;
  };
  // queue numbers per (staff or department, priority)
  const order = {};
  const task = async (r, data) => {
    const priority = data.priority || r.priority;
    const status = data.status || 'open';
    const internal = data.sourcing !== 'outsourced';
    const inQueue = internal && ['open', 'assigned', 'in_progress'].includes(status);
    const key = `${data.assignee || `dept:${data.department}`}|${priority}`;
    if (inQueue) order[key] = (order[key] || 0) + 1;
    const t = new Task({ code: `TSK-${String(await nextSeq('task')).padStart(4, '0')}`, requirement: r._id, title: r.title, deadline: r.deadline, priority, order: inQueue ? order[key] : null, ...data });
    if (t.assignee || !internal) { t.assignedAt = ago(2); t.assignedBy = coord._id; }
    t.log(coord, 'Created');
    await t.save();
    return t;
  };

  // Sneha has three High-priority tasks → numbered #1 #2 #3 in her queue
  const r1 = await req(anu, { title: 'Product launch poster', type: 'poster', usageType: 'campaign', campaign: summer._id, purpose: 'Instagram + outlet print', priority: 'high', deadline: ahead(2), status: 'in_progress', approvedAt: ago(3), targetDepartment: 'creative' });
  await task(r1, { department: 'creative', status: 'in_progress', assignee: sneha._id, startedAt: new Date() });
  const r2 = await req(anu, { title: 'Social media banner', type: 'social', usageType: 'daily_poster', priority: 'high', deadline: ahead(4), status: 'assigned', approvedAt: ago(2) });
  await task(r2, { department: 'creative', status: 'assigned', assignee: sneha._id });
  const r3 = await req(riya, { title: 'Outlet opening banner – Kakkanad', type: 'banner', usageType: 'outlet_handover', priority: 'high', deadline: ago(1), status: 'assigned', approvedAt: ago(2) });
  const t3 = await task(r3, { department: 'creative', status: 'assigned', assignee: sneha._id });
  t3.conflict = { active: true, reason: 'Three high-priority tasks due this week. Which one first?', raisedBy: sneha._id, raisedAt: new Date(), count: 1 };
  await t3.save();

  // Video: shoot by Production + edit open for self-assign
  const r4 = await req(anu, { title: 'Video intro – Summer range', type: 'video', usageType: 'campaign', campaign: summer._id, priority: 'high', deadline: ahead(6), status: 'in_progress', approvedAt: ago(4) });
  await task(r4, { title: 'Video intro – shoot', department: 'production', status: 'in_progress', assignee: rahul._id, startedAt: ago(1) });
  await task(r4, { title: 'Video intro – edit', department: 'creative', status: 'open', allowSelfAssign: true });

  // Outsourced printing (Ongoing) and one paused
  const r5 = await req(riya, { title: 'Brochure printing – 2000 copies', type: 'brochure', usageType: 'printing', priority: 'medium', deadline: ahead(5), status: 'in_progress', sourcing: 'outsourced', approvedAt: ago(3) });
  await task(r5, { department: 'creative', sourcing: 'outsourced', status: 'in_progress', startedAt: ago(1), allowSelfAssign: false, vendor: { name: 'PrintHub Studio', contact: 'Vinod', phone: '+91 98470 00000', email: 'vendor@studio.test', cost: 18000, user: vendor._id } });
  const r6 = await req(tom, { title: 'Event stall backdrop', type: 'banner', usageType: 'events', priority: 'low', deadline: ahead(12), status: 'in_progress', sourcing: 'outsourced', approvedAt: ago(5) });
  await task(r6, { department: 'creative', sourcing: 'outsourced', status: 'paused', pausedAt: ago(1), pauseReason: 'Waiting for final stall size', allowSelfAssign: false, vendor: { name: 'Flex Masters', contact: 'Joseph', phone: '+91 90000 11111', cost: 6500 } });

  // Waiting for coordinator review
  const r7 = await req(tom, { title: 'Support portal logo', type: 'logo', usageType: 'digital', priority: 'medium', status: 'in_progress', approvedAt: ago(3) });
  await task(r7, { department: 'creative', status: 'completed', assignee: arjun._id, submittedAt: new Date(), driveLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view' });

  // Fulfilled (green) – marketing marks usage
  const r8 = await req(anu, { title: 'Summer campaign carousel', type: 'social', usageType: 'campaign', campaign: summer._id, priority: 'medium', status: 'fulfilled', approvedAt: ago(8), fulfilledAt: ago(1), fulfilledBy: coord._id });
  await task(r8, { department: 'creative', status: 'closed', assignee: arjun._id, submittedAt: ago(3), closedAt: ago(2), reviewedBy: coord._id, driveLink: 'https://drive.google.com/drive/folders/1CarouselXYZ123' });

  // Update Needed (orange)
  const r9 = await req(riya, { title: 'Outlet standee – monsoon offer', type: 'poster', usageType: 'outlet_handover', priority: 'medium', status: 'update_needed', approvedAt: ago(8), fulfilledAt: ago(2), fulfilledBy: coord._id, updateCount: 1,
    updateRequests: [{ reason: 'Offer dates changed to 15–30 Oct', description: 'Update the dates and add the new outlet address.', requestedBy: riya._id, at: ago(1) }] });
  const t9 = await task(r9, { department: 'creative', status: 'assigned', assignee: arjun._id, priority: 'high', driveLink: 'https://drive.google.com/file/d/1StandeeV1ABCDE/view',
    update: { active: true, round: 1, reason: 'Offer dates changed to 15–30 Oct', description: 'Update the dates and add the new outlet address.', requestedBy: riya._id, at: ago(1) } });
  r9.updateRequests[0].tasks = [t9._id]; await r9.save();

  // Completed (blue) with performance
  const r10 = await req(anu, { title: 'Campaign Q1 hero poster', type: 'poster', usageType: 'campaign', campaign: q1._id, priority: 'medium', status: 'task_completed', approvedAt: ago(30), fulfilledAt: ago(20), fulfilledBy: coord._id,
    usage: { note: 'Instagram + Facebook ads, 12 Jan – 10 Feb.', link: 'https://instagram.com/p/example', date: ago(18), at: ago(18), by: anu._id },
    performance: { rating: 'high', note: '3.2% CTR, best of the quarter', by: anu._id, at: ago(10) } });
  await task(r10, { department: 'creative', status: 'closed', assignee: sneha._id, submittedAt: ago(22), closedAt: ago(21), reviewedBy: coord._id, driveLink: 'https://drive.google.com/file/d/1PosterQ1HIJKLMN/view' });

  // New (gray) and Approved (to assign)
  await req(anu, { title: 'Weekend sale Instagram posts', type: 'social', usageType: 'daily_poster', priority: 'medium', deadline: ahead(3) });
  await req(rahul, { title: 'Product photoshoot – new range', type: 'photoshoot', usageType: 'digital', priority: 'low', status: 'approved', approvedAt: new Date(), approvedBy: coord._id, targetDepartment: 'production' });

  // An alert for the dashboard popup
  await Notification.create({ user: sneha._id, type: 'alert', title: 'Please finish the launch poster today', message: 'Client review is tomorrow morning. — Meera (Coordinator)', link: '/', read: false });

  console.log('\nSeeded. Password for everyone: %s', PASSWORD);
  [admin, coord, anu, tom, riya, rahul, sneha, arjun, vendor].forEach((u) => console.log(`  ${u.email.padEnd(26)} ${u.role}${u.department ? ` / ${u.department}` : ''}`));
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
