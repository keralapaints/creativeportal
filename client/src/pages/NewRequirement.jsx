import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Empty } from '../components/ui.jsx';
import { canRaise, isManager } from '../utils.js';

export default function NewRequirement() {
  const { user, meta } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [f, setF] = useState({ title: '', description: '', purpose: '', type: 'poster', usageType: '', campaign: '', priority: 'medium', deadline: '', references: '', department: user.department || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/campaigns').then(setCampaigns).catch(() => {}); }, []);

  if (!canRaise(user, meta)) return <Empty title="Your department doesn't raise requirements">Creative staff and vendors receive tasks from the coordinator instead.</Empty>;

  const categories = Object.entries(meta.USAGE_TYPES).filter(([, c]) => c.active !== false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!f.usageType) { setErr('Pick the requirement type (Campaign Creative, Daily Poster, …).'); return; }
    setBusy(true);
    try {
      const r = await post('/requirements', {
        ...f, deadline: f.deadline || undefined, department: f.department || null, campaign: f.campaign || null,
        references: f.references.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast(`${r.code} raised. The coordinator has been notified`);
      nav(`/requirements/${r._id}`);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Raise a requirement</h1>
          <p className="muted">It goes to the Requirement Zone as <b>New</b>. The coordinator reviews it, categorises it and assigns it.</p>
        </div>
      </div>
      <form onSubmit={submit} className="stack" style={{ gap: 18, maxWidth: 860 }}>
        <section className="panel stack" style={{ gap: 16 }}>
          <div className="field">
            <span>Requirement type <span className="muted">(required)</span></span>
            <div className="usage-grid">
              {categories.map(([k, v]) => (
                <button type="button" key={k} className="type-opt" aria-pressed={f.usageType === k} onClick={() => set('usageType', k)}>
                  <b>{v.label}</b>{v.hint && <span className="tiny muted">{v.hint}</span>}
                </button>
              ))}
            </div>
          </div>
          <label className="field"><span>Title</span><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Onam offer poster for outlets" required /></label>
          <div className="field">
            <span>Creative format</span>
            <div className="chips">
              {Object.entries(meta.REQUIREMENT_TYPES).map(([k, v]) => <button type="button" key={k} className="chip" aria-pressed={f.type === k} onClick={() => set('type', k)}>{v}</button>)}
            </div>
          </div>
          <label className="field"><span>Usage purpose</span><input className="input" value={f.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Where will it be used? e.g. Instagram ads + outlet standees" /></label>
          <label className="field"><span>Details</span><textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Sizes, text to include, mood, must-haves…" /></label>
        </section>
        <section className="panel form-grid">
          <label className="field">
            <span>Department</span>
            {isManager(user) ? (
              <select className="select" value={f.department} onChange={(e) => set('department', e.target.value)}>
                <option value="">No department</option>
                {Object.entries(meta.DEPARTMENTS).filter(([, d]) => d.raises).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            ) : <input className="input" value={meta.DEPARTMENTS[user.department]?.label} disabled />}
          </label>
          <label className="field">
            <span>Campaign <span className="muted">(optional)</span></span>
            <select className="select" value={f.campaign} onChange={(e) => set('campaign', e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Deadline <span className="muted">(optional)</span></span><input className="input" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></label>
          <div className="field">
            <span>Initial priority</span>
            <div className="seg" role="group" aria-label="Priority">
              {meta.PRIORITIES.map((p) => <button type="button" key={p} aria-pressed={f.priority === p} onClick={() => set('priority', p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}
            </div>
          </div>
          <label className="field full">
            <span>Reference files</span>
            <textarea className="textarea" style={{ minHeight: 80 }} value={f.references} onChange={(e) => set('references', e.target.value)} placeholder="One link per line: Google Drive files, sample designs, brand guidelines" />
          </label>
        </section>
        {err && <div className="error-box">{err}</div>}
        <div className="row">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Submit to Requirement Zone'}</button>
          <button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}