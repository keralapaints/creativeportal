import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Plus, Pencil, Ban, Trash2, CheckCircle2, BadgeCheck, Flag, RefreshCw, Star, Truck } from 'lucide-react';
import { api, post, patch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import TaskRow from '../components/TaskRow.jsx';
import StatusFlow from '../components/StatusFlow.jsx';
import { Avatar, DeptTag, Due, Loader, Modal, PriorityPill, ReqStatus, UsageTag, Empty, PerformancePill } from '../components/ui.jsx';
import { OPEN_REQUIREMENT, FULFILLED_REQUIREMENT, ago, canMarkUsage, fmtDate, fmtDateTime, isManager, toInputDate, money } from '../utils.js';

const strip = (l) => l.replace(/^https?:\/\//, '').slice(0, 70);
const activeCategories = (meta) => Object.entries(meta.USAGE_TYPES).filter(([, c]) => c.active !== false);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* ---------- B. Coordinator review & categorisation ---------- */
function ApproveModal({ r, meta, onClose, onSave }) {
  const [f, setF] = useState({ usageType: r.usageType || '', targetDepartment: r.type === 'photoshoot' || r.type === 'video' ? 'production' : 'creative', priority: r.priority, sourcing: 'internal', deadline: toInputDate(r.deadline), note: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title="Review & approve" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, deadline: f.deadline || null }); }}>
        <label className="field"><span>Requirement type</span>
          <select className="select" value={f.usageType} onChange={(e) => set('usageType', e.target.value)}>
            {activeCategories(meta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <div className="field"><span>Internal or outsourced</span>
          <div className="seg" role="group">
            <button type="button" aria-pressed={f.sourcing === 'internal'} onClick={() => set('sourcing', 'internal')}>Internal team</button>
            <button type="button" aria-pressed={f.sourcing === 'outsourced'} onClick={() => set('sourcing', 'outsourced')}>Outsourced (vendor)</button>
          </div>
        </div>
        <div className="form-grid">
          <div className="field"><span>Department</span>
            <div className="seg" role="group">{meta.WORK_DEPARTMENTS.map((d) => <button type="button" key={d} aria-pressed={f.targetDepartment === d} onClick={() => set('targetDepartment', d)}>{meta.DEPARTMENTS[d].label.split(' ')[0]}</button>)}</div>
          </div>
          <div className="field"><span>Priority</span>
            <div className="seg" role="group">{meta.PRIORITIES.map((p) => <button type="button" key={p} aria-pressed={f.priority === p} onClick={() => set('priority', p)}>{cap(p)}</button>)}</div>
          </div>
          <label className="field full"><span>Due date</span><input className="input" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></label>
        </div>
        <label className="field"><span>Note <span className="muted">(optional)</span></span><textarea className="textarea" style={{ minHeight: 60 }} value={f.note} onChange={(e) => set('note', e.target.value)} /></label>
        <button className="btn"><CheckCircle2 size={17} /> Approve</button>
      </form>
    </Modal>
  );
}

/* ---------- C. Task assignment: internal staff or outsourced vendor ---------- */
export function CreateTaskModal({ r, meta, people, vendors, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    sourcing: r.sourcing || 'internal',
    department: r.targetDepartment || (['photoshoot', 'video'].includes(r.type) ? 'production' : 'creative'),
    title: r.title, notes: '', mode: 'person', assignee: '', priority: r.priority, position: '', deadline: toInputDate(r.deadline),
    vendorUser: '', vendorName: '', contact: '', phone: '', email: '', cost: '',
  });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const staff = people.filter((p) => p.role === 'staff' && p.department === f.department);
  const out = f.sourcing === 'outsourced';

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!out && f.mode === 'person' && !f.assignee) { setErr('Pick who should do it.'); return; }
    if (out && !f.vendorUser && !f.vendorName.trim()) { setErr('Pick a vendor account or type the vendor name.'); return; }
    try {
      const t = await post('/tasks', {
        requirement: r._id, department: f.department, title: f.title, notes: f.notes, sourcing: f.sourcing,
        assignee: !out && f.mode === 'person' ? f.assignee : null, allowSelfAssign: !out && f.mode === 'self',
        priority: f.priority, position: f.position ? Number(f.position) : null, deadline: f.deadline || null,
        vendor: out ? { user: f.vendorUser || null, name: f.vendorName, contact: f.contact, phone: f.phone, email: f.email, cost: f.cost } : undefined,
      });
      toast(`${t.code} created`);
      onSaved();
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <Modal title="Assign task" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="field"><span>Who does the work</span>
          <div className="seg" role="group">
            <button type="button" aria-pressed={!out} onClick={() => set('sourcing', 'internal')}>Internal staff</button>
            <button type="button" aria-pressed={out} onClick={() => set('sourcing', 'outsourced')}><Truck size={14} style={{ verticalAlign: '-2px' }} /> Outsourced</button>
          </div>
        </div>
        <div className="field">
          <span>Department</span>
          <div className="seg" role="group">
            {meta.WORK_DEPARTMENTS.map((d) => <button type="button" key={d} aria-pressed={f.department === d} onClick={() => { set('department', d); set('assignee', ''); }}>{meta.DEPARTMENTS[d].label}</button>)}
          </div>
        </div>
        <label className="field"><span>Task title</span><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} required /></label>
        <label className="field"><span>Instructions</span><textarea className="textarea" style={{ minHeight: 70 }} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything they need to know" /></label>

        {!out ? (
          <div className="field">
            <span>Assign to</span>
            <div className="stack" style={{ gap: 6 }}>
              <label className="row"><input type="radio" checked={f.mode === 'person'} onChange={() => set('mode', 'person')} /> A specific person</label>
              <label className="row"><input type="radio" checked={f.mode === 'self'} onChange={() => set('mode', 'self')} /> Allow self-assignment (anyone in the department can take it)</label>
              <label className="row"><input type="radio" checked={f.mode === 'later'} onChange={() => set('mode', 'later')} /> I'll assign it later</label>
            </div>
            {f.mode === 'person' && (
              <select className="select" value={f.assignee} onChange={(e) => set('assignee', e.target.value)} style={{ marginTop: 6 }}>
                <option value="">Pick a person…</option>
                {staff.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            )}
            {f.mode === 'person' && staff.length === 0 && <small>Nobody is in this department yet.</small>}
          </div>
        ) : (
          <div className="vendor-box stack">
            <label className="field"><span>Vendor account <span className="muted">(gives them limited login access)</span></span>
              <select className="select" value={f.vendorUser} onChange={(e) => {
                const v = vendors.find((x) => x._id === e.target.value);
                setF((x) => ({ ...x, vendorUser: e.target.value, vendorName: v?.company || x.vendorName, contact: v?.name || x.contact, phone: v?.phone || x.phone, email: v?.email || x.email }));
              }}>
                <option value="">No account – track manually</option>
                {vendors.map((v) => <option key={v._id} value={v._id}>{v.company || v.name}</option>)}
              </select>
            </label>
            <div className="form-grid">
              <label className="field"><span>Vendor name</span><input className="input" value={f.vendorName} onChange={(e) => set('vendorName', e.target.value)} placeholder="e.g. PrintHub Studio" /></label>
              <label className="field"><span>Contact person</span><input className="input" value={f.contact} onChange={(e) => set('contact', e.target.value)} /></label>
              <label className="field"><span>Phone</span><input className="input" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
              <label className="field"><span>Cost (₹) <span className="muted">(optional)</span></span><input className="input" type="number" min="0" value={f.cost} onChange={(e) => set('cost', e.target.value)} /></label>
            </div>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <span>Priority</span>
            <div className="seg" role="group">{meta.PRIORITIES.map((p) => <button type="button" key={p} aria-pressed={f.priority === p} onClick={() => set('priority', p)}>{cap(p)}</button>)}</div>
          </div>
          {!out && <label className="field"><span>Priority number</span><input className="input" type="number" min="1" value={f.position} onChange={(e) => set('position', e.target.value)} placeholder="Last" /><small>Only matters if this person has other {f.priority}-priority tasks</small></label>}
          <label className={`field ${out ? '' : 'full'}`}><span>Deadline</span><input className="input" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></label>
        </div>
        {err && <div className="error-box">{err}</div>}
        <button className="btn">{out ? 'Outsource task' : 'Create task'}</button>
      </form>
    </Modal>
  );
}

function EditModal({ r, meta, user, campaigns, onClose, onSaved }) {
  const [f, setF] = useState({ title: r.title, description: r.description || '', purpose: r.purpose || '', type: r.type, usageType: r.usageType || '', campaign: r.campaign?._id || '', priority: r.priority, deadline: toInputDate(r.deadline), references: (r.references || []).join('\n'), department: r.department || '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      onSaved(await patch(`/requirements/${r._id}`, { ...f, usageType: f.usageType || undefined, campaign: f.campaign || null, deadline: f.deadline || null, department: f.department || null, references: f.references.split('\n').map((s) => s.trim()).filter(Boolean) }));
    } catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title="Edit requirement" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>Title</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
        <label className="field"><span>Usage purpose</span><input className="input" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></label>
        <label className="field"><span>Details</span><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <div className="form-grid">
          <label className="field"><span>Requirement type</span><select className="select" value={f.usageType} onChange={(e) => setF({ ...f, usageType: e.target.value })}>
            {Object.entries(meta.USAGE_TYPES).map(([k, v]) => <option key={k} value={k} disabled={v.active === false && k !== r.usageType}>{v.label}</option>)}
          </select></label>
          <label className="field"><span>Creative format</span><select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(meta.REQUIREMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Campaign</span><select className="select" value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })}>
            <option value="">No campaign</option>{campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select></label>
          <label className="field"><span>Priority</span><select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{meta.PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}</select></label>
          <label className="field"><span>Deadline</span><input className="input" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
          {isManager(user) && (
            <label className="field"><span>Department</span><select className="select" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
              <option value="">None</option>{Object.entries(meta.DEPARTMENTS).filter(([, d]) => d.raises).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
            </select></label>
          )}
        </div>
        <label className="field"><span>References</span><textarea className="textarea" style={{ minHeight: 70 }} value={f.references} onChange={(e) => setF({ ...f, references: e.target.value })} /></label>
        {err && <div className="error-box">{err}</div>}
        <button className="btn">Save changes</button>
      </form>
    </Modal>
  );
}

function FulfillModal({ r, onClose, onSave }) {
  const [note, setNote] = useState('');
  const again = r.status === 'update_needed';
  return (
    <Modal title={again ? 'Mark fulfilled again' : 'Mark Requirement Fulfilled'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ note }); }}>
        <p className="small muted">All {r.tasks.filter((t) => t.status === 'closed').length} tasks are reviewed and closed. {r.raisedBy?.name} will be notified and asked to mark how it was used.</p>
        <label className="field"><span>Note for the raiser <span className="muted">(optional)</span></span><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="btn go"><BadgeCheck size={17} /> {again ? 'Mark fulfilled again' : 'Mark fulfilled'}</button>
      </form>
    </Modal>
  );
}

function UpdateRequestModal({ r, onClose, onSave }) {
  const delivered = r.tasks.filter((t) => t.status === 'closed');
  const [f, setF] = useState({ reason: '', description: '', references: '', taskIds: delivered.map((t) => t._id) });
  const toggle = (id) => setF({ ...f, taskIds: f.taskIds.includes(id) ? f.taskIds.filter((x) => x !== id) : [...f.taskIds, id] });
  return (
    <Modal title="Request an update" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, references: f.references.split('\n').map((s) => s.trim()).filter(Boolean) }); }}>
        <p className="small muted">The selected tasks go back to the same staff member or vendor. They get an email and the requirement turns orange (Update Needed).</p>
        <label className="field"><span>Reason for update</span><input className="input" required value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Offer dates changed" /></label>
        <label className="field"><span>Changes needed</span><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="field"><span>Reference files <span className="muted">(optional)</span></span><textarea className="textarea" style={{ minHeight: 64 }} value={f.references} onChange={(e) => setF({ ...f, references: e.target.value })} placeholder="One link per line" /></label>
        <div className="field"><span>Send back to</span>
          <div className="stack" style={{ gap: 6 }}>
            {delivered.map((t) => (
              <label key={t._id} className={`pick ${f.taskIds.includes(t._id) ? 'on' : ''}`}>
                <input type="checkbox" checked={f.taskIds.includes(t._id)} onChange={() => toggle(t._id)} />
                <span><b>{t.code}</b> · {t.title} <span className="muted">({t.sourcing === 'outsourced' ? t.vendor?.name : t.assignee?.name || 'department'})</span></span>
              </label>
            ))}
          </div>
        </div>
        <button className="btn update-btn" disabled={!f.taskIds.length}><RefreshCw size={16} /> Request update</button>
      </form>
    </Modal>
  );
}

function RatingPicker({ value, onChange, meta }) {
  return (
    <div className="rating-pick" role="group" aria-label="Performance">
      {Object.entries(meta.PERFORMANCE).map(([k, v]) => (
        <button type="button" key={k} className={`rp rp-${k}`} aria-pressed={value === k} onClick={() => onChange(value === k ? '' : k)}>{v}</button>
      ))}
    </div>
  );
}

/* ---------- G. Marketing: used / published → Completed ---------- */
function UsageModal({ r, meta, campaigns, onClose, onSave }) {
  const [f, setF] = useState({ usageType: r.usageType || '', campaign: r.campaign?._id || '', note: '', link: '', date: toInputDate(new Date()), rating: r.performance?.rating || '', ratingNote: r.performance?.note || '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal title="Mark as used / published" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, campaign: f.campaign || null }); }}>
        <div className="form-grid">
          <label className="field"><span>Requirement type</span><select className="select" value={f.usageType} onChange={(e) => set('usageType', e.target.value)}>{Object.entries(meta.USAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="field"><span>Link to campaign</span><select className="select" value={f.campaign} onChange={(e) => set('campaign', e.target.value)}>
            <option value="">No campaign</option>{campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select></label>
        </div>
        <label className="field"><span>Where and how was it used?</span><textarea className="textarea" required value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Instagram + Facebook ads 1–15 Sept; 200 flyers for 6 outlets" /></label>
        <div className="form-grid">
          <label className="field"><span>Live link <span className="muted">(optional)</span></span><input className="input" type="url" value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" /></label>
          <label className="field"><span>Published on</span><input className="input" type="date" required value={f.date} max={toInputDate(new Date())} onChange={(e) => set('date', e.target.value)} /></label>
        </div>
        <div className="field"><span>Performance <span className="muted">(optional – you can rate it later)</span></span><RatingPicker value={f.rating} onChange={(v) => set('rating', v)} meta={meta} /></div>
        {f.rating && <label className="field"><span>Performance notes</span><input className="input" value={f.ratingNote} onChange={(e) => set('ratingNote', e.target.value)} placeholder="Reach, CTR, footfall, feedback…" /></label>}
        <button className="btn usage-btn" disabled={!f.usageType}><Flag size={16} /> Mark Task Completed</button>
      </form>
    </Modal>
  );
}

function PerformanceModal({ r, meta, onClose, onSave }) {
  const [rating, setRating] = useState(r.performance?.rating || '');
  const [note, setNote] = useState(r.performance?.note || '');
  return (
    <Modal title="Rate performance" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ rating, note }); }}>
        <RatingPicker value={rating} onChange={setRating} meta={meta} />
        <label className="field"><span>Notes</span><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reach, CTR, footfall, feedback…" /></label>
        <button className="btn" disabled={!rating}><Star size={16} /> Save rating</button>
      </form>
    </Modal>
  );
}

const NOTICE = {
  new: (m) => (m ? 'New requirement. Review it, confirm the type and priority, and approve it as internal or outsourced.' : 'Waiting for the coordinator to review it.'),
  approved: (m) => (m ? 'Approved. Now assign it: create a task for internal staff or outsource it to a vendor.' : 'Approved. The coordinator is assigning it.'),
  assigned: () => 'Assigned. Work has not started yet.',
  in_progress: () => 'Work is in progress.',
  update_needed: (m) => (m ? 'Update requested. The task(s) went back to the same staff or vendor. Review the new work, then mark it fulfilled again.' : 'An update was requested. The same people are working on it.'),
};

export default function RequirementDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, meta } = useAuth();
  const toast = useToast();
  const [r, setR] = useState(null);
  const [people, setPeople] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [comment, setComment] = useState('');
  const manager = isManager(user);

  const load = useCallback(() => api(`/requirements/${id}`).then(setR).catch((e) => setErr(e.message)), [id]);
  useEffect(() => {
    load();
    api('/campaigns').then(setCampaigns).catch(() => {});
    if (manager) api('/users?active=true').then(setPeople).catch(() => {});
  }, [load, manager]);
  // Dashboard shortcuts: ?do=usage / ?do=update
  useEffect(() => {
    const d = params.get('do');
    if (r && d && ['usage', 'update', 'rate'].includes(d)) { setModal(d); params.delete('do'); setParams(params, { replace: true }); }
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="error-box">{err}</div>;
  if (!r) return <Loader />;

  const owner = r.raisedBy?._id === user._id;
  const open = OPEN_REQUIREMENT.includes(r.status);
  const canEdit = open && (manager || (owner && r.status === 'new'));
  const usageAllowed = canMarkUsage(r, user);
  const fulfilled = FULFILLED_REQUIREMENT.includes(r.status);
  const ready = r.readyToFulfill && ['in_progress', 'update_needed'].includes(r.status);
  const openUpdate = (r.updateRequests || []).find((u) => u.status === 'open');
  const vendors = people.filter((p) => p.role === 'vendor');

  const act = async (path, body, msg) => {
    try { setR(await post(`/requirements/${id}/${path}`, body)); setModal(null); toast(msg); window.dispatchEvent(new Event('cd:notifications')); } catch (e) { toast(e.message, 'err'); }
  };
  const cancel = () => window.confirm('Cancel this requirement? Its open tasks are cancelled too.') && act('cancel', {}, 'Requirement cancelled');

  return (
    <>
      <Link to="/requirements" className="row small muted back"><ArrowLeft size={15} /> Requirement Zone</Link>
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="code">{r.code} · {meta.REQUIREMENT_TYPES[r.type]}</span>
            <ReqStatus status={r.status} meta={meta} />
            <UsageTag value={r.usageType} meta={meta} />
            {r.sourcing === 'outsourced' && <span className="pill out-tag">Outsourced</span>}
            <PriorityPill value={r.priority} />
            <Due date={r.deadline} closed={!open} />
            <PerformancePill rating={r.performance?.rating} meta={meta} />
          </div>
          <h1>{r.title}</h1>
          {r.campaign?.name && <p className="small muted" style={{ marginTop: 6 }}>Campaign: <b>{r.campaign.name}</b></p>}
        </div>
        <div className="row">
          {manager && r.status === 'new' && <button className="btn" onClick={() => setModal('approve')}><CheckCircle2 size={17} /> Review & approve</button>}
          {manager && open && r.status !== 'new' && <button className="btn" onClick={() => setModal('task')}><Plus size={17} /> Assign task</button>}
          {manager && ready && <button className="btn go" onClick={() => setModal('fulfill')}><BadgeCheck size={17} /> {r.status === 'update_needed' ? 'Mark fulfilled again' : 'Mark Fulfilled'}</button>}
          {usageAllowed && fulfilled && <button className="btn usage-btn" onClick={() => setModal('usage')}><Flag size={16} /> Mark used / published</button>}
          {usageAllowed && fulfilled && <button className="btn ghost update-ghost" onClick={() => setModal('update')}><RefreshCw size={16} /> Request update</button>}
          {usageAllowed && (fulfilled || r.status === 'task_completed') && <button className="btn ghost" onClick={() => setModal('rate')}><Star size={16} /> {r.performance?.rating ? 'Change rating' : 'Rate performance'}</button>}
          {canEdit && <button className="btn ghost" onClick={() => setModal('edit')}><Pencil size={16} /> Edit</button>}
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 18, overflowX: 'auto' }}>
        <StatusFlow status={r.status} meta={meta} updates={r.updateCount || 0} />
      </section>

      {open && NOTICE[r.status] && !ready && <div className={`notice ${r.status === 'update_needed' ? 'orange' : ''}`}>{NOTICE[r.status](manager)}</div>}
      {openUpdate && (
        <section className="panel update-panel" style={{ marginBottom: 18 }}>
          <h2 className="row" style={{ gap: 8 }}><RefreshCw size={18} /> Update #{r.updateCount} requested</h2>
          <p style={{ marginTop: 8 }}><b>Reason:</b> {openUpdate.reason}</p>
          {openUpdate.description && <p className="brief" style={{ marginTop: 4 }}>{openUpdate.description}</p>}
          {openUpdate.references?.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6, marginTop: 4, overflowWrap: 'anywhere' }}><ExternalLink size={14} />{strip(l)}</a>)}
          <p className="tiny muted" style={{ marginTop: 6 }}>By {openUpdate.requestedBy?.name} · {fmtDateTime(openUpdate.at)}</p>
        </section>
      )}
      {ready && <div className="notice good">{manager ? 'Every task is reviewed and closed. Mark it fulfilled to notify the raiser.' : 'All creatives are done. The coordinator will mark this fulfilled shortly.'}</div>}
      {fulfilled && (
        <div className="notice good">
          Fulfilled by {r.fulfilledBy?.name} on {fmtDate(r.fulfilledAt)}{r.updateCount ? ` (after ${r.updateCount} update${r.updateCount > 1 ? 's' : ''})` : ''}.{r.fulfillNote ? ` “${r.fulfillNote}”` : ''}{' '}
          {usageAllowed ? 'Use the creative, then click "Mark used / published". If something needs changing, click "Request update".' : 'Waiting for marketing to mark usage.'}
        </div>
      )}
      {r.status === 'task_completed' && r.usage?.note && (
        <section className="panel usage-panel" style={{ marginBottom: 18 }}>
          <h2 className="row" style={{ gap: 8 }}><Flag size={18} /> Completed · used as {meta.USAGE_TYPES[r.usageType]?.label}</h2>
          <p style={{ marginTop: 8 }}>{r.usage.note}</p>
          {r.usage.link && <a href={r.usage.link} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6, marginTop: 6 }}><ExternalLink size={14} />Live link</a>}
          {r.performance?.rating && <p style={{ marginTop: 8 }}><PerformancePill rating={r.performance.rating} meta={meta} /> {r.performance.note && <span className="small">{r.performance.note}</span>}</p>}
          <p className="tiny muted" style={{ marginTop: 6 }}>Published {fmtDate(r.usage.date || r.usage.at)} · marked by {r.usage.by?.name} · {fmtDateTime(r.usage.at)}</p>
        </section>
      )}

      <div className="detail-grid">
        <div className="stack" style={{ gap: 18 }}>
          <section className="panel">
            <div className="panel-head"><h2>Tasks</h2><span className="small muted">{r.tasks.filter((t) => t.status === 'closed').length} of {r.tasks.filter((t) => t.status !== 'cancelled').length} closed</span></div>
            {r.tasks.length === 0 ? (
              <Empty title="No tasks yet" action={manager && open && r.status !== 'new' && <button className="btn sm" onClick={() => setModal('task')}><Plus size={15} /> Assign task</button>}>
                {manager ? (r.status === 'new' ? 'Review and approve it first.' : 'Assign it to internal staff or outsource it. Create several tasks if it needs both Creative and Production.') : 'The coordinator will assign this.'}
              </Empty>
            ) : <div className="list">{r.tasks.map((t) => <TaskRow key={t._id} t={t} meta={meta} />)}</div>}
            {r.tasks.filter((t) => t.driveLink).length > 0 && (
              <div className="deliverables">
                <h3>Delivered files</h3>
                {r.tasks.filter((t) => t.driveLink).map((t) => (
                  <a key={t._id} href={t.driveLink} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6 }}><ExternalLink size={14} />{t.code} · {t.driveFileName || 'Google Drive link'}</a>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginBottom: 10 }}>Details</h2>
            {r.purpose && <p style={{ marginBottom: 8 }}><b>Usage purpose:</b> {r.purpose}</p>}
            {r.description ? <p className="brief">{r.description}</p> : !r.purpose && <p className="muted small">No details.</p>}
            {r.references?.length > 0 && (
              <>
                <h3 style={{ margin: '16px 0 8px' }}>Reference files</h3>
                <div className="stack" style={{ gap: 4 }}>
                  {r.references.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6, overflowWrap: 'anywhere' }}><ExternalLink size={14} />{strip(l)}</a>)}
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginBottom: 6 }}>Comments</h2>
            {r.comments.length === 0 && <p className="muted small" style={{ marginBottom: 10 }}>No comments yet.</p>}
            {r.comments.map((m) => (
              <div key={m._id} className="comment">
                <div className="row small" style={{ gap: 8 }}><Avatar name={m.user?.name} department={m.user?.department} size="sm" /><b>{m.user?.name}</b><span className="muted">{ago(m.at)}</span></div>
                <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.text}</p>
              </div>
            ))}
            <form className="row" style={{ marginTop: 12, alignItems: 'stretch' }} onSubmit={async (e) => {
              e.preventDefault(); if (!comment.trim()) return;
              try { setR(await post(`/requirements/${id}/comments`, { text: comment })); setComment(''); } catch (ex) { toast(ex.message, 'err'); }
            }}>
              <input className="input" style={{ flex: 1 }} placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
              <button className="btn" disabled={!comment.trim()}>Post</button>
            </form>
          </section>
        </div>

        <aside className="stack" style={{ gap: 18 }}>
          <section className="panel">
            <h2 style={{ marginBottom: 12 }}>Summary</h2>
            <dl className="kv">
              <dt>Requirement type</dt><dd>{meta.USAGE_TYPES[r.usageType]?.label || '—'}</dd>
              <dt>Department</dt><dd>{r.department ? <DeptTag dept={r.department} meta={meta} /> : '—'}</dd>
              <dt>Raised by</dt><dd>{r.raisedBy?.name} · {fmtDate(r.createdAt)}</dd>
              <dt>Deadline</dt><dd>{r.deadline ? fmtDate(r.deadline) : 'None'}</dd>
              <dt>Handled by</dt><dd>{r.sourcing === 'outsourced' ? 'Outsourced' : 'Internal'}{r.targetDepartment ? ` · ${meta.DEPARTMENTS[r.targetDepartment]?.label}` : ''}</dd>
              {r.approvedBy && <><dt>Approved</dt><dd>{r.approvedBy.name} · {fmtDate(r.approvedAt)}</dd></>}
              {r.reviewNote && <><dt>Review note</dt><dd>{r.reviewNote}</dd></>}
              {r.fulfilledAt && <><dt>Fulfilled</dt><dd>{fmtDate(r.fulfilledAt)}</dd></>}
              {r.updateCount > 0 && <><dt>Updates</dt><dd>{r.updateCount}</dd></>}
              {r.performance?.rating && <><dt>Performance</dt><dd><PerformancePill rating={r.performance.rating} meta={meta} /></dd></>}
              {r.tasks.some((t) => t.vendor?.cost) && <><dt>Vendor cost</dt><dd>{money(r.tasks.reduce((s, t) => s + (t.vendor?.cost || 0), 0))}</dd></>}
            </dl>
          </section>
          {r.updateRequests?.length > 0 && (
            <section className="panel">
              <h2 style={{ marginBottom: 12 }}>Update requests</h2>
              <div className="stack" style={{ gap: 10 }}>
                {r.updateRequests.map((u, i) => (
                  <div key={u._id} className="update-item">
                    <div className="spread"><b>#{i + 1} · {u.reason}</b><span className={`pill ${u.status === 'open' ? 'f-orange' : 'f-green'}`}>{u.status === 'open' ? 'In progress' : 'Done'}</span></div>
                    <div className="tiny muted">{u.requestedBy?.name} · {fmtDate(u.at)}{u.fulfilledAt ? ` → fulfilled ${fmtDate(u.fulfilledAt)}` : ''}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h2 style={{ marginBottom: 12 }}>Status history</h2>
            <ul className="timeline">
              {[...r.activity].reverse().map((a, i) => (
                <li key={i}><div><b>{a.user?.name || 'System'}</b> <span>{a.message.charAt(0).toLowerCase() + a.message.slice(1)}</span><div className="tiny muted">{fmtDateTime(a.at)}</div></div></li>
              ))}
            </ul>
          </section>
          <div className="row">
            {open && (manager || owner) && <button className="btn danger sm" onClick={cancel}><Ban size={15} /> Cancel requirement</button>}
            {user.role === 'admin' && (
              <button className="btn danger sm" onClick={async () => {
                if (!window.confirm('Delete this requirement and all its tasks permanently?')) return;
                try { await api(`/requirements/${id}`, { method: 'DELETE' }); toast('Deleted'); nav('/requirements'); } catch (e) { toast(e.message, 'err'); }
              }}><Trash2 size={15} /> Delete</button>
            )}
          </div>
        </aside>
      </div>

      {modal === 'approve' && <ApproveModal r={r} meta={meta} onClose={() => setModal(null)} onSave={(b) => act('approve', b, 'Approved')} />}
      {modal === 'task' && <CreateTaskModal r={r} meta={meta} people={people} vendors={vendors} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === 'edit' && <EditModal r={r} meta={meta} user={user} campaigns={campaigns} onClose={() => setModal(null)} onSaved={(x) => { setR(x); setModal(null); toast('Saved'); }} />}
      {modal === 'fulfill' && <FulfillModal r={r} onClose={() => setModal(null)} onSave={(b) => act('fulfill', b, 'Marked fulfilled. The raiser has been notified')} />}
      {modal === 'update' && <UpdateRequestModal r={r} onClose={() => setModal(null)} onSave={(b) => act('update-request', b, 'Update requested. The same staff / vendor have been notified')} />}
      {modal === 'usage' && <UsageModal r={r} meta={meta} campaigns={campaigns} onClose={() => setModal(null)} onSave={(b) => act('usage', b, 'Marked as used. Task completed')} />}
      {modal === 'rate' && <PerformanceModal r={r} meta={meta} onClose={() => setModal(null)} onSave={(b) => act('performance', b, 'Performance saved')} />}
    </>
  );
}

