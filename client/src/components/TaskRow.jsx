import { Link } from 'react-router-dom';
import { ArrowUp, ArrowDown, GripVertical, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, DeptTag, Due, PriorityPill, TaskStatus, ConflictPill, PerformancePill, OutsourcedTag } from './ui.jsx';
import { ACTIVE_TASKS } from '../utils.js';

/*
 * One task. The queue number (#1, #2…) is shown only when the same person
 * has more than one task of the same priority (queueSize > 1).
 * Pass `detailed` for the staff task-card view.
 */
export default function TaskRow({ t, meta, action, onMove, showDept = true, detailed, drag }) {
  const { meta: m } = useAuth();
  meta = meta || m;
  const active = ACTIVE_TASKS.includes(t.status);
  const showNumber = active && t.sourcing !== 'outsourced' && t.order && (t.queueSize || 0) > 1;
  const req = t.requirement;
  const { className: dropCls = '', ...dragRest } = drag || {};
  return (
    <div className={`task-row ${drag ? 'draggable' : ''} ${dropCls}`} {...dragRest}>
      {drag ? <span className="drag-handle" aria-hidden="true"><GripVertical size={16} /></span> : null}
      <span className={`order-badge p-${t.priority} ${showNumber ? '' : 'plain'}`} title={showNumber ? `#${t.order} of ${t.queueSize} ${t.priority}-priority tasks for this person` : `${t.priority} priority`}>
        {showNumber ? t.order : t.priority[0].toUpperCase()}
      </span>
      <Link to={`/tasks/${t._id}`} className="task-main">
        <div className="t">{t.title}</div>
        <div className="row small" style={{ gap: 6, marginTop: 4 }}>
          <span className="code">{t.code}{req ? ` · ${req.code}` : ''}</span>
          {showDept && t.sourcing !== 'outsourced' && <DeptTag dept={t.department} meta={meta} />}
          <TaskStatus status={t.status} sourcing={t.sourcing} meta={meta} />
          <OutsourcedTag t={t} />
          {t.conflict?.active && <ConflictPill />}
          {t.update?.active && <span className="pill f-orange">Update #{t.update.round}</span>}
          {t.sourcing !== 'outsourced' && (t.assignee ? (
            <span className="row muted" style={{ gap: 5 }}><Avatar name={t.assignee.name} department={t.assignee.department} size="sm" />{t.assignee.name}</span>
          ) : t.status === 'open' ? <span className="muted">{t.allowSelfAssign ? 'Open for self-assign' : 'Waiting for assignment'}</span> : null)}
        </div>
        {detailed && req && (
          <div className="row tiny muted" style={{ gap: 10, marginTop: 6 }}>
            {req.usageType && <span>Type: {meta.USAGE_TYPES?.[req.usageType]?.label || req.usageType}</span>}
            {req.campaign?.name && <span>Campaign: {req.campaign.name}</span>}
            {req.raisedBy?.department && <span>From: {meta.DEPARTMENTS[req.raisedBy.department]?.label}</span>}
            {t.driveLink && <a href={t.driveLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 3 }}><ExternalLink size={12} />Drive</a>}
            {req.performance?.rating && <PerformancePill rating={req.performance.rating} meta={meta} />}
          </div>
        )}
      </Link>
      <div className="task-side">
        <PriorityPill value={t.priority} order={showNumber ? t.order : null} />
        <Due date={t.deadline} closed={!active} />
        {action}
        {onMove && t.sourcing !== 'outsourced' && (
          <span className="row" style={{ gap: 0 }}>
            <button className="icon-btn" onClick={() => onMove(t, 'up')} aria-label="Move up" title="Move up"><ArrowUp size={16} /></button>
            <button className="icon-btn" onClick={() => onMove(t, 'down')} aria-label="Move down" title="Move down"><ArrowDown size={16} /></button>
          </span>
        )}
      </div>
    </div>
  );
}