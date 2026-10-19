import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Pause, Play, ExternalLink } from 'lucide-react';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Loader, Empty, TaskStatus, PriorityPill, Due } from '../components/ui.jsx';
import { isManager, money, ACTIVE_TASKS } from '../utils.js';

// Pending → Ongoing → Paused → Fulfilled (→ Closed after coordinator review)
const TABS = [
  ['active', 'Active'], ['pending', 'Pending'], ['ongoing', 'Ongoing'], ['paused', 'Paused'], ['fulfilled', 'Fulfilled'], ['all', 'All'],
];
const match = (tab, t) => ({
  active: ACTIVE_TASKS.includes(t.status) || t.status === 'completed',
  pending: ['open', 'assigned'].includes(t.status),
  ongoing: t.status === 'in_progress',
  paused: t.status === 'paused',
  fulfilled: ['completed', 'closed'].includes(t.status),
  all: true,
}[tab]);

export default function Outsourced() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('active');
  const [q, setQ] = useState('');

  const load = () => api('/tasks?view=outsourced').then(setItems).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isManager(user)) return <Empty title="Outsourced projects are managed by the coordinator" />;
  if (!items) return <Loader />;

  const act = async (t, path, body, msg) => { try { await post(`/tasks/${t._id}/${path}`, body); toast(msg); load(); } catch (e) { toast(e.message, 'err'); } };
  const shown = items.filter((t) => match(tab, t) && (!q || `${t.title} ${t.code} ${t.vendor?.name}`.toLowerCase().includes(q.toLowerCase())));
  const count = (k) => items.filter((t) => match(k, t)).length;
  const cost = shown.reduce((s, t) => s + (t.vendor?.cost || 0), 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Outsourced Projects</h1><p className="muted">Work sent to external vendors. Mark a requirement as outsourced when you approve it, then assign it to a vendor.</p></div>
      </div>
      <div className="tiles">
        <div className="tile"><span className="tile-l">Pending</span><span className="tile-n">{count('pending')}</span></div>
        <div className="tile tile-yellow"><span className="tile-l">Ongoing</span><span className="tile-n">{count('ongoing')}</span></div>
        <div className="tile tile-orange"><span className="tile-l">Paused</span><span className="tile-n">{count('paused')}</span></div>
        <div className="tile tile-green"><span className="tile-l">Fulfilled</span><span className="tile-n">{count('fulfilled')}</span></div>
        <div className="tile"><span className="tile-l">Cost (shown)</span><span className="tile-n" style={{ fontSize: '1.4rem' }}>{money(cost)}</span></div>
      </div>
      <div className="tabs" role="group">{TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}<span className="n">{count(k)}</span></button>)}</div>
      <div className="toolbar"><label className="search"><Search size={16} /><input className="input" placeholder="Search project, code or vendor" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>

      {shown.length === 0 ? <Empty title="No outsourced projects here" /> : (
        <section className="panel">
          <div className="table-wrap">
            <table className="people">
              <thead><tr><th>Project</th><th>Vendor</th><th>Status</th><th>Priority</th><th>Due</th><th>Cost</th><th>Deliverable</th><th aria-label="Actions" /></tr></thead>
              <tbody>{shown.map((t) => (
                <tr key={t._id}>
                  <td><Link to={`/tasks/${t._id}`}><b style={{ fontWeight: 600 }}>{t.title}</b></Link><div className="tiny muted">{t.code} · {t.requirement?.code}{t.requirement?.campaign?.name ? ` · ${t.requirement.campaign.name}` : ''}</div></td>
                  <td>{t.vendor?.name}<div className="tiny muted">{t.vendor?.contact}{t.vendor?.phone ? ` · ${t.vendor.phone}` : ''}</div></td>
                  <td><TaskStatus status={t.status} sourcing="outsourced" meta={meta} /></td>
                  <td><PriorityPill value={t.priority} /></td>
                  <td><Due date={t.deadline} closed={!ACTIVE_TASKS.includes(t.status)} /></td>
                  <td className="mono">{money(t.vendor?.cost)}</td>
                  <td>{t.driveLink ? <a href={t.driveLink} target="_blank" rel="noreferrer" className="row small" style={{ gap: 4 }}><ExternalLink size={13} />Drive</a> : <span className="muted small">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {['assigned', 'in_progress'].includes(t.status) && <button className="btn sm ghost" onClick={() => act(t, 'pause', {}, 'Paused')}><Pause size={14} /> Pause</button>}
                    {t.status === 'paused' && <button className="btn sm ghost" onClick={() => act(t, 'resume', {}, 'Resumed')}><Play size={14} /> Resume</button>}
                    {t.status === 'completed' && <Link to={`/tasks/${t._id}`} className="btn sm go">Review</Link>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}