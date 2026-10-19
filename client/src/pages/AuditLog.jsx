import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Loader, Empty, Avatar } from '../components/ui.jsx';
import { fmtDateTime, isManager } from '../utils.js';

export default function AuditLog() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async (before) => {
    const qs = new URLSearchParams();
    if (entity) qs.set('entity', entity);
    if (q.trim()) qs.set('q', q.trim());
    if (before) qs.set('before', before);
    const r = await api(`/audit?${qs}`);
    setItems((cur) => (before ? [...(cur || []), ...r.items] : r.items));
    setNext(r.next);
  }, [entity, q]);

  useEffect(() => { setItems(null); const t = setTimeout(() => load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  if (!isManager(user)) return <Empty title="The audit log is for coordinators and admins" />;

  return (
    <>
      <div className="page-head">
        <div><h1>Audit log</h1><p className="muted">Every status change and action on requirements and tasks, newest first.</p></div>
      </div>
      <div className="toolbar">
        <label className="search"><Search size={16} /><input className="input" placeholder="Search code or action" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
        <select className="select" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Type">
          <option value="">Requirements and tasks</option>
          <option value="requirement">Requirements only</option>
          <option value="task">Tasks only</option>
        </select>
      </div>
      {!items ? <Loader /> : items.length === 0 ? <Empty title="No entries" /> : (
        <section className="panel">
          <div className="table-wrap">
            <table className="people">
              <thead><tr><th>When</th><th>Who</th><th>Item</th><th>Action</th></tr></thead>
              <tbody>{items.map((a) => (
                <tr key={a._id}>
                  <td className="small mono" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.createdAt)}</td>
                  <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>{a.user ? <><Avatar name={a.user.name} department={a.user.department} size="sm" />{a.user.name}</> : <span className="muted">System</span>}</span></td>
                  <td><Link to={`/${a.entity === 'task' ? 'tasks' : 'requirements'}/${a.entityId}`} className="mono small">{a.code || a.entity}</Link></td>
                  <td className="small">{a.message}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {next && <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => load(next)}>Load older</button>}
        </section>
      )}
    </>
  );
}