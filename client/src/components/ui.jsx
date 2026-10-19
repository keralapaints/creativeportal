import { useEffect } from 'react';
import { X, AlertTriangle, Flag } from 'lucide-react';
import { initials, dueInfo, cap, reqFlag, taskLabel } from '../utils.js';

export function Avatar({ name, department, size }) {
  return <span className={`avatar ${size === 'sm' ? 'sm' : ''} t-${department || 'none'}`} title={name}>{initials(name)}</span>;
}

export function DeptTag({ dept, meta, children }) {
  if (!dept) return null;
  return (
    <span className={`team-tag t-${dept}`}>
      <span className="team-dot" />
      {children || meta?.DEPARTMENTS?.[dept]?.label || dept}
    </span>
  );
}

export function PriorityPill({ value, order }) {
  if (!value) return null;
  return <span className={`pill p-${value}`}>{cap(value)}{order ? ` #${order}` : ''}</span>;
}

const TASK_CLS = { open: 'open', assigned: '', in_progress: 'working', paused: 'paused', completed: 'review', closed: 'ready', cancelled: 'cancelled' };
const OUT_CLS = { open: 'grey', assigned: 'grey', in_progress: 'yellow', paused: 'orange', completed: 'green', closed: 'green', cancelled: 'none' };
// Outsourced projects use Pending / Ongoing / Paused / Fulfilled
export function TaskStatus({ status, meta, sourcing }) {
  const cls = sourcing === 'outsourced' ? `f-${OUT_CLS[status]}` : `s-${TASK_CLS[status] ?? ''}`;
  return <span className={`pill ${cls}`}>{taskLabel({ status, sourcing }, meta)}</span>;
}

const PERF_CLS = { high: 'f-green', medium: 'f-yellow', low: 'f-orange', rejected: 'late' };
export function PerformancePill({ rating, meta }) {
  if (!rating) return null;
  return <span className={`pill ${PERF_CLS[rating]}`}>{meta?.PERFORMANCE?.[rating] || rating}</span>;
}

export function OutsourcedTag({ t }) {
  if (t.sourcing !== 'outsourced') return null;
  return <span className="pill out-tag">Outsourced · {t.vendor?.name || 'vendor'}</span>;
}

// Requirement status with its flag colour (yellow ongoing, green fulfilled, blue task completed)
export function ReqStatus({ status, meta }) {
  const flag = reqFlag(status);
  return (
    <span className={`pill f-${flag || 'none'} ${status === 'cancelled' ? 's-cancelled' : ''}`}>
      {flag && flag !== 'grey' && <Flag size={12} />}
      {meta?.REQUIREMENT_STATUS?.[status] || status}
    </span>
  );
}

export function UsageTag({ value, meta }) {
  if (!value) return null;
  return <span className={`pill u-${value}`}>{meta?.USAGE_TYPES?.[value]?.label || value}</span>;
}

export function ConflictPill() {
  return <span className="pill late"><AlertTriangle size={12} /> Conflict</span>;
}

export function Due({ date, closed }) {
  const d = dueInfo(date, closed);
  if (!d) return null;
  return <span className={`pill ${d.late ? 'late' : ''}`}>{d.text}</span>;
}

export function Loader() {
  return <div className="loader"><div className="spin" aria-label="Loading" /></div>;
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children && <p className="small">{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone, to, Link }) {
  const body = (<><span className="stat-n">{value}</span><span className="stat-l">{label}</span></>);
  return to ? <Link to={to} className={`stat ${tone || ''}`}>{body}</Link> : <div className={`stat ${tone || ''}`}>{body}</div>;
}