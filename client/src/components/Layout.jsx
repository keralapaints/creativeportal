import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Inbox, ListOrdered, Bell, BarChart3, Users, Plus, LogOut, Settings, History, Layers, Truck, Megaphone, SlidersHorizontal, Menu, X } from 'lucide-react';
import BellPopup from './BellPopup.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Avatar, Modal } from './ui.jsx';
import { api, patch } from '../api.js';
import { canRaise, isManager, isAdmin, isWorker, isVendor } from '../utils.js';

function Brand() {
  return (
    <div className="brand">
      <span className="brand-dots" aria-hidden="true">
        <i style={{ background: 'var(--marketing)' }} />
        <i style={{ background: 'var(--production)' }} />
        <i style={{ background: 'var(--creative)' }} />
      </span>
      Creative Desk
    </div>
  );
}

function AccountModal({ onClose }) {
  const { user, meta, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '' });
  const [err, setErr] = useState('');
  const savePassword = async (e) => {
    e.preventDefault();
    try { await patch('/auth/password', form); toast('Password changed'); setForm({ current: '', next: '' }); } catch (ex) { setErr(ex.message); }
  };
  const toggleEmail = async () => {
    const { user: u } = await patch('/auth/preferences', { emailNotifications: !user.emailNotifications });
    setUser(u);
    toast(u.emailNotifications ? 'Email notifications on' : 'Email notifications off');
  };
  return (
    <Modal title="Your account" onClose={onClose}>
      <div className="stack">
        <div className="row"><Avatar name={user.name} department={user.department} /><div><b>{user.name}</b><div className="small muted">{user.email} · {meta.ROLES[user.role]}{user.department ? `, ${meta.DEPARTMENTS[user.department].label}` : ''}</div></div></div>
        <label className="row switch">
          <input type="checkbox" checked={user.emailNotifications !== false} onChange={toggleEmail} />
          <span>Send me email notifications{!meta.emailEnabled && <span className="muted"> (email is not set up on the server yet)</span>}</span>
        </label>
        <hr className="sep" />
        <form className="stack" onSubmit={savePassword}>
          <h3>Change password</h3>
          <label className="field"><span>Current password</span><input className="input" type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></label>
          <label className="field"><span>New password</span><input className="input" type="password" minLength={6} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /></label>
          {err && <div className="error-box">{err}</div>}
          <button className="btn">Change password</button>
        </form>
      </div>
    </Modal>
  );
}

export default function Layout() {
  const { user, meta, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [account, setAccount] = useState(false);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    setMenu(false);
    const load = () => api('/notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    window.addEventListener('cd:notifications', load);
    return () => { clearInterval(id); window.removeEventListener('cd:notifications', load); };
  }, [loc.pathname]);

  const manager = isManager(user);
  const vendor = isVendor(user);
  const worker = isWorker(user, meta);
  const showTasks = manager || worker;
  const raiser = canRaise(user, meta);
  const marketing = user.department === 'marketing';
  const sub = vendor ? (user.company || 'External vendor') : user.department ? meta.DEPARTMENTS[user.department]?.label : meta.ROLES[user.role];

  const links = (vendor ? [
    { to: '/', label: 'My outsourced work', short: 'Work', icon: Truck, end: true },
    { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: Bell, count: unread },
  ] : [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/requirements', label: 'Requirement Zone', short: 'Requirements', icon: Inbox },
    showTasks && { to: '/tasks', label: 'Task Management', short: 'Tasks', icon: ListOrdered },
    showTasks && { to: '/funnel', label: 'Priority Funnel', short: 'Funnel', icon: Layers },
    manager && { to: '/outsourced', label: 'Outsourced Projects', short: 'Outsourced', icon: Truck },
    (manager || marketing) && { to: '/campaigns', label: 'Campaigns & usage', short: 'Campaigns', icon: Megaphone },
    { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: Bell, count: unread },
    manager && { to: '/reports', label: 'Reports & analytics', short: 'Reports', icon: BarChart3 },
    manager && { to: '/audit', label: 'Audit log', icon: History },
       isAdmin(user) && { to: '/users', label: 'Users & roles', icon: Users },
    isAdmin(user) && { to: '/settings', label: 'Requirement types', short: 'Settings', icon: SlidersHorizontal },
  ]).filter(Boolean);

  const tabs = vendor ? links : [
    links[0], links[1], raiser && { to: '/requirements/new', plus: true },
    showTasks ? links.find((l) => l.to === '/funnel') : links.find((l) => l.to === '/campaigns'),
    links.find((l) => l.to === '/notifications'),
  ].filter(Boolean);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-top"><Brand /><BellPopup unread={unread} dark /></div>
        <nav className="nav">
          {links.map(({ to, label, icon: Icon, end, count }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} /> {label}
              {count > 0 && <span className="count">{count}</span>}
            </NavLink>
          ))}
        </nav>
        {raiser && <Link to="/requirements/new" className="btn light side-new"><Plus size={18} /> Raise requirement</Link>}
        <div className="side-user">
          <Avatar name={user.name} department={user.department} />
          <div className="who"><b>{user.name}</b><span>{sub}</span></div>
          <button className="icon-btn" onClick={() => setAccount(true)} aria-label="Account settings" title="Account"><Settings size={17} /></button>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <header className="topbar">
        <Brand />
        <div className="row" style={{ gap: 2 }}>
          <BellPopup unread={unread} dark />
          <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Menu"><Menu size={20} /></button>
        </div>
      </header>

      {menu && (
        <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}>
          <nav className="drawer" aria-label="Menu">
            <div className="spread"><b>{user.name}</b><button className="icon-btn" onClick={() => setMenu(false)} aria-label="Close menu"><X size={20} /></button></div>
            <p className="tiny muted" style={{ marginTop: -4 }}>{sub}</p>
            {links.map(({ to, label, icon: Icon, end, count }) => (
              <NavLink key={to} to={to} end={end} className="drawer-link"><Icon size={18} /> {label}{count > 0 && <span className="count">{count}</span>}</NavLink>
            ))}
            <button className="drawer-link" onClick={() => { setMenu(false); setAccount(true); }}><Settings size={18} /> Account</button>
            <button className="drawer-link" onClick={logout}><LogOut size={18} /> Sign out</button>
          </nav>
        </div>
      )}

      <main className="main"><Outlet /></main>

      <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => (t.plus ? (
          <NavLink key="plus" to={t.to} aria-label="Raise requirement"><span className="plus"><Plus size={22} /></span></NavLink>
        ) : (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <t.icon size={21} />{t.short || t.label}
            {t.count > 0 && <span className="badge-dot">{t.count}</span>}
          </NavLink>
        )))}
      </nav>

      {account && <AccountModal onClose={() => setAccount(false)} />}
    </div>
  );
}