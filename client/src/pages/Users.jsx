import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, post, patch } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Loader, Modal, DeptTag, Empty } from '../components/ui.jsx';

const ROLE_HELP = {
  admin: 'Full access: users, requirement types, reports, audit log and delete.',
  coordinator: 'Reviews and approves requirements, assigns or outsources tasks, sets priorities, reviews work, sends alerts.',
  staff: 'Raises requirements (Marketing, Tech, Outlet, Production) and/or works on tasks (Creative, Production).',
  vendor: 'Limited access: sees only the outsourced projects sent to them. Can mark them ongoing, pause/resume and submit Drive links.',
};

function PersonModal({ person, me, meta, onClose, onSaved }) {
  const editing = Boolean(person);
  const [f, setF] = useState({
    name: person?.name || '', email: person?.email || '', phone: person?.phone || '',
    role: person?.role || 'staff', department: person?.department || 'marketing', company: person?.company || '',
    password: '', active: person?.active ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const vendor = f.role === 'vendor';

  const changeRole = (e) => {
    const role = e.target.value;
    // staff always need a department; vendors never have one
    setF((x) => ({ ...x, role, department: role === 'staff' && !x.department ? 'marketing' : x.department }));
  };

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    const body = { ...f, department: vendor ? null : (f.department || null), company: vendor ? f.company.trim() : f.company || undefined };
    if (editing && !body.password) delete body.password;
    try { onSaved(editing ? await patch(`/users/${person._id}`, body) : await post('/users', body), editing); } catch (ex) { setErr(ex.message); }
  };

  return (
    <Modal title={editing ? `Edit ${person.name}` : 'Add a user'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field"><span>{vendor ? 'Contact person' : 'Name'}</span><input className="input" value={f.name} onChange={set('name')} required /></label>
        <div className="form-grid">
          <label className="field"><span>Email</span><input className="input" type="email" value={f.email} onChange={set('email')} required /></label>
          <label className="field"><span>Phone</span><input className="input" value={f.phone} onChange={set('phone')} /></label>
          <label className="field"><span>Role</span>
            <select className="select" value={f.role} onChange={changeRole} disabled={editing && person._id === me._id}>
              {Object.entries(meta.ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {vendor ? (
            <label className="field"><span>Vendor company</span>
              <input className="input" value={f.company} onChange={set('company')} required placeholder="e.g. PrintHub Studio" />
            </label>
          ) : (
            <label className="field"><span>Department</span>
              <select className="select" value={f.department || ''} onChange={set('department')}>
                {f.role !== 'staff' && <option value="">None</option>}
                {Object.entries(meta.DEPARTMENTS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="tiny muted">{ROLE_HELP[f.role]}</p>
        <label className="field"><span>{editing ? 'New password' : 'Password'}</span>
          <input className="input" type="password" minLength={6} value={f.password} onChange={set('password')} required={!editing} placeholder={editing ? 'Leave empty to keep the current one' : 'At least 6 characters'} />
        </label>
        {editing && person._id !== me._id && <label className="row switch"><input type="checkbox" checked={f.active} onChange={set('active')} /> Account is active</label>}
        {err && <div className="error-box">{err}</div>}
        <button className="btn">{editing ? 'Save changes' : vendor ? 'Add vendor' : 'Add user'}</button>
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => { api('/users').then(setPeople).catch((e) => toast(e.message, 'err')); }, [toast]);
  if (user.role !== 'admin') return <Empty title="Only admins manage users and roles" />;
  if (!people) return <Loader />;

  const groups = [
    { key: 'managers', label: 'Admins and coordinators', list: people.filter((p) => ['admin', 'coordinator'].includes(p.role)) },
    ...Object.entries(meta.DEPARTMENTS).map(([k, d]) => ({
      key: k, label: d.label,
      note: [d.raises && 'raises requirements', d.works && 'works on tasks'].filter(Boolean).join(', '),
      list: people.filter((p) => p.role === 'staff' && p.department === k),
    })),
    { key: 'vendors', label: 'External vendors', note: 'limited access · outsourced projects only', list: people.filter((p) => p.role === 'vendor') },
  ];
  const activeCount = people.filter((p) => p.active).length;
  const vendorCount = people.filter((p) => p.role === 'vendor' && p.active).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users & roles</h1>
          <p className="muted">{activeCount} active users across {Object.keys(meta.DEPARTMENTS).length} departments{vendorCount ? `, including ${vendorCount} external vendor${vendorCount > 1 ? 's' : ''}` : ''}.</p>
        </div>
        <button className="btn" onClick={() => setModal({ person: null })}><UserPlus size={18} /> Add user</button>
      </div>
      <div className="stack" style={{ gap: 18 }}>
        {groups.map((g) => (
          <section key={g.key} className={`panel t-${g.key}`}>
            <div className="panel-head">
              <h2 className="row" style={{ gap: 10 }}>{!['managers', 'vendors'].includes(g.key) && <span className="team-dot" />}{g.label}</h2>
              <span className="small muted">{g.note ? `${g.note} · ` : ''}{g.list.length} {g.list.length === 1 ? 'person' : 'people'}</span>
            </div>
            {g.list.length === 0 ? <p className="small muted">Nobody here yet.</p> : (
              <div className="table-wrap"><table className="people">
                <thead><tr>
                  <th>Name</th><th>Email</th><th>Role</th>
                  {g.key === 'managers' && <th>Department</th>}
                  {g.key === 'vendors' && <th>Company</th>}
                  {g.key === 'vendors' && <th>Phone</th>}
                  <th>Email alerts</th><th aria-label="Actions" />
                </tr></thead>
                <tbody>{g.list.map((p) => (
                  <tr key={p._id} className={p.active === false ? 'off' : ''}>
                    <td><span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Avatar name={p.name} department={p.department} size="sm" /><b style={{ fontWeight: 600 }}>{p.name}</b>{p._id === user._id && <span className="pill">You</span>}{p.active === false && <span className="pill">Inactive</span>}</span></td>
                    <td className="muted">{p.email}</td>
                    <td>{meta.ROLES[p.role]}</td>
                    {g.key === 'managers' && <td>{p.department ? <DeptTag dept={p.department} meta={meta} /> : <span className="muted">—</span>}</td>}
                    {g.key === 'vendors' && <td>{p.company || <span className="muted">—</span>}</td>}
                    {g.key === 'vendors' && <td className="small">{p.phone || <span className="muted">—</span>}</td>}
                    <td className="small">{p.emailNotifications === false ? 'Off' : 'On'}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn sm ghost" onClick={() => setModal({ person: p })}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        ))}
      </div>
      {modal && (
        <PersonModal person={modal.person} me={user} meta={meta} onClose={() => setModal(null)} onSaved={(saved, editing) => {
          setPeople((list) => (editing ? list.map((p) => (p._id === saved._id ? saved : p)) : [...list, saved]));
          setModal(null); toast(editing ? 'Saved' : `${saved.name} added`);
        }} />
      )}
    </>
  );
}