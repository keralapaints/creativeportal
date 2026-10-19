import { Flag, CheckCircle2, Users, Loader, BadgeCheck, RefreshCw } from 'lucide-react';

const ICONS = { new: Flag, approved: CheckCircle2, assigned: Users, in_progress: Loader, fulfilled: BadgeCheck, update_needed: RefreshCw, task_completed: Flag };
const COLOR = { new: 'grey', approved: 'tech', assigned: 'violet', in_progress: 'yellow', fulfilled: 'green', update_needed: 'orange', task_completed: 'blue' };
const OPTIONAL = ['update_needed'];

// New → Approved → Assigned → In Progress → Fulfilled → (Update Needed) → Completed
export default function StatusFlow({ status, meta, compact, updates = 0 }) {
  const flow = meta.REQUIREMENT_FLOW;
  const at = flow.indexOf(status);
  return (
    <ol className={`status-flow sf7 ${compact ? 'compact' : ''} ${status === 'cancelled' ? 'cancelled' : ''}`} aria-label="Requirement status">
      {flow.map((s, i) => {
        const Icon = ICONS[s] || Flag;
        let state = !status ? 'legend' : status === 'cancelled' ? 'todo' : i < at ? 'done' : i === at ? 'now' : 'todo';
        if (status && OPTIONAL.includes(s) && !updates && state !== 'now') state = i < at ? 'skipped' : 'optional';
        return (
          <li key={s} className={`sf-step c-${COLOR[s]} ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="sf-node"><Icon size={compact ? 14 : 16} /></span>
            <span className="sf-label">{meta.REQUIREMENT_STATUS[s]}{s === 'update_needed' && updates > 1 && state !== 'legend' ? ` ×${updates}` : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}