import { Link } from 'react-router-dom';
import { Paperclip } from 'lucide-react';
import { DeptTag, Due, PriorityPill, ReqStatus, UsageTag, PerformancePill } from './ui.jsx';
import { OPEN_REQUIREMENT } from '../utils.js';

export default function RequirementCard({ r, meta }) {
  const tasks = (r.tasks || []).filter((t) => t.status !== 'cancelled');
  const closed = tasks.filter((t) => t.status === 'closed').length;
  const open = OPEN_REQUIREMENT.includes(r.status);
  return (
    <Link to={`/requirements/${r._id}`} className={`ccard flag-${r.status}`}>
      <div className="spread">
        <span className="code">{r.code} · {meta.REQUIREMENT_TYPES[r.type]}</span>
        <div className="row" style={{ gap: 6 }}>
          <PriorityPill value={r.priority} />
          <Due date={r.deadline} closed={!open} />
        </div>
      </div>
      <div className="title">{r.title}</div>
      {(r.purpose || r.description) && <p className="small muted clamp2">{r.purpose || r.description}</p>}
      {tasks.length > 0 && (
        <div className="progress" title={`${closed} of ${tasks.length} tasks closed`}>
          {tasks.map((t) => <i key={t._id} className={`seg-p s-${t.status}`} />)}
        </div>
      )}
      <div className="spread small">
        <span className="row" style={{ gap: 6 }}>
          <UsageTag value={r.usageType} meta={meta} />
          <DeptTag dept={r.department} meta={meta} />
          {r.sourcing === 'outsourced' && <span className="pill out-tag">Outsourced</span>}
          {r.references?.length > 0 && <span className="row muted" style={{ gap: 3 }}><Paperclip size={13} />{r.references.length}</span>}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <PerformancePill rating={r.performance?.rating} meta={meta} />
          <ReqStatus status={r.status} meta={meta} />
        </span>
      </div>
      <div className="tiny muted">
        Raised by {r.raisedBy?.name}{r.campaign?.name ? ` · ${r.campaign.name}` : ''}{tasks.length ? ` · ${closed}/${tasks.length} tasks closed` : ''}
        {r.readyToFulfill && ['in_progress', 'update_needed'].includes(r.status) ? ' · ready to fulfill' : ''}
        {r.updateCount > 0 ? ` · ${r.updateCount} update${r.updateCount > 1 ? 's' : ''}` : ''}
      </div>
    </Link>
  );
}