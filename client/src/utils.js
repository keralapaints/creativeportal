const DAY = 86400000;

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
export const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const ago = (d) => {
  if (!d) return '';
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
};

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function dueInfo(due, closed) {
  if (!due) return null;
  if (closed) return { text: `Due ${fmtDate(due)}`, late: false };
  const diff = Math.round((startOfDay(due) - startOfDay(Date.now())) / DAY);
  if (diff < 0) return { text: `${-diff}d overdue`, late: true };
  if (diff === 0) return { text: 'Due today', late: true };
  if (diff === 1) return { text: 'Due tomorrow', late: false };
  return { text: `Due in ${diff}d`, late: false };
}

export const initials = (name = '') =>
  name.replace(/\(.*\)/, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
export const ACTIVE_TASK = ['open', 'assigned', 'in_progress'];

/* permissions (mirror of the server) */
// Directors (CEOs) have exactly the same powers as admins
export const isAdmin = (u) => Boolean(u && ['admin', 'director'].includes(u.role));
export const isManager = (u) => Boolean(u && (isAdmin(u) || u.role === 'coordinator'));
export const canRaise = (u, meta) => u && (isManager(u) || (u.role === 'staff' && Boolean(meta?.DEPARTMENTS?.[u.department]?.raises)));
export const isWorker = (u, meta) => u && u.role === 'staff' && Boolean(meta?.DEPARTMENTS?.[u.department]?.works);

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
/* requirement life cycle (v5) */
export const OPEN_REQUIREMENT = ['new', 'approved', 'assigned', 'in_progress', 'update_needed'];
export const FULFILLED_REQUIREMENT = ['fulfilled'];
export const ACTIVE_TASKS = ['open', 'assigned', 'in_progress', 'paused'];
// gray new · blue approved · yellow ongoing · green fulfilled · orange update needed · blue-flag completed
export const reqFlag = (status) => {
  if (status === 'fulfilled') return 'green';
  if (status === 'update_needed') return 'orange';
  if (status === 'task_completed') return 'blue';
  if (['assigned', 'in_progress'].includes(status)) return 'yellow';
  if (status === 'cancelled') return null;
  return 'grey';
};
export const isVendor = (u) => u?.role === 'vendor';
// Mark usage, rate performance, request an update: raiser, raiser's department, marketing, managers
export const canMarkUsage = (r, u) =>
  isManager(u) || (r.raisedBy?._id || r.raisedBy) === u._id
  || (u.role === 'staff' && u.department && (u.department === r.department || u.department === 'marketing'));
export const canUpdateUsage = canMarkUsage;
export const taskLabel = (t, meta) => (t.sourcing === 'outsourced' ? meta.OUTSOURCE_STATUS?.[t.status] : meta.TASK_STATUS?.[t.status]) || t.status;
export const daysLeft = (d) => (d ? Math.ceil((new Date(d).setHours(23, 59, 59) - Date.now()) / 86400000) : null);
export const money = (n) => (n || n === 0 ? `₹${Number(n).toLocaleString('en-IN')}` : '—');