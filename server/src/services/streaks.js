import Task from '../models/Task.js';
import { DAY } from '../utils/dates.js';

// A task is "on time" when it was submitted before the end of its deadline day
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const isOnTime = (t) => Boolean(t.deadline && t.submittedAt && new Date(t.submittedAt) <= endOfDay(t.deadline));

// Streak milestones → badge
export const BADGES = [
  { at: 25, key: 'legend', name: 'Deadline Legend', emoji: '👑' },
  { at: 10, key: 'crusher', name: 'Deadline Crusher', emoji: '🏆' },
  { at: 5, key: 'hot', name: 'Hot Streak', emoji: '🔥' },
  { at: 3, key: 'roll', name: 'On a Roll', emoji: '⚡' },
];
export const badgeFor = (streak) => BADGES.find((b) => streak >= b.at) || null;

// On-time stats for one person (tasks they submitted that had a deadline)
export async function onTimeStats(userId) {
  const list = await Task.find({
    completedBy: userId, deadline: { $ne: null }, submittedAt: { $ne: null }, status: { $in: ['completed', 'closed'] },
  }).select('deadline submittedAt').sort({ submittedAt: -1 }).limit(300).lean();

  let streak = 0;
  for (const t of list) { if (isOnTime(t)) streak += 1; else break; }

  // best streak in the history we looked at
  let best = 0; let run = 0;
  [...list].reverse().forEach((t) => { run = isOnTime(t) ? run + 1 : 0; best = Math.max(best, run); });

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = list.filter((t) => new Date(t.submittedAt) >= monthStart);
  return {
    streak,
    best,
    monthOnTime: month.filter(isOnTime).length,
    monthTotal: month.length,
    badge: badgeFor(streak),
  };
}

// What the creator sees right after an on-time submission
export async function celebrationFor(task, userId) {
  if (!isOnTime(task)) return null;
  const stats = await onTimeStats(userId);
  const msEarly = endOfDay(task.deadline) - new Date(task.submittedAt);
  const earlyDays = Math.floor(msEarly / DAY); // 0 = on the due day
  const unlocked = BADGES.find((b) => stats.streak === b.at) || null; // just reached a milestone
  return { onTime: true, earlyDays, ...stats, unlocked };
}