import nodemailer from 'nodemailer';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { MANAGER_ROLES } from '../utils/config.js';

let transporter = null;
if (process.env.SMTP_HOST) {
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function emailHtml(title, message, url) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1d2027">
    <p style="font-size:12px;color:#6b6f78;margin:0 0 8px">Creative Desk</p>
    <h2 style="font-size:18px;margin:0 0 10px">${esc(title)}</h2>
    <p style="font-size:14px;line-height:1.5;margin:0 0 18px">${esc(message)}</p>
    ${url ? `<a href="${url}" style="background:#1d2027;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-size:14px">Open in Creative Desk</a>` : ''}
  </div>`;
}

/**
 * Create in-app notifications (the notifications log) and send emails.
 * recipients: array of user ids (duplicates and the actor are removed)
 */
export async function notify(recipients, { type, title, message, link, actor }) {
  try {
    const ids = [...new Set((recipients || []).filter(Boolean).map(String))].filter((id) => !actor || id !== String(actor._id || actor));
    if (!ids.length) return;
    const users = await User.find({ _id: { $in: ids }, active: true }).select('email name emailNotifications');
    const docs = await Notification.insertMany(users.map((u) => ({ user: u._id, type, title, message, link })));
    if (!transporter) return;
    const url = link ? `${(process.env.APP_URL || '').replace(/\/$/, '')}${link}` : '';
    docs.forEach((doc, i) => {
      const u = users[i];
      if (!u.emailNotifications) return;
      transporter
        .sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: u.email, subject: `${title} · Creative Desk`, text: `${message}\n\n${url}`, html: emailHtml(title, message, url) })
        .then(() => Notification.updateOne({ _id: doc._id }, { emailed: true }))
        .catch((e) => Notification.updateOne({ _id: doc._id }, { emailError: e.message }));
    });
  } catch (e) {
    console.error('notify failed', e.message);
  }
}

export async function managerIds() {
    const list = await User.find({ role: { $in: MANAGER_ROLES }, active: true }).select('_id');
  return list.map((u) => u._id);
}

export async function departmentStaffIds(department) {
  const list = await User.find({ role: 'staff', department, active: true }).select('_id');
  return list.map((u) => u._id);
}