import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api, post } from '../api.js';
import { ago } from '../utils.js';

const DOT = { alert: 'red', conflict: 'red', reminder: 'red', update_request: 'orange', fulfilled: 'green', completed: 'green', reviewed: 'green', usage: 'blue', task_assigned: 'blue', requirement_new: 'blue' };

// Notification bell with a popup of the latest items
export default function BellPopup({ unread, dark }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    api('/notifications?limit=8').then((r) => setItems(r.items)).catch(() => setItems([]));
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const go = async (n) => {
    setOpen(false);
    if (!n.read) { try { await post(`/notifications/${n._id}/read`); } catch { /* ignore */ } window.dispatchEvent(new Event('cd:notifications')); }
    if (n.link) nav(n.link);
  };

  return (
    <div className="bell" ref={ref}>
      <button className={`icon-btn bell-btn ${dark ? 'on-dark' : ''}`} onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}>
        <Bell size={19} />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Latest notifications">
          <div className="spread bell-head"><b>Notifications</b><button className="link-btn" onClick={() => { setOpen(false); nav('/notifications'); }}>View all</button></div>
          {!items ? <p className="small muted" style={{ padding: 12 }}>Loading…</p>
            : items.length === 0 ? <p className="small muted" style={{ padding: 12 }}>Nothing yet.</p>
              : items.map((n) => (
                <button key={n._id} className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => go(n)}>
                  <i className={`dot d-${DOT[n.type] || 'grey'}`} />
                  <span><b>{n.title}</b><span className="tiny muted"> · {ago(n.createdAt)}</span></span>
                </button>
              ))}
        </div>
      )}
    </div>
  );
}