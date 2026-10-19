import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import RequirementCard from '../components/RequirementCard.jsx';
import { Loader, Empty } from '../components/ui.jsx';
import { canRaise, isManager } from '../utils.js';

// [key, label, coordinator/admin only]
const TABS = [
  ['open', 'Open'],
  ['new', 'New'],
  ['approved', 'Approved', true],
  ['ongoing', 'Ongoing'],
  ['ready', 'Ready to fulfill', true],
  ['fulfilled', 'Fulfilled'],
  ['update_needed', 'Update needed'],
  ['task_completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
];

export default function Requirements() {
  const { user, meta } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const status = params.get('status') || 'open';
  const keys = ['department', 'type', 'usageType', 'campaign', 'sourcing', 'priority', 'performance', 'mine'];
  const p = Object.fromEntries(keys.map((k) => [k, params.get(k) || '']));
  const setParam = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  useEffect(() => { api('/campaigns?all=true').then(setCampaigns).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ status });
      keys.forEach((k) => { if (p[k]) qs.set(k, p[k]); });
      if (q.trim()) qs.set('q', q.trim());
      setItems(null); setErr('');
      api(`/requirements?${qs}`).then(setItems).catch((e) => setErr(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [status, ...keys.map((k) => p[k]), q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="page-head">
        <div><h1>Requirement Zone</h1><p className="muted">Every creative requirement raised by the departments.</p></div>
        {canRaise(user, meta) && <Link to="/requirements/new" className="btn"><Plus size={18} /> Raise requirement</Link>}
      </div>

      <div className="tabs" role="group" aria-label="Status">
        {TABS.filter(([, , m]) => !m || isManager(user)).map(([k, label]) => (
          <button key={k} aria-pressed={status === k} onClick={() => setParam('status', k === 'open' ? '' : k)}>{label}</button>
        ))}
      </div>

      <div className="toolbar">
        <label className="search"><Search size={16} /><input className="input" placeholder="Search title, code or description" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
        <select className="select" value={p.usageType} onChange={(e) => setParam('usageType', e.target.value)} aria-label="Requirement type">
          <option value="">All requirement types</option>
          {Object.entries(meta.USAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select" value={p.department} onChange={(e) => setParam('department', e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {Object.entries(meta.DEPARTMENTS).filter(([, d]) => d.raises).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
        </select>
        <select className="select" value={p.campaign} onChange={(e) => setParam('campaign', e.target.value)} aria-label="Campaign">
          <option value="">Any campaign</option>
          {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select className="select" value={p.type} onChange={(e) => setParam('type', e.target.value)} aria-label="Creative format">
          <option value="">Any format</option>
          {Object.entries(meta.REQUIREMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" value={p.sourcing} onChange={(e) => setParam('sourcing', e.target.value)} aria-label="Internal or outsourced">
          <option value="">Internal & outsourced</option>
          <option value="internal">Internal</option>
          <option value="outsourced">Outsourced</option>
        </select>
        <select className="select" value={p.priority} onChange={(e) => setParam('priority', e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          {meta.PRIORITIES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
        </select>
        <select className="select" value={p.performance} onChange={(e) => setParam('performance', e.target.value)} aria-label="Performance">
          <option value="">Any performance</option>
          {Object.entries(meta.PERFORMANCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" value={p.mine} onChange={(e) => setParam('mine', e.target.value)} aria-label="Whose">
          <option value="">Everyone's</option>
          <option value="raised">Raised by me</option>
          {user.department && <option value="department">My department</option>}
        </select>
      </div>

      {err && <div className="error-box">{err}</div>}
      {!items ? <Loader /> : items.length === 0 ? (
        <Empty title="No requirements match" action={canRaise(user, meta) && <Link to="/requirements/new" className="btn sm">Raise a requirement</Link>}>Try another tab or clear the filters.</Empty>
      ) : (
        <div className="cards">{items.map((r) => <RequirementCard key={r._id} r={r} meta={meta} />)}</div>
      )}
    </>
  );
}