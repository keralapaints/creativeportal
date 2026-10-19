import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { api, post, patch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Loader, Empty } from '../components/ui.jsx';

// Admin: customise requirement types (Campaign Creative, Daily Poster, … + your own)
export default function Settings() {
  const { user, refreshMeta } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [f, setF] = useState({ label: '', hint: '' });

  const load = () => api('/categories').then(setList).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (user.role !== 'admin') return <Empty title="Only admins can change requirement types" />;
  if (!list) return <Loader />;

  const save = async (c, body, msg) => { try { await patch(`/categories/${c._id}`, body); await load(); await refreshMeta?.(); if (msg) toast(msg); } catch (e) { toast(e.message, 'err'); } };
  const move = async (i, dir) => {
    const a = list[i]; const b = list[i + dir];
    if (!b) return;
    await patch(`/categories/${a._id}`, { order: b.order });
    await patch(`/categories/${b._id}`, { order: a.order });
    await load(); await refreshMeta?.();
  };
  const add = async (e) => {
    e.preventDefault();
    try { await post('/categories', f); setF({ label: '', hint: '' }); await load(); await refreshMeta?.(); toast('Requirement type added'); } catch (ex) { toast(ex.message, 'err'); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Requirement types</h1><p className="muted">The list people pick from when they raise a requirement. Hide a type to stop new requirements using it; old ones keep it.</p></div></div>
      <section className="panel">
        <div className="list">
          {list.map((c, i) => (
            <div key={c._id} className={`cat-row ${c.active ? '' : 'inactive'}`}>
              <span className="row" style={{ gap: 0 }}>
                <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
                <button className="icon-btn" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
              </span>
              <input className="input" defaultValue={c.label} onBlur={(e) => e.target.value.trim() && e.target.value !== c.label && save(c, { label: e.target.value.trim() }, 'Renamed')} aria-label="Name" />
              <input className="input" defaultValue={c.hint || ''} placeholder="Short description" onBlur={(e) => e.target.value !== (c.hint || '') && save(c, { hint: e.target.value }, 'Saved')} aria-label="Description" />
              <label className="row switch small"><input type="checkbox" checked={c.active} onChange={(e) => save(c, { active: e.target.checked }, e.target.checked ? 'Shown' : 'Hidden')} /> Active</label>
            </div>
          ))}
        </div>
        <form className="cat-row add" onSubmit={add}>
          <span />
          <input className="input" placeholder="New type, e.g. Packaging Design" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required />
          <input className="input" placeholder="Short description" value={f.hint} onChange={(e) => setF({ ...f, hint: e.target.value })} />
          <button className="btn"><Plus size={16} /> Add</button>
        </form>
      </section>
    </>
  );
}