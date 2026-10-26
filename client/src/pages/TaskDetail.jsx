import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Hand, Play, CheckCircle2, UserPlus, AlertTriangle, ListOrdered, Pencil, ShieldCheck, Undo2, Trash2, Link2, RefreshCw, Pause, Truck, Phone, Mail } from 'lucide-react';
import { api, post, patch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, DeptTag, Due, Loader, Modal, PriorityPill, TaskStatus, ConflictPill, PerformancePill } from '../components/ui.jsx';
import Celebration from '../components/Celebration.jsx';
import { ACTIVE_TASKS as ACTIVE_TASK, ago, fmtDate, fmtDateTime, isManager, isAdmin, isVendor, toInputDate, cap, money } from '../utils.js';

const stripUrl = (l) => l.replace(/^https?:\/\//, '').slice(0, 70);

function CompleteModal({ t, onClose, onSave }) {
  const isUpdate = Boolean(t.update?.active);
  // For an update, start empty so the staff member pastes the NEW file link
  const [driveLink, setLink] = useState(isUpdate ? '' : t.driveLink || '');
  const [note, setNote] = useState('');
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const verify = async () => { setCheck({ loading: true }); try { setCheck(await post('/drive/validate', { url: driveLink })); } catch (e) { setCheck({ valid: false, message: e.message }); } };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return; // ignore a second click while saving
    setBusy(true);
    try { await onSave({ driveLink, note }); } finally { setBusy(false); }
  };
  return (
    <Modal title={isUpdate ? `Submit update #${t.update.round}` : 'Mark as fulfilled'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="small muted">
          {isUpdate
            ? 'Upload the updated files to Google Drive, set sharing to "Anyone with the link", then paste the new link here.'
            : 'Upload the finished files to Google Drive, set sharing to "Anyone with the link", then paste the link here.'}
        </p>
        <label className="field">
          <span>{isUpdate ? 'New Google Drive link' : 'Google Drive link'}</span>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" type="url" required placeholder="https://drive.google.com/…" value={driveLink} onChange={(e) => { setLink(e.target.value); setCheck(null); }} />
            <button type="button" className="btn ghost" onClick={verify} disabled={!driveLink || busy}><Link2 size={16} /> Check</button>
          </div>
          {check && !check.loading && (
            <small className={check.valid && check.accessible !== false ? 'ok-text' : 'late-text'}>
              {!check.valid ? check.message : check.accessible ? `Found "${check.name}"` : check.checked ? check.message : 'Link format looks right.'}
            </small>
          )}
          {isUpdate && t.driveLink && <small>Previous link: <a href={t.driveLink} target="_blank" rel="noreferrer">{stripUrl(t.driveLink)}</a></small>}
        </label>
        <label className="field"><span>Note for the reviewer <span className="muted">(optional)</span></span><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isUpdate ? 'What you changed' : ''} /></label>
        <button className="btn go" disabled={busy}>
          <CheckCircle2 size={17} /> {busy ? 'Submitting…' : isUpdate ? 'Submit updated deliverable' : 'Submit and mark fulfilled'}
        </button>
      </form>
    </Modal>
  );
}

function AssignModal({ t, people, meta, onClose, onSave }) {
  const staff = people.filter((p) => p.role === 'staff' && p.department === t.department);
  const [userId, setUserId] = useState(t.assignee?._id || '');
  return (
    <Modal title={t.assignee ? 'Reassign task' : 'Assign task'} onClose={onClose}>
      {staff.length === 0 ? <p className="muted">Nobody is in the {meta.DEPARTMENTS[t.department].label} yet. Add people from Users & roles.</p> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave(userId || null); }}>
          <div className="stack" style={{ gap: 6 }}>
            {staff.map((p) => (
              <label key={p._id} className={`pick ${userId === p._id ? 'on' : ''}`}>
                <input type="radio" name="who" checked={userId === p._id} onChange={() => setUserId(p._id)} />
                <Avatar name={p.name} department={p.department} size="sm" /> {p.name}
              </label>
            ))}
            {t.assignee && (
              <label className={`pick ${userId === '' ? 'on' : ''}`}><input type="radio" name="who" checked={userId === ''} onChange={() => setUserId('')} /> Unassign (back to the department)</label>
            )}
          </div>
          <button className="btn">Save</button>
        </form>
      )}
    </Modal>
  );
}

function PositionModal({ t, meta, onClose, onSave, title = 'Priority and order', withResolution }) {
  const [priority, setPriority] = useState(t.priority);
  const [position, setPosition] = useState(t.order || '');
  const [resolution, setResolution] = useState('');
  const active = ACTIVE_TASK.includes(t.status);
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ priority, position: position ? Number(position) : null, resolution }); }}>
        {withResolution && (
          <>
            <div className="notice small"><b>{t.conflict.raisedBy?.name}:</b> {t.conflict.reason}</div>
            <label className="field"><span>Resolution</span><textarea className="textarea" required value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What you decided and why" /></label>
          </>
        )}
        {active && (
          <div className="form-grid">
            <div className="field"><span>Priority</span><div className="seg">{meta.PRIORITIES.map((p) => <button type="button" key={p} aria-pressed={priority === p} onClick={() => setPriority(p)}>{cap(p)}</button>)}</div></div>
            <label className="field"><span>Order number</span><input className="input" type="number" min="1" value={position} onChange={(e) => setPosition(e.target.value)} /><small>1 = first in this person's queue. Others shift down.</small></label>
          </div>
        )}
        <button className="btn">{withResolution ? 'Resolve conflict' : 'Save order'}</button>
      </form>
    </Modal>
  );
}

function EditModal({ t, meta, onClose, onSave }) {
  const out = t.sourcing === 'outsourced';
  const [f, setF] = useState({ title: t.title, notes: t.notes || '', deadline: toInputDate(t.deadline), allowSelfAssign: t.allowSelfAssign, department: t.department });
  const [v, setV] = useState({ user: t.vendor?.user?._id || '', name: t.vendor?.name || '', contact: t.vendor?.contact || '', phone: t.vendor?.phone || '', email: t.vendor?.email || '', cost: t.vendor?.cost ?? '' });
  return (
    <Modal title={out ? 'Edit outsourced project' : 'Edit task'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, deadline: f.deadline || null, ...(out ? { vendor: v } : {}) }); }}>
        {out && (
          <div className="vendor-box form-grid">
            <label className="field"><span>Vendor name</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></label>
            <label className="field"><span>Contact person</span><input className="input" value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} /></label>
            <label className="field"><span>Phone</span><input className="input" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></label>
            <label className="field"><span>Email</span><input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></label>
            <label className="field"><span>Cost (₹)</span><input className="input" type="number" min="0" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} /></label>
          </div>
        )}
        <label className="field"><span>Title</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></label>
        <label className="field"><span>Instructions</span><textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <div className="form-grid">
          <label className="field"><span>Deadline</span><input className="input" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
          <label className="field"><span>Department</span><select className="select" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} disabled={!ACTIVE_TASK.includes(t.status)}>
            {meta.WORK_DEPARTMENTS.map((d) => <option key={d} value={d}>{meta.DEPARTMENTS[d].label}</option>)}
          </select></label>
        </div>
        {f.department !== t.department && t.assignee && <small className="late-text">Changing department removes {t.assignee.name} from the task.</small>}
        {!out && <label className="row switch"><input type="checkbox" checked={f.allowSelfAssign} onChange={(e) => setF({ ...f, allowSelfAssign: e.target.checked })} /> Allow self-assignment</label>}
        <button className="btn">Save changes</button>
      </form>
    </Modal>
  );
}

function TextModal({ title, label, button, required, kind = '', onClose, onSave, children }) {
  const [text, setText] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSave(text); }}>
        {children}
        <label className="field"><span>{label}</span><textarea className="textarea" required={required} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button className={`btn ${kind}`}>{button}</button>
      </form>
    </Modal>
  );
}

const KIND_LABEL = { conflict: 'Conflict', update: 'Update request', feedback: 'Feedback' };
const KIND_CLASS = { conflict: 'late', update: 'f-orange', feedback: 's-review' };

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, meta } = useAuth();
  const toast = useToast();
  const [t, setT] = useState(null);
  const [people, setPeople] = useState([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [comment, setComment] = useState('');
  const [party, setParty] = useState(null); // 🎉 on-time celebration
  const manager = isManager(user); // director, admin or coordinator

  const load = useCallback(() => api(`/tasks/${id}`).then(setT).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); if (manager) api('/users?active=true&role=staff').then(setPeople).catch(() => {}); }, [load, manager]);

  const act = async (path, body, msg) => {
    try {
      const next = await post(`/tasks/${id}/${path}`, body);
      setT(next); setModal(null);
      if (next.celebrate?.onTime) setParty(next.celebrate);
      if (next.warning) toast(next.warning, 'err'); else if (msg && !next.celebrate?.onTime) toast(msg);
      window.dispatchEvent(new Event('cd:notifications'));
    } catch (e) {
      toast(e.message, 'err');
      // The task changed meanwhile (another tab, or someone else acted): close the form and show the real status
      if (/cannot be completed now|already|only submitted|not paused/i.test(e.message)) { setModal(null); load(); }
    }
  };

  if (err) return <div className="error-box">{err}</div>;
  if (!t) return <Loader />;

  const out = t.sourcing === 'outsourced';
  const vendorMe = isVendor(user) && t.vendor?.user?._id === user._id;
  const mine = t.assignee?._id === user._id || vendorMe; // person (or vendor) doing the work
  const sameDept = user.role === 'staff' && user.department === t.department && !out;
  const showNumber = !out && t.order && (t.queueSize || 0) > 1;
  const active = ACTIVE_TASK.includes(t.status);
  const isUpdate = Boolean(t.update?.active);
  const req = t.requirement;

  return (
    <>
      <Link to={isVendor(user) ? '/' : out ? '/outsourced' : '/tasks'} className="row small muted back"><ArrowLeft size={15} /> {isVendor(user) ? 'My outsourced work' : out ? 'Outsourced Projects' : 'Task Management'}</Link>
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="code">{t.code}</span>
            <DeptTag dept={t.department} meta={meta} />
            <TaskStatus status={t.status} sourcing={t.sourcing} meta={meta} />
            <PriorityPill value={t.priority} order={showNumber ? t.order : null} />
            {out && <span className="pill out-tag"><Truck size={12} /> Outsourced</span>}
            <Due date={t.deadline} closed={!active} />
            {t.conflict?.active && <ConflictPill />}
            {isUpdate && <span className="pill f-orange"><RefreshCw size={12} /> Update #{t.update.round}</span>}
          </div>
          <h1>{t.title}</h1>
          {req && <p className="small muted" style={{ marginTop: 6 }}>For {isVendor(user) ? <b>{req.code} · {req.title}</b> : <Link to={`/requirements/${req._id}`}>{req.code} · {req.title}</Link>} ({meta.REQUIREMENT_TYPES[req.type]}{req.department ? `, ${meta.DEPARTMENTS[req.department].label}` : ''})</p>}
        </div>
      </div>

      {/* Actions */}
      <section className="panel action-bar">
        {sameDept && t.status === 'open' && t.allowSelfAssign && <button className="btn" onClick={() => act('self-assign', {}, 'Task assigned to you')}><Hand size={16} /> Take this task</button>}
        {sameDept && t.status === 'open' && !t.allowSelfAssign && <span className="small muted">The coordinator will assign this task.</span>}
        {mine && t.status === 'assigned' && <button className="btn" onClick={() => act('start', {}, 'Marked in progress')}><Play size={16} /> {isUpdate ? 'Start the update' : out ? 'Mark Ongoing' : 'Mark in progress'}</button>}
        {mine && ['assigned', 'in_progress', 'paused'].includes(t.status) && <button className="btn go" onClick={() => setModal('complete')}><CheckCircle2 size={16} /> {isUpdate ? 'Submit update' : 'Mark as fulfilled'}</button>}
        {(mine || manager) && out && ['assigned', 'in_progress'].includes(t.status) && <button className="btn ghost" onClick={() => setModal('pause')}><Pause size={16} /> Pause</button>}
        {(mine || manager) && t.status === 'paused' && <button className="btn" onClick={() => act('resume', {}, 'Resumed · Ongoing')}><Play size={16} /> Resume</button>}
        {(mine || sameDept) && active && !t.conflict?.active && <button className="btn ghost" onClick={() => setModal('conflict')}><AlertTriangle size={16} /> Raise conflict</button>}
        {mine && !out && active && <button className="btn ghost" onClick={() => act('release', {}, 'Released back to the department')}>Release</button>}
        {manager && out && !vendorMe && t.status === 'assigned' && <button className="btn ghost" onClick={() => act('start', {}, 'Marked Ongoing')}><Play size={16} /> Mark Ongoing</button>}
        {manager && out && ['assigned', 'in_progress', 'paused'].includes(t.status) && <button className="btn ghost" onClick={() => setModal('complete')}><CheckCircle2 size={16} /> Add deliverable</button>}

        {manager && t.status === 'completed' && (<>
          <button className="btn go" onClick={() => setModal('close')}><ShieldCheck size={16} /> Review and close</button>
          <button className="btn ghost" onClick={() => setModal('rework')}><Undo2 size={16} /> Request changes</button>
        </>)}
        {manager && t.conflict?.active && <button className="btn" onClick={() => setModal('resolve')}><AlertTriangle size={16} /> Resolve conflict</button>}
        {manager && active && !out && <button className="btn ghost" onClick={() => setModal('assign')}><UserPlus size={16} /> {t.assignee ? 'Reassign' : 'Assign'}</button>}
        {manager && active && !out && <button className="btn ghost" onClick={() => setModal('position')}><ListOrdered size={16} /> Priority & order</button>}
        {manager && !['closed', 'cancelled'].includes(t.status) && <button className="btn ghost" onClick={() => setModal('edit')}><Pencil size={15} /> Edit</button>}
        {!manager && !mine && !sameDept && <span className="small muted">You can follow this task. {out ? `It is outsourced to ${t.vendor?.name}.` : `Only ${meta.DEPARTMENTS[t.department].label} staff work on it.`}</span>}
        {t.status === 'closed' && <span className="small ok-text">Reviewed and closed by {t.reviewedBy?.name} on {fmtDate(t.closedAt)}.</span>}
      </section>

      <div className="detail-grid">
        <div className="stack" style={{ gap: 18 }}>
          {t.status === 'paused' && (
            <section className="panel update-panel">
              <h2 className="row" style={{ gap: 8 }}><Pause size={18} /> Paused</h2>
              <p style={{ marginTop: 6 }}>{t.pauseReason || 'No reason given.'}</p>
              <p className="tiny muted" style={{ marginTop: 4 }}>Since {fmtDateTime(t.pausedAt)}</p>
            </section>
          )}
          {isUpdate && (
            <section className="panel update-panel">
              <h2 className="row" style={{ gap: 8 }}><RefreshCw size={18} /> Update #{t.update.round} requested</h2>
              <p style={{ marginTop: 8 }}><b>Reason:</b> {t.update.reason}</p>
              {t.update.description && <p className="brief" style={{ marginTop: 4 }}>{t.update.description}</p>}
              {t.update.references?.map((l) => (
                <a key={l} href={l} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6, marginTop: 4, overflowWrap: 'anywhere' }}><ExternalLink size={14} />{stripUrl(l)}</a>
              ))}
              <p className="small muted" style={{ marginTop: 6 }}>
                Requested {t.update.at ? ago(t.update.at) : ''}. Work on the update, then submit the new Drive link{t.driveLink ? ' (the previous link is below)' : ''}.
              </p>
            </section>
          )}

          {t.conflict?.active && (
            <section className="panel conflict-panel">
              <h2 className="row" style={{ gap: 8 }}><AlertTriangle size={18} /> Conflict raised</h2>
              <p style={{ marginTop: 8 }}>{t.conflict.reason}</p>
              <p className="small muted" style={{ marginTop: 6 }}>By {t.conflict.raisedBy?.name} · {ago(t.conflict.raisedAt)}. Coordinators, admins and directors have been notified.</p>
            </section>
          )}

          {(t.driveLink || t.status === 'completed' || t.status === 'closed') && (
            <section className="panel">
              <h2 style={{ marginBottom: 10 }}>{isUpdate ? 'Previous submission' : 'Submitted work'}</h2>
              {t.driveLink ? (
                <div className="stack" style={{ gap: 6 }}>
                  <a href={t.driveLink} target="_blank" rel="noreferrer" className="drive-link"><ExternalLink size={16} />{t.driveFileName || 'Open in Google Drive'}</a>
                  <span className={`small ${t.driveChecked ? 'ok-text' : 'muted'}`}>{t.driveChecked ? 'Link checked: file is shared and opens' : 'Link format checked'}</span>
                  {t.submissionNote && <p className="muted">“{t.submissionNote}”</p>}
                  {t.completedBy && <span className="tiny muted">Submitted by {t.completedBy?.name}{t.submittedAt ? ` · ${fmtDateTime(t.submittedAt)}` : ''}</span>}
                </div>
              ) : <p className="muted small">No link yet.</p>}
            </section>
          )}

          <section className="panel">
            <h2 style={{ marginBottom: 10 }}>Instructions</h2>
            {t.notes ? <p className="brief">{t.notes}</p> : <p className="muted small">No extra instructions.</p>}
            {req?.description && (<><h3 style={{ margin: '16px 0 6px' }}>Requirement brief</h3><p className="brief small">{req.description}</p></>)}
            {req?.references?.length > 0 && (
              <div className="stack" style={{ gap: 4, marginTop: 10 }}>
                {req.references.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" className="row small" style={{ gap: 6, overflowWrap: 'anywhere' }}><ExternalLink size={14} />{stripUrl(l)}</a>)}
              </div>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginBottom: 6 }}>Comments & feedback</h2>
            {t.comments.length === 0 && <p className="muted small" style={{ marginBottom: 10 }}>No comments yet.</p>}
            {t.comments.map((m) => (
              <div key={m._id} className="comment">
                <div className="row small" style={{ gap: 8 }}>
                  <Avatar name={m.user?.name} department={m.user?.department} size="sm" /><b>{m.user?.name}</b>
                  {m.kind !== 'comment' && <span className={`pill ${KIND_CLASS[m.kind] || ''}`}>{KIND_LABEL[m.kind] || m.kind}</span>}
                  <span className="muted">{ago(m.at)}</span>
                </div>
                <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.text}</p>
              </div>
            ))}
            <form className="row" style={{ marginTop: 12, alignItems: 'stretch' }} onSubmit={async (e) => {
              e.preventDefault(); if (!comment.trim()) return;
              await act('comments', { text: comment }); setComment('');
            }}>
              <input className="input" style={{ flex: 1 }} placeholder={manager ? 'Write feedback' : 'Write a comment'} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
              <button className="btn" disabled={!comment.trim()}>Post</button>
            </form>
          </section>
        </div>

        <aside className="stack" style={{ gap: 18 }}>
          <section className="panel">
            <h2 style={{ marginBottom: 12 }}>Details</h2>
            <dl className="kv">
              <dt>Department</dt><dd>{meta.DEPARTMENTS[t.department].label}</dd>
              {out && <><dt>Vendor</dt><dd><b>{t.vendor?.name}</b>{t.vendor?.contact ? ` · ${t.vendor.contact}` : ''}
                {t.vendor?.phone && <div className="row small" style={{ gap: 4 }}><Phone size={12} />{t.vendor.phone}</div>}
                {t.vendor?.email && <div className="row small" style={{ gap: 4 }}><Mail size={12} />{t.vendor.email}</div>}
                {t.vendor?.user && <div className="tiny muted">Has a vendor login</div>}</dd>
                <dt>Cost</dt><dd>{money(t.vendor?.cost)}</dd></>}
              {!out && <><dt>Assigned to</dt><dd>{t.assignee ? <span className="row" style={{ gap: 6 }}><Avatar name={t.assignee.name} department={t.department} size="sm" />{t.assignee.name}{mine && ' (you)'}</span> : '—'}</dd>
              {t.assignedAt && <><dt>Assigned</dt><dd>{t.selfAssigned ? 'Self-assigned' : `By ${t.assignedBy?.name}`} · {fmtDate(t.assignedAt)}</dd></>}</>}
              <dt>Priority</dt><dd><PriorityPill value={t.priority} order={showNumber ? t.order : null} />{showNumber && <span className="tiny muted"> of {t.queueSize}</span>}</dd>
              <dt>Deadline</dt><dd>{t.deadline ? fmtDate(t.deadline) : 'None'}</dd>
              {!out && <><dt>Self-assign</dt><dd>{t.allowSelfAssign ? 'Allowed' : 'Off'}</dd></>}
              {req?.usageType && <><dt>Requirement type</dt><dd>{meta.USAGE_TYPES[req.usageType]?.label}</dd></>}
              {req?.campaign?.name && <><dt>Campaign</dt><dd>{req.campaign.name}</dd></>}
              {req?.performance?.rating && <><dt>Performance</dt><dd><PerformancePill rating={req.performance.rating} meta={meta} /></dd></>}
              {t.startedAt && <><dt>Started</dt><dd>{fmtDateTime(t.startedAt)}</dd></>}
              {t.reworkCount > 0 && <><dt>Changes asked</dt><dd>{t.reworkCount}×</dd></>}
              {t.update?.round > 0 && <><dt>Update requests</dt><dd>{t.update.round}{isUpdate ? ' (one open)' : ''}</dd></>}
              {t.conflict?.count > 0 && <><dt>Conflicts</dt><dd>{t.conflict.count}{!t.conflict.active && t.conflict.resolution ? ` · last: ${t.conflict.resolution}` : ''}</dd></>}
            </dl>
          </section>
          <section className="panel">
            <h2 style={{ marginBottom: 12 }}>Status & history</h2>
            <ul className="timeline">
              {[...t.activity].reverse().map((a, i) => (
                <li key={i}><div><b>{a.user?.name || 'System'}</b> <span>{a.message.charAt(0).toLowerCase() + a.message.slice(1)}</span><div className="tiny muted">{fmtDateTime(a.at)}</div></div></li>
              ))}
            </ul>
          </section>
          {isAdmin(user) && (
            <button className="btn danger sm" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              if (!window.confirm('Delete this task permanently?')) return;
              try { await api(`/tasks/${id}`, { method: 'DELETE' }); toast('Deleted'); nav(out ? '/outsourced' : '/tasks'); } catch (e) { toast(e.message, 'err'); }
            }}><Trash2 size={15} /> Delete task</button>
          )}
        </aside>
      </div>
      {party && <Celebration data={party} name={user.name} onClose={() => setParty(null)} />}
      {modal === 'complete' && <CompleteModal t={t} onClose={() => setModal(null)} onSave={(b) => act('complete', b, isUpdate ? 'Update submitted. The coordinator will review it' : 'Submitted. The coordinator will review it')} />}
      {modal === 'assign' && <AssignModal t={t} people={people} meta={meta} onClose={() => setModal(null)} onSave={(userId) => act('assign', { userId }, userId ? 'Assigned' : 'Unassigned')} />}
      {modal === 'position' && <PositionModal t={t} meta={meta} onClose={() => setModal(null)} onSave={(b) => act('position', b, 'Order updated')} />}
      {modal === 'resolve' && <PositionModal t={t} meta={meta} title="Resolve conflict" withResolution onClose={() => setModal(null)} onSave={(b) => act('conflict/resolve', b, 'Conflict resolved')} />}
      {modal === 'edit' && <EditModal t={t} meta={meta} onClose={() => setModal(null)} onSave={async (b) => { try { setT(await patch(`/tasks/${id}`, b)); setModal(null); toast('Saved'); } catch (e) { toast(e.message, 'err'); } }} />}
      {modal === 'conflict' && (
        <TextModal title="Raise a conflict" label="What's the conflict?" button="Raise conflict" required onClose={() => setModal(null)} onSave={(reason) => act('conflict', { reason }, 'Conflict raised. Coordinators have been notified')}>
          <p className="small muted">Use this when deadlines clash, priorities need re-ordering, or something blocks the work.</p>
        </TextModal>
      )}
      {modal === 'pause' && <TextModal title="Pause project" label="Reason (optional)" button="Pause" onClose={() => setModal(null)} onSave={(reason) => act('pause', { reason }, 'Paused')} />}
      {modal === 'close' && <TextModal title="Review and close" label="Feedback (optional)" button="Close task" kind="go" onClose={() => setModal(null)} onSave={(feedback) => act('review', { action: 'close', feedback }, 'Task closed')} />}
      {modal === 'rework' && <TextModal title="Request changes" label="What needs to change?" button="Send back" required onClose={() => setModal(null)} onSave={(feedback) => act('review', { action: 'rework', feedback }, 'Sent back to the staff')} />}
    </>
  );
}