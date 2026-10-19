// Small dependency-free SVG charts

export function Donut({ data, size = 150, label }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 52; const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={label}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line-2)" strokeWidth="18" />
        {total > 0 && data.filter((d) => d.value).map((d) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.key} cx="70" cy="70" r={r} fill="none" stroke={d.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />;
          offset += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="donut-n">{total}</text>
        <text x="70" y="86" textAnchor="middle" className="donut-l">total</text>
      </svg>
      <ul className="legend">
        {data.map((d) => (
          <li key={d.key}><i style={{ background: d.color }} />{d.label}<b>{d.value}{total ? <span className="muted"> · {Math.round((d.value / total) * 100)}%</span> : null}</b></li>
        ))}
      </ul>
    </div>
  );
}

export function BarChart({ data, height = 160 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="vbars" style={{ height }}>
      {data.map((d) => (
        <div key={d.key} className="vbar">
          <span className="mono small">{d.value}</span>
          <i style={{ height: `${(d.value / max) * 100}%`, background: d.color }} />
          <span className="tiny muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Multi-series line chart. series: [{ key, label, color }]; points: [{ day, [key]: n }]
export function LineChart({ points, series, height = 150 }) {
  const W = 600; const H = height; const pad = 22;
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => p[s.key] || 0)));
  const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, points.length - 1);
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  return (
    <div className="linechart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Trend for the last 30 days">
        {[0, 0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} stroke="var(--line-2)" />)}
        {series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
            points={points.map((p, i) => `${x(i)},${y(p[s.key] || 0)}`).join(' ')} />
        ))}
        <text x={pad} y={H - 4} className="axis">{points[0]?.day?.slice(5)}</text>
        <text x={W - pad} y={H - 4} textAnchor="end" className="axis">{points[points.length - 1]?.day?.slice(5)}</text>
        <text x={pad - 4} y={y(max) + 4} textAnchor="end" className="axis">{max}</text>
      </svg>
      <div className="row tiny" style={{ gap: 12, flexWrap: 'wrap' }}>
        {series.map((s) => <span key={s.key} className="row" style={{ gap: 4 }}><i className="key" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}

export const COLORS = {
  grey: '#8a8f99', yellow: '#c99400', green: '#1f7a3f', orange: '#d9620a', blue: '#2558c9', red: '#c2410c', violet: '#6d4fc2', tech: '#2f6f9f',
};