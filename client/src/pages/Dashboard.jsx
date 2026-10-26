import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Hand, Users, BarChart3, History, Flag, RefreshCw, Megaphone, BellRing } from 'lucide-react';
import { api, post } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import TaskRow from '../components/TaskRow.jsx';
import Analytics from '../components/Analytics.jsx';
import StatusFlow from '../components/StatusFlow.jsx';
import { StreakBanner } from '../components/Celebration.jsx';
import { Loader, Empty, DeptTag, Due, PriorityPill, ReqStatus, UsageTag, Stat, PerformancePill, Modal, Avatar } from '../components/ui.jsx';
import { canRaise, isManager, isAdmin, isVendor, ago, fmtDate, OPEN_REQUIREMENT, ACTIVE_TASKS } from '../utils.js';

function Panel({ title, note, children, link, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head"><h2>{title}</h2>{link || (note && <span className="small muted">{note}</span>)}</div>
      {children}
    </section>
  );
}

const openUpdate = (r) => (r.updateRequests || []).find((u) => u.status === 'open');

function RequirementList({ list, meta, showTasks, action, empty = 'Nothing here' }) {
  if (!list.length) return <Empty title={empty} />;
  return (
    <div className="list">
      {list.map((r) => {
        const upd = r.status === 'update_needed' ? openUpdate(r) : null;
        return (
          <div key={r._id} className="list-row">
            <Link to={`/requirements/${r._id}`} style={{ minWidth: 0, textDecoration: 'none' }}>
              <div className="t">{r.title}</div>
              <div className="row small" style={{ gap: 6, marginTop: 4 }}>
                <span className="code">{r.code} · {meta.REQUIREMENT_TYPES[r.type]}</span>
                <UsageTag value={r.usageType} meta={meta} />
                {r.campaign?.name && <span className="pill">{r.campaign.name}</span>}
                <DeptTag dept={r.department} meta={meta} />
                {r.sourcing === 'outsourced' && <span className="pill out-tag">Outsourced</span>}
                <span className="muted">{r.raisedBy?.name} · {ago(r.createdAt)}</span>
              </div>
              {upd && <div className="small update-reason">Update: {upd.reason}</div>}
              {showTasks && r.tasks?.length > 0 && (
                <div className="row tiny muted" style={{ gap: 8, marginTop: 6 }}>
                  {r.tasks.filter((t) => t.status !== 'cancelled').map((t) => (
                    <span key={t._id}>{t.sourcing === 'outsourced' ? (t.vendor?.name || 'Vendor') : meta.DEPARTMENTS[t.department].label.split(' ')[0]}: {(t.sourcing === 'outsourced' ? meta.OUTSOURCE_STATUS : meta.TASK_STATUS)[t.status].toLowerCase()}{t.assignee ? ` (${t.assignee.name})` : ''}</span>
                  ))}
                </div>
              )}
            </Link>
            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <PriorityPill value={r.priority} />
              <Due date={r.deadline} closed={!OPEN_REQUIREMENT.includes(r.status)} />
              <PerformancePill rating={r.performance?.rating} meta={meta} />
              <ReqStatus status={r.status} meta={meta} />
              {action?.(r)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Alert popup (custom alerts from director / admin / coordinator) ---------------- */
function AlertPopup() {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => { api('/notifications?unread=true&type=alert&limit=10').then((r) => setAlerts(r.items)).catch(() => {}); }, []);
  if (!alerts.length) return null;
  const dismiss = async () => {
    await post('/notifications/read-all', { type: 'alert' }).catch(() => {});
    window.dispatchEvent(new Event('cd:notifications'));
    setAlerts([]);
  };
  return (
    <Modal title={alerts.length > 1 ? `${alerts.length} alerts` : 'Alert'} onClose={dismiss}>
      <div className="stack">
        {alerts.map((a) => (
          <div key={a._id} className="alert-item">
            <BellRing size={18} />
            <div><b>{a.title}</b><p className="small" style={{ marginTop: 2 }}>{a.message}</p><span className="tiny muted">{ago(a.createdAt)}</span></div>
          </div>
        ))}
        <button className="btn" onClick={dismiss}>Got it</button>
      </div>
    </Modal>
  );
}

/* ---------------- Director / Admin / Coordinator ---------------- */
function ManagerView({ d, meta, user }) {
  const c = d.counts;
  const o = d.outsourced;
  return (
    <>
      <div className="stats">
        <Stat Link={Link} to="/requirements?status=new" label="New – to review" value={c.pendingReview} tone={c.pendingReview ? 'warn' : ''} />
        <Stat Link={Link} to="/requirements?status=approved" label="Approved – to assign" value={c.toAssign} tone={c.toAssign ? 'warn' : ''} />
        <Stat Link={Link} to="/requirements?status=ready" label="Ready to fulfill" value={c.readyToFulfill} tone={c.readyToFulfill ? 'good' : ''} />
        <Stat Link={Link} to="/requirements?status=update_needed" label="Update requests" value={c.updateRequests} tone={c.updateRequests ? 'orange' : ''} />
        <Stat Link={Link} to="/tasks?view=review" label="Tasks to review" value={c.awaitingReview} />
        <Stat Link={Link} to="/tasks?view=conflicts" label="Conflict requests" value={c.conflicts} tone={c.conflicts ? 'late' : ''} />
        <Stat Link={Link} to="/tasks?view=today" label="Overdue tasks" value={c.overdue} tone={c.overdue ? 'late' : ''} />
        <Stat Link={Link} to="/outsourced" label="Outsourced active" value={c.outsourcedActive} />
      </div>

      <div className="dash-grid">
        <div className="stack" style={{ gap: 18 }}>
          <Panel title="New – review & categorise" note="Approve as internal or outsourced" link={<Link to="/requirements?status=new" className="small">Open zone</Link>}>
            <RequirementList list={d.pendingReview} meta={meta} empty="Nothing waiting for review"
              action={(r) => <Link to={`/requirements/${r._id}`} className="btn sm">Review</Link>} />
          </Panel>
          <Panel title="Approved – assign tasks" note="Create tasks for staff or a vendor">
            <RequirementList list={d.toAssign} meta={meta} empty="Nothing waiting for assignment"
              action={(r) => <Link to={`/requirements/${r._id}`} className="btn sm ghost">Assign</Link>} />
          </Panel>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <Panel title="Track requirement fulfillment" note="All tasks closed">
            <RequirementList list={d.readyToFulfill} meta={meta} empty="Nothing ready to fulfill"
              action={(r) => <Link to={`/requirements/${r._id}`} className="btn sm go">{r.status === 'update_needed' ? 'Fulfill update' : 'Fulfill'}</Link>} />
          </Panel>
          {d.updateRequests.length > 0 && (
            <Panel title="Update requests" note="Back with the same staff / vendor" className="flag-panel orange">
              <RequirementList list={d.updateRequests} meta={meta} />
            </Panel>
          )}
          {d.conflicts.length > 0 && (
            <Panel title="Conflict requests" note="Staff asked for re-ordering">
              <div className="list">{d.conflicts.map((t) => (
                <Link key={t._id} to={`/tasks/${t._id}`} className="list-row">
                  <div style={{ minWidth: 0 }}><div className="t">{t.title}</div><div className="small muted clamp2">{t.conflict.reason}</div></div>
                  <PriorityPill value={t.priority} />
                </Link>
              ))}</div>
            </Panel>
          )}
        </div>
      </div>

      <div className="dash-grid mt">
        <Panel title="Priority queues" link={<Link to="/funnel" className="small">Open Priority Funnel</Link>}>
          <div className="table-wrap">
            <table className="people">
              <thead><tr><th>Staff</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th><th>Overdue</th></tr></thead>
              <tbody>
                {d.queues.map((q) => (
                  <tr key={q.user._id}>
                    <td><Link to={`/funnel?staff=${q.user._id}`} className="row" style={{ gap: 8, textDecoration: 'none' }}><Avatar name={q.user.name} department={q.user.department} size="sm" />{q.user.name}</Link></td>
                    <td className="mono">{q.high || '–'}</td><td className="mono">{q.medium || '–'}</td><td className="mono">{q.low || '–'}</td>
                    <td className="mono"><b>{q.total}</b></td><td className={`mono ${q.overdue ? 'late-text' : ''}`}>{q.overdue || '–'}</td>
                  </tr>
                ))}
                {Object.entries(d.unassignedCounts).map(([dept, n]) => (
                  <tr key={dept}><td className="muted">Unassigned · {meta.DEPARTMENTS[dept].label}</td><td colSpan={3} /><td className="mono">{n}</td><td /></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Outsourced projects" link={<Link to="/outsourced" className="small">Open zone</Link>}>
          <div className="mini-stats">
            <span className="ms f-grey">Pending <b>{o.counts.pending}</b></span>
            <span className="ms f-yellow">Ongoing <b>{o.counts.ongoing}</b></span>
            <span className="ms f-orange">Paused <b>{o.counts.paused}</b></span>
            <span className="ms f-green">Fulfilled <b>{o.counts.fulfilled}</b></span>
          </div>
          {o.tasks.length ? <div className="list">{o.tasks.map((t) => <TaskRow key={t._id} t={t} meta={meta} />)}</div> : <Empty title="No outsourced work in progress" />}
        </Panel>
      </div>

      <div className="dash-grid mt">
        <Panel title="Reminders & overdue" note="Due today or overdue">
          {d.today.length ? <div className="list">{d.today.map((t) => <TaskRow key={t._id} t={t} meta={meta} />)}</div> : <Empty title="Nothing due today" />}
        </Panel>
        <Panel title="Tasks to review" note="Submitted, waiting for you">
          {d.pendingTaskReview.length ? <div className="list">{d.pendingTaskReview.map((t) => <TaskRow key={t._id} t={t} meta={meta} />)}</div> : <Empty title="Nothing to review" />}
        </Panel>
      </div>

      <Panel title="Usage & performance updates" note="Marked by marketing / raisers" className="mt">
        {d.usageUpdates.length === 0 ? <Empty title="No usage updates yet" /> : (
          <div className="list">{d.usageUpdates.map((r) => (
            <Link key={r._id} to={`/requirements/${r._id}`} className="list-row">
              <div style={{ minWidth: 0 }}>
                <div className="t">{r.title}</div>
                <div className="small muted clamp2">{r.usage?.note}</div>
                <div className="tiny muted">{r.usage?.by?.name} · used {fmtDate(r.usage?.date || r.usage?.at)}{r.campaign?.name ? ` · ${r.campaign.name}` : ''}</div>
              </div>
              <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><PerformancePill rating={r.performance?.rating} meta={meta} /><ReqStatus status={r.status} meta={meta} /></div>
            </Link>
          ))}</div>
        )}
      </Panel>

      <Panel title="Progress by department" className="mt">
        <div className="table-wrap">
          <table className="people">
            <thead><tr><th>Department</th><th>Open requirements</th><th>Not assigned</th><th>Assigned</th><th>In progress</th><th>Awaiting review</th><th>Overdue</th></tr></thead>
            <tbody>{d.byDepartment.map((r) => (
              <tr key={r.key}>
                <td><DeptTag dept={r.key} meta={meta} /></td>
                <td className="mono">{r.raises ? r.requirementsOpen : '—'}</td>
                {r.tasks ? (<>
                  <td className="mono">{r.tasks.open}</td><td className="mono">{r.tasks.assigned}</td><td className="mono">{r.tasks.in_progress}</td>
                  <td className="mono">{r.tasks.review}</td><td className={`mono ${r.tasks.overdue ? 'late-text' : ''}`}>{r.tasks.overdue}</td>
                </>) : <td colSpan={5} className="muted small">Raises requirements only</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>

      <div className="dash-grid mt">
        <Link to="/reports" className="panel link-panel"><BarChart3 size={20} /><div><h3>Reports & analytics</h3><p className="small muted">Filters, staff, outsourcing, campaigns, performance</p></div></Link>
        {isAdmin(user) && d.users
          ? <Link to="/users" className="panel link-panel"><Users size={20} /><div><h3>User & role management</h3><p className="small muted">{d.users.director || 0} directors, {d.users.admin || 0} admins, {d.users.coordinator || 0} coordinators, {d.users.staff || 0} staff, {d.users.vendor || 0} vendors</p></div></Link>
          : <Link to="/audit" className="panel link-panel"><History size={20} /><div><h3>Audit log</h3><p className="small muted">Every status change and action</p></div></Link>}
      </div>
    </>
  );
}

/* ---------------- Staff (Creative / Production) ---------------- */
// Tabs: Assigned · In Progress · Fulfilled · Update Needed · Completed
function staffTab(t) {
  if (t.update?.active && ACTIVE_TASKS.includes(t.status)) return 'update';
  if (['open', 'assigned'].includes(t.status)) return 'assigned';
  if (['in_progress', 'paused'].includes(t.status)) return 'progress';
  if (t.status === 'completed') return 'fulfilled';
  if (t.status === 'closed') return t.requirement?.status === 'task_completed' ? 'completed' : 'fulfilled';
  return null;
}
const STAFF_TABS = [['assigned', 'Assigned', ''], ['progress', 'In Progress', 'tile-yellow'], ['fulfilled', 'Fulfilled', 'tile-green'], ['update', 'Update Needed', 'tile-orange'], ['completed', 'Completed', 'tile-blue']];

function StaffView({ s, meta, onTake }) {
  const [tab, setTab] = useState('assigned');
  const counts = Object.fromEntries(STAFF_TABS.map(([k]) => [k, s.tasks.filter((t) => staffTab(t) === k).length]));
  const list = s.tasks.filter((t) => staffTab(t) === tab);
  return (
    <>
     <StreakBanner s={s.onTime} />
      <h2 className="section-title">My tasks</h2>
      <div className="tiles tabs-tiles" role="tablist">
        {STAFF_TABS.map(([k, label, cls]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tile ${cls} ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            <span className="tile-l">{label}</span><span className="tile-n">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="dash-grid">
        <Panel title={STAFF_TABS.find(([k]) => k === tab)[1]} note={tab === 'assigned' || tab === 'progress' ? 'In priority order' : ''}>
          {list.length ? <div className="list">{list.map((t) => <TaskRow key={t._id} t={t} meta={meta} showDept={false} detailed />)}</div> : <Empty title="Nothing here" />}
        </Panel>
        <div className="stack" style={{ gap: 18 }}>
          <Panel title="Today's tasks" note="Due today or overdue">
            {s.today.length ? <div className="list">{s.today.map((t) => <TaskRow key={t._id} t={t} meta={meta} showDept={false} />)}</div> : <Empty title="Nothing due today" />}
          </Panel>
          <Panel title="Available for self-assignment" note={`${s.available.length} open`}>
            {s.available.length ? (
              <div className="list">{s.available.map((t) => (
                <TaskRow key={t._id} t={t} meta={meta} showDept={false} action={<button className="btn sm" onClick={() => onTake(t)}><Hand size={15} /> Take</button>} />
              ))}</div>
            ) : <Empty title="No open tasks">Tasks the coordinator opens for self-assignment show up here.</Empty>}
          </Panel>
        </div>
      </div>
    </>
  );
}

/* ---------------- Requirement raiser (Marketing / Tech / Outlet / Production) ---------------- */
function RaiserView({ r, meta, user }) {
  const fulfilledActions = (x) => (
    <>
      <Link to={`/requirements/${x._id}?do=usage`} className="btn sm usage-btn"><Flag size={14} /> Mark used</Link>
      <Link to={`/requirements/${x._id}?do=update`} className="btn sm ghost update-ghost"><RefreshCw size={14} /> Update</Link>
    </>
  );
  return (
    <>
      <div className="stats">
        <Stat Link={Link} to="/requirements?mine=department&status=all" label="Requirements raised" value={r.counts.raised} />
        <Stat Link={Link} to="/requirements?mine=department&status=ongoing" label="Ongoing" value={r.counts.ongoing} tone="warn" />
        <Stat Link={Link} to="/requirements?status=fulfilled" label={r.marketing ? 'Fulfilled – ready to use' : 'Fulfilled'} value={r.counts.fulfilled} tone="good" />
        <Stat Link={Link} to="/requirements?mine=department&status=update_needed" label="Update needed" value={r.counts.updateNeeded} tone="orange" />
        <Stat Link={Link} to="/requirements?mine=department&status=task_completed" label="Completed" value={r.counts.completed} tone="blue" />
      </div>

      {r.fulfilled.length > 0 && (
        <Panel title={r.marketing ? 'Fulfilled creatives – mark as used / published' : 'Fulfilled – use them, then mark used or ask for an update'} note="Green flag" className="flag-panel green">
          <RequirementList list={r.fulfilled} meta={meta} action={fulfilledActions} />
        </Panel>
      )}
      {r.updateNeeded.length > 0 && (
        <Panel title="Update needed" note="Orange flag · back with the same staff / vendor" className="flag-panel orange mt">
          <RequirementList list={r.updateNeeded} meta={meta} showTasks />
        </Panel>
      )}

      <div className="dash-grid mt">
        <Panel title="Ongoing requirements" note="Yellow flag">
          <RequirementList list={r.ongoing} meta={meta} showTasks empty="Nothing in progress" />
        </Panel>
        <div className="stack" style={{ gap: 18 }}>
          <Panel title="Requirements raised" link={<Link to="/requirements?mine=department&status=all" className="small">See all</Link>}>
            <RequirementList list={r.raised} meta={meta} empty="No requirements yet" />
          </Panel>
          <Panel title="Completed (used)" note="Blue flag" link={r.marketing ? <Link to="/campaigns" className="small"><Megaphone size={13} /> Campaigns</Link> : null}>
            <RequirementList list={r.completed} meta={meta} empty="Nothing completed yet" />
          </Panel>
        </div>
      </div>

      <Panel title="Requirement status flow" className="mt">
        <div style={{ overflowX: 'auto' }}><StatusFlow status="" meta={meta} compact /></div>
        <p className="tiny muted" style={{ marginTop: 10 }}>
          Gray = new · blue = approved · purple = assigned · yellow = in progress · green = fulfilled · orange = update needed · blue flag = completed.
          {canRaise(user, meta) && ' When a creative is fulfilled, mark it as used (with campaign, live link and performance) or request an update.'}
        </p>
      </Panel>
    </>
  );
}

/* ---------------- External vendor ---------------- */
function VendorView({ v, meta }) {
  return (
    <>
      <div className="tiles">
        <div className="tile"><span className="tile-l">Pending</span><span className="tile-n">{v.counts.pending}</span></div>
        <div className="tile tile-yellow"><span className="tile-l">Ongoing</span><span className="tile-n">{v.counts.ongoing}</span></div>
        <div className="tile tile-orange"><span className="tile-l">Paused</span><span className="tile-n">{v.counts.paused}</span></div>
        <div className="tile tile-green"><span className="tile-l">Fulfilled</span><span className="tile-n">{v.counts.fulfilled}</span></div>
      </div>
      <Panel title="Your outsourced work" note="Open a project to start, pause or submit the Drive link">
        {v.tasks.length ? <div className="list">{v.tasks.map((t) => <TaskRow key={t._id} t={t} meta={meta} showDept={false} />)}</div> : <Empty title="No projects yet">Projects the coordinator sends you appear here.</Empty>}
      </Panel>
    </>
  );
}

const ROLE_TITLE = { director: 'Director dashboard', admin: 'Admin dashboard', coordinator: 'Coordinator dashboard' };

export default function Dashboard() {
  const { user, meta } = useAuth();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => api('/dashboard').then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const take = async (t) => { try { await post(`/tasks/${t._id}/self-assign`); toast(`You took ${t.code}`); load(); } catch (e) { toast(e.message, 'err'); } };

  if (err) return <div className="error-box">{err}</div>;
  if (!d) return <Loader />;

  const h = new Date().getHours();
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const title = isVendor(user) ? `External vendor · ${user.company || ''}`
    : ROLE_TITLE[user.role]
      || [d.raiser && (d.raiser.marketing ? 'Marketing dashboard' : 'Requirement raiser dashboard'), d.staff && 'Staff dashboard'].filter(Boolean).join(' · ');

  return (
    <>
      <AlertPopup />
      <div className="page-head">
        <div>
          <p className="muted small">{title}{user.department ? ` · ${meta.DEPARTMENTS[user.department].label}` : ''}</p>
          <h1>{hello}, {user.name.split(' ')[0]}</h1>
        </div>
        <div className="row">
          {d.unread > 0 && <Link to="/notifications" className="btn ghost">{d.unread} unread</Link>}
          {canRaise(user, meta) && <Link to="/requirements/new" className="btn"><Plus size={18} /> Raise requirement</Link>}
        </div>
      </div>
      {!isVendor(user) && <Analytics />}
      {d.vendor && <VendorView v={d.vendor} meta={meta} />}
      {isManager(user) && <ManagerView d={d} meta={meta} user={user} />}
      {d.raiser && <RaiserView r={d.raiser} meta={meta} user={user} />}
      {d.staff && <div style={{ marginTop: d.raiser ? 28 : 0 }}><StaffView s={d.staff} meta={meta} onTake={take} /></div>}
      {!isManager(user) && !d.staff && !d.raiser && !d.vendor && <Empty title="No department set">Ask an admin to add you to a department.</Empty>}
    </>
  );
}