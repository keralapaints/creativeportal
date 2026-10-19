import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { LineChart, COLORS } from './Charts.jsx';

// Dashboard analytics shown to every role (except vendors): totals + 30-day trend
export default function Analytics() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/stats/overview').then(setD).catch(() => {}); }, []);
  if (!d) return null;
  const c = d.counts;
  const tiles = [
    { k: 'total', label: 'Total requirements', v: c.total, cls: '', to: '/requirements?status=all' },
    { k: 'ongoing', label: 'Ongoing', v: c.ongoing, cls: 'tile-yellow', to: '/requirements?status=ongoing' },
    { k: 'fulfilled', label: 'Fulfilled', v: c.fulfilled, cls: 'tile-green', to: '/requirements?status=fulfilled' },
    { k: 'update', label: 'Update needed', v: c.updateNeeded, cls: 'tile-orange', to: '/requirements?status=update_needed' },
    { k: 'completed', label: 'Completed (used)', v: c.completed, cls: 'tile-blue', to: '/requirements?status=task_completed' },
  ];
  return (
    <section className="analytics">
      <div className="tiles">
        {tiles.map((t) => <Link key={t.k} to={t.to} className={`tile ${t.cls}`}><span className="tile-l">{t.label}</span><span className="tile-n">{t.v}</span></Link>)}
      </div>
      <div className="panel trend-panel">
        <div className="panel-head"><h2>Task trend</h2><span className="small muted">Last 30 days</span></div>
        <LineChart points={d.trend} series={[
          { key: 'raised', label: 'Raised', color: COLORS.tech },
          { key: 'fulfilled', label: 'Fulfilled', color: COLORS.green },
          { key: 'completed', label: 'Completed', color: COLORS.blue },
          { key: 'updateNeeded', label: 'Update needed', color: COLORS.orange },
        ]} />
      </div>
    </section>
  );
}