import { useEffect, useState } from 'react';
import { Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { api, post, patch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Loader, Empty } from '../components/ui.jsx';
import { isAdmin } from '../utils.js';

// Admins and directors: customise requirement types (Campaign Creative, Daily Poster, … + your own)
export default function Settings() {
  const { user, refreshMeta } = useAuth();
  const toast = useToast();
  const allowed = isAdmin(user);
  const [list, setList] = useState(null);
  const [f, setF] = useState({ label: '', hint: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/categories').then(setList).catch((e) => toast(e.message, 'err'));
  useEffect(() => { if (allowed) load(); }, [allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) return <Empty title="Only admins and directors can change requirement types" />;
  if (!list) return <Loader />;

  const refresh = async () => { await load(); await refreshMeta?.(); };

  const save = async (c, body, msg) => {
    try { await patch(`/categories/${c._id}`, body); await refresh(); if (msg) toast(msg); } catch (e) { toast(e.message, 'err'); }
  };

  // Swap two neighbours. Uses list positions, so it also works if two types share the same order number.
  const move = async (i, dir) => {
    const a = list[i]; const b = list[i + dir];
    if (!b || busy) return;
    setBusy(true);
    try {
      await patch(`/categories/${a._id}`, { order: i + dir });
      await patch(`/categories/${b._id}`, { order: i });
      await refresh();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await post('/categories', f); setF({ label: '', hint: '' }); await refresh(); toast('Requirement type added'); }
    catch (ex) { toast(ex.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Requirement types</h1>
          <p className="muted">The list people pick from when they raise a requirement. Hide a type to stop new requirements using it; old ones keep it.</p>
        </div>
      </div>
      <section className="panel">
        <div className="list">
          {list.map((c, i) => (
            <div key={c._id} className={`cat-row ${c.active ? '' : 'inactive'}`}>
              <span className="row" style={{ gap: 0 }}>
                <button className="icon-btn" disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
                <button className="icon-btn" disabled={i === list.length - 1 || busy} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
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
          <button className="btn" disabled={busy}><Plus size={16} /> Add</button>
        </form>
      </section>
    </>
  );
}