import { useEffect, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Loader, DeptTag, Empty } from '../components/ui.jsx';
import { Donut, BarChart, COLORS } from '../components/Charts.jsx';
import { downloadCsv, fmtDate, isManager, toInputDate, money } from '../utils.js';

const DAY = 86400000;
const STATUS_COLOR = { new: COLORS.grey, approved: COLORS.tech, assigned: COLORS.violet, in_progress: COLORS.yellow, fulfilled: COLORS.green, update_needed: COLORS.orange, task_completed: COLORS.blue, cancelled: '#c9ccd2' };
const PERF_COLOR = { high: COLORS.green, medium: COLORS.yellow, low: COLORS.orange, rejected: COLORS.red };
const PRIO_COLOR = { high: COLORS.red, medium: COLORS.yellow, low: COLORS.grey };

function Bars6({ data }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.raised, d.completed]));
  return (
    <div className="bars">
      {data.map((d) => (
        <div key={d.month} className="bar-col">
          <div className="bar-pair">
            <i style={{ height: `${(d.raised / max) * 100}%` }} className="b-raised" title={`${d.raised} raised`} />
            <i style={{ height: `${(d.completed / max) * 100}%` }} className="b-done" title={`${d.completed} fulfilled`} />
          </div>
          <span className="tiny muted">{d.month}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { user, meta } = useAuth();
  const [f, setF] = useState({
    from: toInputDate(new Date(Date.now() - 30 * DAY)), to: toInputDate(new Date()),
    department: '', workDepartment: '', staff: '', status: '', priority: '', type: '', usageType: '', campaign: '', sourcing: '',
  });
  const [staff, setStaff] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    api('/users?active=true&role=staff').then((u) => setStaff(u.filter((p) => meta.WORK_DEPARTMENTS.includes(p.department)))).catch(() => {});
    api('/campaigns?all=true').then(setCampaigns).catch(() => {});
  }, [meta]);
  useEffect(() => {
    setD(null); setErr('');
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    api(`/reports?${qs}`).then(setD).catch((e) => setErr(e.message));
  }, [f]);

  if (!isManager(user)) return <Empty title="Reports are for coordinators and admins" />;
  if (err) return <div className="error-box">{err}</div>;

  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
  const num = (v) => (v === null || v === undefined ? '—' : v);
  const active = Object.entries(f).filter(([k, v]) => v && !['from', 'to'].includes(k)).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Reports & analytics</h1><p className="muted">Everything below follows the filters.</p></div>
        {d && <button className="btn ghost" onClick={() => downloadCsv(`report-${f.from}-to-${f.to}.csv`, d.rows.map((r) => ({ ...r, deadline: fmtDate(r.deadline), submitted: fmtDate(r.submitted), closed: fmtDate(r.closed) })))} disabled={!d.rows.length}><Download size={16} /> Export CSV</button>}
      </div>

      <section className="panel filters">
        <div className="row small muted" style={{ gap: 6, marginBottom: 10 }}><Filter size={14} /> Filters {active > 0 && <button className="link-btn" onClick={() => setF((x) => ({ from: x.from, to: x.to, department: '', workDepartment: '', staff: '', status: '', priority: '', type: '', usageType: '', campaign: '', sourcing: '' }))}>Clear {active}</button>}</div>
        <div className="filter-grid">
          <label className="field"><span>From</span><input className="input" type="date" value={f.from} max={f.to} onChange={set('from')} /></label>
          <label className="field"><span>To</span><input className="input" type="date" value={f.to} min={f.from} onChange={set('to')} /></label>
          <label className="field"><span>Raised by dept</span><select className="select" value={f.department} onChange={set('department')}><option value="">All</option>{Object.entries(meta.DEPARTMENTS).filter(([, x]) => x.raises).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select></label>
          <label className="field"><span>Work dept</span><select className="select" value={f.workDepartment} onChange={set('workDepartment')}><option value="">All</option>{meta.WORK_DEPARTMENTS.map((k) => <option key={k} value={k}>{meta.DEPARTMENTS[k].label}</option>)}</select></label>
          <label className="field"><span>Staff</span><select className="select" value={f.staff} onChange={set('staff')}><option value="">All</option>{staff.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label>
          <label className="field"><span>Status</span><select className="select" value={f.status} onChange={set('status')}><option value="">All</option><option value="new">New / pending</option><option value="ongoing">Ongoing</option><option value="fulfilled">Fulfilled</option><option value="update_needed">Update needed</option><option value="task_completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
          <label className="field"><span>Priority</span><select className="select" value={f.priority} onChange={set('priority')}><option value="">All</option>{meta.PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label>
          <label className="field"><span>Requirement type</span><select className="select" value={f.usageType} onChange={set('usageType')}><option value="">All</option>{Object.entries(meta.USAGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="field"><span>Creative format</span><select className="select" value={f.type} onChange={set('type')}><option value="">All</option>{Object.entries(meta.REQUIREMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Campaign</span><select className="select" value={f.campaign} onChange={set('campaign')}><option value="">All</option>{campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
          <label className="field"><span>Internal / outsourced</span><select className="select" value={f.sourcing} onChange={set('sourcing')}><option value="">Both</option><option value="internal">Internal</option><option value="outsourced">Outsourced</option></select></label>
        </div>
      </section>

      {!d ? <Loader /> : (
        <div className="stack" style={{ gap: 18, marginTop: 18 }}>
          <div className="tiles">
            <div className="tile"><span className="tile-l">Requirements</span><span className="tile-n">{d.totals.requirements}</span></div>
            <div className="tile tile-yellow"><span className="tile-l">Ongoing</span><span className="tile-n">{d.totals.ongoing}</span></div>
            <div className="tile tile-green"><span className="tile-l">Fulfilled</span><span className="tile-n">{d.totals.fulfilled}</span></div>
            <div className="tile tile-orange"><span className="tile-l">Update needed</span><span className="tile-n">{d.totals.updateNeeded}</span></div>
            <div className="tile tile-blue"><span className="tile-l">Completed</span><span className="tile-n">{d.totals.completed}</span></div>
          </div>
          <div className="stats">
            <div className="stat"><span className="stat-n">{d.totals.pending}</span><span className="stat-l">Pending review</span></div>
            <div className="stat"><span className="stat-n">{d.totals.tasks}</span><span className="stat-l">Tasks</span></div>
            <div className="stat late"><span className="stat-n">{d.totals.overdueTasks}</span><span className="stat-l">Overdue tasks</span></div>
            <div className="stat"><span className="stat-n">{num(d.totals.avgTurnaround)}</span><span className="stat-l">Avg days (assigned → submitted)</span></div>
            <div className="stat good"><span className="stat-n">{pct(d.totals.onTime)}</span><span className="stat-l">On time</span></div>
            <div className="stat orange"><span className="stat-n">{d.totals.updateRequests}</span><span className="stat-l">Update requests</span></div>
            <div className="stat"><span className="stat-n" style={{ fontSize: '1.3rem' }}>{money(d.totals.outsourcedCost)}</span><span className="stat-l">Outsourcing cost</span></div>
          </div>

          <div className="widget-grid">
            <section className="panel"><div className="panel-head"><h2>Requirement status</h2></div>
              <Donut label="Requirement status" data={d.statusBreakdown.map((s) => ({ key: s.key, label: s.label, value: s.count, color: STATUS_COLOR[s.key] }))} />
            </section>
            <section className="panel"><div className="panel-head"><h2>Priority funnel</h2><span className="small muted">Active tasks</span></div>
              <BarChart data={d.priorityFunnel.map((p) => ({ key: p.key, label: p.key[0].toUpperCase() + p.key.slice(1), value: p.active, color: PRIO_COLOR[p.key] }))} />
            </section>
            <section className="panel"><div className="panel-head"><h2>Usage performance</h2></div>
              <Donut label="Usage performance" data={d.performance.map((p) => ({ key: p.key, label: p.label, value: p.count, color: PERF_COLOR[p.key] }))} />
            </section>
          </div>

          <section className="panel">
            <div className="panel-head"><h2>Staff-wise tasks</h2></div>
            {d.byStaff.length === 0 ? <Empty title="No staff tasks in this selection" /> : (
              <div className="table-wrap"><table className="people">
                <thead><tr><th>Name</th><th>Tasks</th><th>Active</th><th>Closed</th><th>Overdue</th><th>Avg days</th><th>On time</th><th>Changes</th></tr></thead>
                <tbody>{d.byStaff.map((p) => (
                  <tr key={p.name}><td><b style={{ fontWeight: 600 }}>{p.name}</b> <span className="tiny muted">{meta.DEPARTMENTS[p.department]?.label}</span></td>
                    <td className="mono">{p.total}</td><td className="mono">{p.active}</td><td className="mono">{p.closed}</td>
                    <td className={`mono ${p.overdue ? 'late-text' : ''}`}>{p.overdue}</td><td className="mono">{num(p.avgDays)}</td><td className="mono">{pct(p.onTime)}</td><td className="mono">{p.rework}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </section>

          <div className="dash-grid">
            <section className="panel">
              <div className="panel-head"><h2>Outsourced projects</h2><span className="small muted">{money(d.outsourced.cost)}</span></div>
              <div className="mini-stats">
                <span className="ms f-grey">Pending <b>{d.outsourced.counts.pending}</b></span>
                <span className="ms f-yellow">Ongoing <b>{d.outsourced.counts.ongoing}</b></span>
                <span className="ms f-orange">Paused <b>{d.outsourced.counts.paused}</b></span>
                <span className="ms f-green">Fulfilled <b>{d.outsourced.counts.fulfilled}</b></span>
              </div>
              {d.outsourced.vendors.length > 0 && (
                <div className="table-wrap"><table className="people">
                  <thead><tr><th>Vendor</th><th>Projects</th><th>Active</th><th>Closed</th><th>Cost</th></tr></thead>
                  <tbody>{d.outsourced.vendors.map((v) => <tr key={v.name}><td>{v.name}</td><td className="mono">{v.total}</td><td className="mono">{v.active}</td><td className="mono">{v.closed}</td><td className="mono">{money(v.cost)}</td></tr>)}</tbody>
                </table></div>
              )}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Campaign-wise usage</h2></div>
              {d.campaigns.length === 0 ? <Empty title="No campaign creatives in this selection" /> : (
                <div className="table-wrap"><table className="people">
                  <thead><tr><th>Campaign</th><th>Creatives</th><th>Used</th><th>High</th><th>Med</th><th>Low</th><th>Rejected</th></tr></thead>
                  <tbody>{d.campaigns.map((c) => <tr key={c.key}><td>{c.name}</td><td className="mono">{c.total}</td><td className="mono">{c.used}</td><td className="mono">{c.high || '–'}</td><td className="mono">{c.medium || '–'}</td><td className="mono">{c.low || '–'}</td><td className="mono">{c.rejected || '–'}</td></tr>)}</tbody>
                </table></div>
              )}
            </section>
          </div>

          <div className="dash-grid">
            <section className="panel">
              <div className="panel-head"><h2>By raising department</h2></div>
              <div className="table-wrap"><table className="people">
                <thead><tr><th>Department</th><th>Raised</th><th>Open</th><th>Fulfilled</th><th>Updates</th><th>Completed</th></tr></thead>
                <tbody>{d.requirementsByDepartment.map((r) => (
                  <tr key={r.key}><td><DeptTag dept={r.key} meta={meta} /></td><td className="mono">{r.raised}</td><td className="mono">{r.open}</td><td className="mono">{r.fulfilled}</td><td className={`mono ${r.updates ? 'orange-text' : ''}`}>{r.updates}</td><td className="mono">{r.used}</td></tr>
                ))}</tbody>
              </table></div>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Last 6 months</h2><span className="small row" style={{ gap: 10 }}><span className="row" style={{ gap: 4 }}><i className="key b-raised" />Raised</span><span className="row" style={{ gap: 4 }}><i className="key b-done" />Fulfilled</span></span></div>
              <Bars6 data={d.trend} />
            </section>
          </div>

          <div className="dash-grid">
            <section className="panel">
              <div className="panel-head"><h2>By requirement type</h2><span className="small muted">Raised · completed</span></div>
              {d.requirementsByUsage.length === 0 ? <Empty title="No data" /> : (
                <div className="stack" style={{ gap: 8 }}>{d.requirementsByUsage.map((u) => {
                  const max = Math.max(1, ...d.requirementsByUsage.map((x) => x.raised));
                  return <div key={u.key} className="type-bar"><span className="small">{u.label}</span><span className="track"><i style={{ width: `${(u.raised / max) * 100}%` }} /></span><span className="mono small">{u.raised} · {u.used}</span></div>;
                })}</div>
              )}
            </section>
            <section className="panel">
              <div className="panel-head"><h2>By creative format</h2></div>
              {d.requirementsByType.length === 0 ? <Empty title="No data" /> : (
                <div className="stack" style={{ gap: 8 }}>{d.requirementsByType.map((r) => (
                  <div key={r.key} className="type-bar"><span className="small">{r.label}</span><span className="track"><i style={{ width: `${(r.count / d.requirementsByType[0].count) * 100}%` }} /></span><span className="mono small">{r.count}</span></div>
                ))}</div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}