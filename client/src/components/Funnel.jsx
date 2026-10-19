import { useState } from 'react';
import TaskRow from './TaskRow.jsx';
import { Empty } from './ui.jsx';

/*
 * Priority funnel: High → Medium → Low.
 * With `onDrop`, rows can be dragged to reorder inside a priority or dropped on another
 * priority to change it. onDrop(task, priority, position) where position is 1-based.
 */
export default function Funnel({ tasks, meta, onMove, onDrop, action, emptyTitle = 'No tasks in the funnel', showDept, detailed }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { priority, index }
  if (!tasks.length) return <Empty title={emptyTitle} />;

  const dragProps = (t, priority, index) => (onDrop ? {
    draggable: true,
    onDragStart: (e) => { setDragId(t._id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t._id); },
    onDragEnd: () => { setDragId(null); setOver(null); },
    onDragOver: (e) => { e.preventDefault(); setOver({ priority, index }); },
    onDrop: (e) => {
      e.preventDefault();
      const moved = tasks.find((x) => x._id === (dragId || e.dataTransfer.getData('text/plain')));
      setDragId(null); setOver(null);
      if (moved && !(moved._id === t._id)) onDrop(moved, priority, index + 1);
    },
    className: over?.priority === priority && over?.index === index && dragId ? 'drop-target' : '',
  } : null);

  return (
    <div className="funnel">
      {meta.PRIORITIES.map((p) => {
        const list = tasks.filter((t) => t.priority === p);
        if (!list.length && !onDrop) return null;
        return (
          <section
            key={p}
            className={`funnel-group p-${p} ${onDrop && dragId && over?.priority === p && over.index === list.length ? 'drop-end' : ''}`}
            onDragOver={onDrop ? (e) => { e.preventDefault(); if (!over || over.priority !== p) setOver({ priority: p, index: list.length }); } : undefined}
            onDrop={onDrop ? (e) => {
              e.preventDefault();
              const moved = tasks.find((x) => x._id === (dragId || e.dataTransfer.getData('text/plain')));
              const idx = over?.priority === p ? over.index : list.length;
              setDragId(null); setOver(null);
              if (moved) onDrop(moved, p, idx + 1);
            } : undefined}
          >
            <header><span className="funnel-dot" />{p[0].toUpperCase() + p.slice(1)} priority<span className="n">{list.length}</span></header>
            <div className="list">
              {list.map((t, i) => (
                <TaskRow key={t._id} t={t} meta={meta} onMove={onMove} action={action?.(t)} showDept={showDept} detailed={detailed} drag={dragProps(t, p, i)} />
              ))}
              {!list.length && onDrop && <p className="tiny muted drop-hint">Drop a task here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// One funnel per department (used on the Tasks page)
export function DepartmentFunnels({ tasks, meta, onMove, action, emptyTitle }) {
  return (
    <div className="dept-funnels">
      {meta.WORK_DEPARTMENTS.map((d) => (
        <section key={d} className={`panel t-${d}`}>
          <div className="panel-head">
            <h2 className="row" style={{ gap: 8 }}><span className="team-dot" />{meta.DEPARTMENTS[d].label}</h2>
            <span className="small muted">{tasks.filter((t) => t.department === d).length} tasks</span>
          </div>
          <Funnel tasks={tasks.filter((t) => t.department === d)} meta={meta} onMove={onMove} action={action} emptyTitle={emptyTitle} showDept={false} />
        </section>
      ))}
    </div>
  );
}