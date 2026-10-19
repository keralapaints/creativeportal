import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Funnel from '../components/Funnel.jsx';
import { Loader, Empty, Avatar, DeptTag } from '../components/ui.jsx';
import { isManager } from '../utils.js';

/*
 * Priority Funnel (separate tab)
 * One queue per staff member + unassigned per department.
 * Numbers (#1, #2…) appear only when a person has several tasks of the same priority.
 * Coordinators drag & drop to reorder or change priority.
 */
export default function PriorityFunnel() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const manager = isManager(user);
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const department = params.get('department') || '';
  const staffId = params.get('staff') || '';
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const load = useCallback(() => api(`/tasks/queues${department ? `?department=${department}` : ''}`).then(setD).catch((e) => setErr(e.message)), [department]);
  useEffect(() => { load(); }, [load]);

  const drop = async (t, priority, position) => {
    try {
      await post(`/tasks/${t._id}/position`, { priority, position });
      toast(priority === t.priority ? `${t.code} moved to #${position}` : `${t.code} is now ${priority} priority`);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  if (err) return <div className="error-box">{err}</div>;
  if (!d) return <Loader />;

  const queues = staffId ? d.staff.filter((q) => q.user._id === staffId) : d.staff;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Priority Funnel</h1>
          <p className="muted">{manager
            ? 'One queue per person. Drag a task to reorder it or drop it on another priority. Numbers show when someone has several tasks of the same priority.'
            : 'Your queue in the order to work on it. The coordinator sets the order.'}</p>
        </div>
      </div>

      {manager && (
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Department">
            <button aria-pressed={!department} onClick={() => set('department', '')}>All</button>
            {meta.WORK_DEPARTMENTS.map((dep) => <button key={dep} aria-pressed={department === dep} onClick={() => set('department', dep)}>{meta.DEPARTMENTS[dep].label.split(' ')[0]}</button>)}
          </div>
          <select className="select" value={staffId} onChange={(e) => set('staff', e.target.value)} aria-label="Staff">
            <option value="">Everyone</option>
            {d.staff.map((q) => <option key={q.user._id} value={q.user._id}>{q.user.name} ({q.tasks.length})</option>)}
          </select>
        </div>
      )}

      <div className="queue-grid">
        {queues.map((q) => (
          <section key={q.user._id} className={`panel t-${q.user.department}`}>
            <div className="panel-head">
              <h2 className="row" style={{ gap: 8 }}><Avatar name={q.user.name} department={q.user.department} size="sm" />{q.user.name}{q.user._id === user._id && <span className="pill">You</span>}</h2>
              <span className="small muted"><DeptTag dept={q.user.department} meta={meta}>{meta.DEPARTMENTS[q.user.department].label.split(' ')[0]}</DeptTag> {q.tasks.length} tasks</span>
            </div>
            <Funnel tasks={q.tasks} meta={meta} showDept={false} detailed onDrop={manager ? drop : null} emptyTitle="Queue is empty" />
          </section>
        ))}
        {!staffId && Object.entries(d.unassigned).map(([dep, list]) => (
          <section key={dep} className={`panel t-${dep} unassigned-q`}>
            <div className="panel-head">
              <h2 className="row" style={{ gap: 8 }}><span className="team-dot" />Unassigned · {meta.DEPARTMENTS[dep].label}</h2>
              <span className="small muted">{list.length} tasks</span>
            </div>
            <Funnel tasks={list} meta={meta} showDept={false} onDrop={manager ? drop : null} emptyTitle="Nothing unassigned" />
          </section>
        ))}
      </div>
      {!queues.length && <Empty title="No staff in this department">Add Creative or Production staff from <Link to="/users">Users & roles</Link>.</Empty>}
    </>
  );
}