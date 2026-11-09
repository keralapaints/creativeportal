import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Empty } from '../components/ui.jsx';
import { canRaise, isManager } from '../utils.js';

const TEAM_HINT = {
  creative: 'design, video edit, posters',
  production: 'shoots, printing, production work',
};

export default function NewRequirement() {
  const { user, meta } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const director = user.role === 'director';
  const [f, setF] = useState({
    title: '', description: '', purpose: '', type: 'poster', usageType: '', campaign: '',
    priority: director ? 'high' : 'medium', deadline: '', references: '', department: user.department || '',
    targetDepartments: ['creative'], // directors only: which teams get the request
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/campaigns').then(setCampaigns).catch(() => {}); }, []);

  if (!canRaise(user, meta)) return <Empty title="Your department doesn't raise requirements">Creative staff and vendors receive tasks from the coordinator instead.</Empty>;

  const categories = Object.entries(meta.USAGE_TYPES).filter(([, c]) => c.active !== false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleTarget = (d) => setF((x) => ({ ...x, targetDepartments: x.targetDepartments.includes(d) ? x.targetDepartments.filter((y) => y !== d) : [...x.targetDepartments, d] }));
  const teamNames = (list) => (list.length > 1 ? 'Creative & Production' : meta.DEPARTMENTS[list[0]]?.label);

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!f.usageType) { setErr('Pick the requirement type (Campaign Creative, Daily Poster, …).'); return; }
    if (director && !f.targetDepartments.length) { setErr('Pick Creative, Production or both.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const r = await post('/requirements', {
        ...f, deadline: f.deadline || undefined, department: f.department || null, campaign: f.campaign || null,
        references: f.references.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      toast(director
        ? `${r.code} sent to ${teamNames(f.targetDepartments)}. They can take it now`
        : `${r.code} raised. The coordinator has been notified`);
      nav(`/requirements/${r._id}`);
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Raise a requirement</h1>
          <p className="muted">
            {director
              ? <>As a director, your request goes <b>straight to the teams</b> you pick. Their staff can take it right away, and the coordinator can also assign it.</>
              : <>It goes to the Requirement Zone as <b>New</b>. The coordinator reviews it, categorises it and assigns it.</>}
          </p>
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

        {/* ⭐ Directors pick which teams get the request */}
        {director && (
          <section className="panel director-box">
            <div className="field">
              <span>⭐ Send to</span>
              <div className="target-picks">
                {meta.WORK_DEPARTMENTS.map((d) => (
                  <label key={d} className={`pick ${f.targetDepartments.includes(d) ? 'on' : ''}`}>
                    <input type="checkbox" checked={f.targetDepartments.includes(d)} onChange={() => toggleTarget(d)} />
                    <span><b>{meta.DEPARTMENTS[d].label}</b>{TEAM_HINT[d] && <span className="tiny muted"> · {TEAM_HINT[d]}</span>}</span>
                  </label>
                ))}
              </div>
              <small>One open task is created for each team you pick. Anyone in that team can take it, and the coordinator can assign it to a person.</small>
            </div>
          </section>
        )}

        <section className="panel form-grid">
          <label className="field">
            <span>{director ? 'Raised for department' : 'Department'} {director && <span className="muted">(optional)</span>}</span>
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
            <span>{director ? 'Priority' : 'Initial priority'}</span>
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
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : director ? `Send to ${teamNames(f.targetDepartments) || 'the team'}` : 'Submit to Requirement Zone'}</button>
          <button type="button" className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
        </div>
      </form>
    </>
  );
}