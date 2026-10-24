import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, UserPlus, AlertTriangle, CheckCircle2, Clock, MessageSquare, Inbox, Mail, BadgeCheck, Flag, RefreshCw, BellRing, Send } from 'lucide-react';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Loader, Empty, Modal } from '../components/ui.jsx';
import { ago, fmtDateTime, isManager } from '../utils.js';

// Icon per notification type (sent by the server in notification.type)
const ICON = {
  requirement_new: Inbox,
  task_assigned: UserPlus,
  task_available: UserPlus,
  self_assigned: UserPlus,
  conflict: AlertTriangle,
  completed: CheckCircle2,
  reviewed: CheckCircle2,
  reminder: Clock,
  comment: MessageSquare,
  status: Bell,
  fulfilled: BadgeCheck,
  usage: Flag,
  update_request: RefreshCw,
  alert: BellRing,
};

// Roles an alert can be sent to, in the order shown in the dropdown
const ALERT_ROLES = ['staff', 'coordinator', 'vendor', 'admin', 'director'];

// Director / admin / coordinator: send a custom alert (shows as a popup on the receivers' dashboard)
function AlertModal({ meta, me, onClose }) {
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [f, setF] = useState({ target: 'department', department: 'creative', role: 'staff', userIds: [], title: '', message: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Everyone active except yourself (you never get your own alert)
  useEffect(() => { api('/users?active=true').then((list) => setPeople(list.filter((p) => p._id !== me._id))).catch(() => {}); }, [me._id]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (id) => set('userIds', f.userIds.includes(id) ? f.userIds.filter((x) => x !== id) : [...f.userIds, id]);

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.target === 'users' && !f.userIds.length) { setErr('Pick at least one person.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const r = await post('/notifications/alert', f);
      toast(`Alert sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`);
      onClose();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Send an alert" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field"><span>Send to</span>
          <div className="seg" role="group">
            {[['department', 'A department'], ['role', 'A role'], ['users', 'Specific people'], ['all', 'Everyone']].map(([k, l]) => (
              <button type="button" key={k} aria-pressed={f.target === k} onClick={() => set('target', k)}>{l}</button>
            ))}
          </div>
        </div>

        {f.target === 'department' && (
          <select className="select" value={f.department} onChange={(e) => set('department', e.target.value)} aria-label="Department">
            {Object.entries(meta.DEPARTMENTS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        )}
        {f.target === 'role' && (
          <select className="select" value={f.role} onChange={(e) => set('role', e.target.value)} aria-label="Role">
            {ALERT_ROLES.filter((r) => meta.ROLES[r]).map((r) => <option key={r} value={r}>{meta.ROLES[r]}</option>)}
          </select>
        )}
        {f.target === 'users' && (
          <div className="pick-list">
            {people.length === 0 && <span className="small muted">Loading people…</span>}
            {people.map((p) => (
              <label key={p._id} className="row small">
                <input type="checkbox" checked={f.userIds.includes(p._id)} onChange={() => toggle(p._id)} /> {p.name}{' '}
                <span className="muted">{p.company || meta.DEPARTMENTS[p.department]?.label || meta.ROLES[p.role]}</span>
              </label>
            ))}
          </div>
        )}

        <label className="field"><span>Title</span><input className="input" required value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Please complete pending tasks" /></label>
        <label className="field"><span>Message</span><textarea className="textarea" required value={f.message} onChange={(e) => set('message', e.target.value)} /></label>
        <p className="tiny muted">It pops up on their dashboard the next time they open the portal{meta.emailEnabled ? ' and is sent by email' : ''}.</p>
        {err && <div className="error-box">{err}</div>}
        <button className="btn" disabled={busy}><Send size={16} /> {busy ? 'Sending…' : 'Send alert'}</button>
      </form>
    </Modal>
  );
}

export default function Notifications() {
  const { meta, user } = useAuth();
  const [alertOpen, setAlertOpen] = useState(false);
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = () => api(`/notifications${onlyUnread ? '?unread=true' : ''}`)
    .then((r) => { setData(r); setErr(''); })
    .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [onlyUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (n) => {
    if (!n.read) {
      try { await post(`/notifications/${n._id}/read`); } catch { /* still open the link */ }
      window.dispatchEvent(new Event('cd:notifications'));
    }
    if (n.link) nav(n.link);
  };
  const readAll = async () => {
    await post('/notifications/read-all');
    window.dispatchEvent(new Event('cd:notifications'));
    load();
  };

  if (err) return <div className="error-box">{err}</div>;
  if (!data) return <Loader />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">{data.unread ? `${data.unread} unread` : 'All caught up.'} {meta.emailEnabled ? 'Copies are also sent by email.' : ''}</p>
        </div>
        <div className="row">
          <div className="seg">
            <button aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>All</button>
            <button aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>Unread</button>
          </div>
          {data.unread > 0 && <button className="btn ghost" onClick={readAll}>Mark all read</button>}
          {isManager(user) && <button className="btn" onClick={() => setAlertOpen(true)}><BellRing size={16} /> Send alert</button>}
        </div>
      </div>

      {data.items.length === 0 ? (
        <Empty title={onlyUnread ? 'No unread notifications' : 'No notifications'}>
          You'll hear about new requirements, assignments, status changes, fulfilment, update requests, usage updates, conflicts, alerts and deadlines here.
        </Empty>
      ) : (
        <section className="panel" style={{ padding: 8 }}>
          {data.items.map((n) => {
            const Icon = ICON[n.type] || Bell;
            return (
              <button key={n._id} className={`notif ${n.read ? '' : 'unread'} n-${n.type}`} onClick={() => open(n)}>
                <span className="notif-icon"><Icon size={17} /></span>
                <span className="notif-body">
                  <b>{n.title}</b>
                  <span className="small">{n.message}</span>
                  <span className="tiny muted" title={fmtDateTime(n.createdAt)}>
                    {ago(n.createdAt)}
                    {n.emailed ? <> · <Mail size={11} style={{ verticalAlign: '-1px' }} /> emailed</> : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      )}
      {alertOpen && <AlertModal meta={meta} me={user} onClose={() => setAlertOpen(false)} />}
    </>
  );
}