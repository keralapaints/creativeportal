import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { api, post, patch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Loader, Empty, Modal, ReqStatus, PerformancePill, UsageTag } from '../components/ui.jsx';
import { fmtDate, isManager, toInputDate } from '../utils.js';

function CampaignModal({ c, onClose, onSaved }) {
  const [f, setF] = useState({ name: c?.name || '', description: c?.description || '', startDate: toInputDate(c?.startDate), endDate: toInputDate(c?.endDate), active: c?.active ?? true });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { onSaved(c ? await patch(`/campaigns/${c._id}`, f) : await post('/campaigns', f)); } catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title={c ? 'Edit campaign' : 'New campaign'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label className="field"><span>Description</span><textarea className="textarea" style={{ minHeight: 60 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="form-grid">
          <label className="field"><span>Start</span><input className="input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
          <label className="field"><span>End</span><input className="input" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
        </div>
        {c && <label className="row switch"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (shown in pickers)</label>}
        {err && <div className="error-box">{err}</div>}
        <button className="btn">{c ? 'Save' : 'Create campaign'}</button>
      </form>
    </Modal>
  );
}

function CampaignRow({ c, meta, onEdit, canEdit }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const toggle = () => { setOpen(!open); if (!detail) api(`/campaigns/${c._id}`).then(setDetail).catch(() => {}); };
  const p = c.stats.performance || {};
  return (
    <section className={`panel ${c.active ? '' : 'inactive'}`}>
      <div className="spread">
        <button className="link-btn row" style={{ gap: 6 }} onClick={toggle}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<h2>{c.name}</h2></button>
        <div className="row" style={{ gap: 6 }}>
          {!c.active && <span className="pill">Inactive</span>}
          <span className="pill">{c.stats.total} creatives</span>
          <span className="pill f-blue">{c.stats.used} used</span>
          {['high', 'medium', 'low', 'rejected'].map((k) => (p[k] ? <PerformancePill key={k} rating={k} meta={meta} /> : null))}
          {canEdit && <button className="btn sm ghost" onClick={() => onEdit(c)}>Edit</button>}
        </div>
      </div>
      <p className="tiny muted" style={{ marginTop: 4 }}>{c.startDate ? fmtDate(c.startDate) : '…'} – {c.endDate ? fmtDate(c.endDate) : '…'}{c.description ? ` · ${c.description}` : ''}</p>
      {open && (!detail ? <p className="small muted" style={{ marginTop: 10 }}>Loading…</p> : detail.requirements.length === 0 ? <p className="small muted" style={{ marginTop: 10 }}>No creatives linked yet.</p> : (
        <div className="list" style={{ marginTop: 10 }}>
          {detail.requirements.map((r) => (
            <Link key={r._id} to={`/requirements/${r._id}`} className="list-row">
              <div style={{ minWidth: 0 }}>
                <div className="t">{r.title}</div>
                <div className="row small" style={{ gap: 6, marginTop: 3 }}><span className="code">{r.code}</span><UsageTag value={r.usageType} meta={meta} />{r.usage?.link && <span className="muted">live link</span>}</div>
              </div>
              <div className="row" style={{ gap: 6 }}><PerformancePill rating={r.performance?.rating} meta={meta} /><ReqStatus status={r.status} meta={meta} /></div>
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}

export default function Campaigns() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [modal, setModal] = useState(null);
  const canEdit = isManager(user) || user.department === 'marketing';
  const load = () => api('/campaigns?all=true').then(setList).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!list) return <Loader />;
  return (
    <>
      <div className="page-head">
        <div><h1>Campaigns & usage</h1><p className="muted">Creatives linked to each campaign, how many were used and how they performed.</p></div>
        {canEdit && <button className="btn" onClick={() => setModal({})}><Plus size={18} /> New campaign</button>}
      </div>
      {list.length === 0 ? <Empty title="No campaigns yet" /> : (
        <div className="stack" style={{ gap: 12 }}>{list.map((c) => <CampaignRow key={c._id} c={c} meta={meta} canEdit={canEdit} onEdit={(x) => setModal({ c: x })} />)}</div>
      )}
      {modal && <CampaignModal c={modal.c} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Saved'); load(); }} />}
    </>
  );
}