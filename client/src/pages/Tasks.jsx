import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Hand, Layers, Truck } from 'lucide-react';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Funnel, { DepartmentFunnels } from '../components/Funnel.jsx';
import TaskRow from '../components/TaskRow.jsx';
import { Loader, Empty } from '../components/ui.jsx';
import { isManager, isWorker } from '../utils.js';

// Internal tasks only. Outsourced work lives in Outsourced Projects;
// per-person ordering (drag & drop) lives in the Priority Funnel tab.
export default function Tasks() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const manager = isManager(user);
  const worker = isWorker(user, meta);
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const view = params.get('view') || (worker ? 'mine' : 'active');
  const department = params.get('department') || '';
  const assignee = params.get('assignee') || '';
  const status = params.get('status') || '';
  const setParam = (k, v) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v); else n.delete(k);
    if (k === 'view') n.delete('status');
    setParams(n, { replace: true });
  };

  const tabs = [
    ['active', 'Active'],
    worker && ['mine', 'My tasks'],
    ['available', 'Available to self-assign'],
    ['today', "Today's tasks"],
    ['review', 'Awaiting review'],
    ['conflicts', 'Conflicts'],
    ['closed', 'Closed'],
  ].filter(Boolean);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ view });
    if (department) qs.set('department', department);
    if (assignee) qs.set('assignee', assignee);
    if (status) qs.set('status', status);
    if (q.trim()) qs.set('q', q.trim());
    setErr('');
    return api(`/tasks?${qs}`).then(setItems).catch((e) => setErr(e.message));
  }, [view, department, assignee, status, q]);

  useEffect(() => { setItems(null); const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { if (manager) api('/users?active=true&role=staff').then(setPeople).catch(() => {}); }, [manager]);

  const move = async (t, direction) => { try { await post(`/tasks/${t._id}/move`, { direction }); load(); } catch (e) { toast(e.message, 'err'); } };
  const take = async (t) => { try { await post(`/tasks/${t._id}/self-assign`); toast(`You took ${t.code}`); load(); } catch (e) { toast(e.message, 'err'); } };
  const takeBtn = (t) => (worker && t.status === 'open' && t.allowSelfAssign && t.department === user.department
    ? <button className="btn sm" onClick={() => take(t)}><Hand size={15} /> Take</button> : null);

  const funnelViews = ['active', 'mine', 'available', 'today'];
  const emptyFor = view === 'available' ? 'No tasks open for self-assignment' : view === 'mine' ? 'Nothing assigned to you' : 'No tasks here';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Task Management</h1>
          <p className="muted">
            {manager
              ? 'Internal tasks. Assign, review and resolve conflicts here; set each person’s order in the Priority Funnel.'
              : `${meta.DEPARTMENTS[user.department]?.label} tasks in priority order.`}
          </p>
        </div>
        <div className="row">
          <Link to="/funnel" className="btn ghost"><Layers size={16} /> Priority Funnel</Link>
          {manager && <Link to="/outsourced" className="btn ghost"><Truck size={16} /> Outsourced</Link>}
        </div>
      </div>

      <div className="tabs" role="group" aria-label="View">
        {tabs.map(([k, label]) => <button key={k} aria-pressed={view === k} onClick={() => setParam('view', k)}>{label}</button>)}
      </div>

      <div className="toolbar">
        <label className="search"><Search size={16} /><input className="input" placeholder="Search task title or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
        {manager && (
          <>
            <select className="select" value={department} onChange={(e) => setParam('department', e.target.value)} aria-label="Department">
              <option value="">All departments</option>
              {meta.WORK_DEPARTMENTS.map((d) => <option key={d} value={d}>{meta.DEPARTMENTS[d].label}</option>)}
            </select>
            <select className="select" value={assignee} onChange={(e) => setParam('assignee', e.target.value)} aria-label="Assignee">
              <option value="">Anyone</option>
              {people.filter((p) => meta.WORK_DEPARTMENTS.includes(p.department)).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </>
        )}
        {view === 'active' && (
          <select className="select" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            {['open', 'assigned', 'in_progress'].map((s) => <option key={s} value={s}>{meta.TASK_STATUS[s]}</option>)}
          </select>
        )}
      </div>

      {err && <div className="error-box">{err}</div>}
      {!items ? <Loader /> : funnelViews.includes(view) && manager && !department ? (
        <DepartmentFunnels tasks={items} meta={meta} onMove={view === 'active' ? move : null} emptyTitle={emptyFor} />
      ) : funnelViews.includes(view) ? (
        <section className="panel">
          <Funnel tasks={items} meta={meta} onMove={manager && view === 'active' ? move : null} action={takeBtn} showDept={false} detailed={view === 'mine'} emptyTitle={emptyFor} />
        </section>
      ) : items.length === 0 ? (
        <Empty title={{ review: 'Nothing waiting for review', conflicts: 'No open conflicts', closed: 'No closed tasks yet' }[view] || 'No tasks'} />
      ) : (
        <section className="panel"><div className="list">{items.map((t) => <TaskRow key={t._id} t={t} meta={meta} />)}</div></section>
      )}
    </>
  );
}