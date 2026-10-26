import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/*
 * 🎉 Full-screen celebration: confetti rain + firework bursts + a congratulations card.
 * Pure canvas, no library. Respects "reduce motion" (shows only the card).
 * Props: data = { earlyDays, streak, best, monthOnTime, monthTotal, unlocked, badge }, name, onClose
 */
const COLORS = ['#f94144', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#4d96ff', '#9b5de5', '#f15bb5'];
const rand = (a, b) => a + Math.random() * (b - a);

function runFireworks(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`; canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);
  const W = () => window.innerWidth; const H = () => window.innerHeight;

  const parts = [];
  // confetti from the top
  const confetti = (n) => {
    for (let i = 0; i < n; i += 1) {
      parts.push({ kind: 'c', x: rand(0, W()), y: rand(-H() * 0.4, -10), vx: rand(-1.5, 1.5), vy: rand(2, 5), w: rand(6, 11), h: rand(8, 16), rot: rand(0, Math.PI), vr: rand(-0.2, 0.2), color: COLORS[(Math.random() * COLORS.length) | 0], life: 1 });
    }
  };
  // cracker burst at a point
  const burst = (x, y) => {
    const color = COLORS[(Math.random() * COLORS.length) | 0];
    const n = 70;
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n; const s = rand(2, 6.5);
      parts.push({ kind: 'f', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: Math.random() < 0.25 ? '#fff6c8' : color, life: 1, decay: rand(0.012, 0.02), r: rand(1.6, 2.8) });
    }
  };
  // rockets that rise then burst
  const rocket = () => parts.push({ kind: 'r', x: rand(W() * 0.15, W() * 0.85), y: H() + 10, vx: rand(-1, 1), vy: rand(-13, -10), color: '#ffe8a3', life: 1, burstAt: rand(H() * 0.15, H() * 0.45) });

  confetti(160);
  const timers = [0, 350, 700, 1100, 1500, 1900, 2400].map((t) => setTimeout(rocket, t));
  timers.push(setTimeout(() => confetti(90), 1200));

  let frame; const start = performance.now();
  const tick = (now) => {
    ctx.clearRect(0, 0, W(), H());
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i];
      if (p.kind === 'c') {
        p.vy += 0.05; p.vx *= 0.995; p.x += p.vx + Math.sin((now + i) / 300) * 0.6; p.y += p.vy; p.rot += p.vr;
        if (p.y > H() + 20) { parts.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot))); ctx.restore();
      } else if (p.kind === 'r') {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18;
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,150,0.35)'; ctx.fillRect(p.x - 1, p.y, 2, 14);
        if (p.y <= p.burstAt || p.vy >= 0) { burst(p.x, p.y); parts.splice(i, 1); }
      } else {
        p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.06; p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    if (parts.length || now - start < 2600) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); timers.forEach(clearTimeout); window.removeEventListener('resize', resize); };
}

const CHEERS = ['Brilliant work', 'Right on time', 'Nailed it', 'Superb delivery', 'You’re on fire', 'Deadline crushed'];

export default function Celebration({ data, name, onClose }) {
  const ref = useRef(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const stop = reduce || !ref.current ? () => {} : runFireworks(ref.current);
    const key = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const auto = setTimeout(onClose, 9000);
    return () => { stop(); window.removeEventListener('keydown', key); clearTimeout(auto); };
  }, [onClose, reduce]);

  if (!data) return null;
  const { earlyDays = 0, streak = 0, best = 0, monthOnTime = 0, monthTotal = 0, unlocked, badge } = data;
  const cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)];
  const when = earlyDays >= 2 ? `${earlyDays} days early` : earlyDays === 1 ? '1 day early' : 'right on the due day';

  return createPortal(
    <div className="celebrate" role="dialog" aria-modal="true" aria-label="Delivered on time" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <canvas ref={ref} className="celebrate-canvas" aria-hidden="true" />
      <div className="celebrate-card">
        <div className="celebrate-emoji" aria-hidden="true">🎉</div>
        <h2>{cheer}{name ? `, ${name.split(' ')[0]}` : ''}!</h2>
        <p className="celebrate-sub">Delivered on time · <b>{when}</b></p>

        {unlocked && (
          <div className="badge-unlock">
            <span className="badge-emoji" aria-hidden="true">{unlocked.emoji}</span>
            <div><span className="tiny">New badge unlocked</span><b>{unlocked.name}</b></div>
          </div>
        )}

        <div className="celebrate-stats">
          <div><span className="cs-n">🔥 {streak}</span><span className="cs-l">on time in a row</span></div>
          <div><span className="cs-n">{monthOnTime}/{monthTotal}</span><span className="cs-l">on time this month</span></div>
          <div><span className="cs-n">{best}</span><span className="cs-l">best streak</span></div>
        </div>
        {!unlocked && badge && <p className="tiny muted">Current badge: {badge.emoji} {badge.name}</p>}
        {!badge && streak < 3 && <p className="tiny muted">{3 - streak} more on-time {3 - streak === 1 ? 'delivery' : 'deliveries'} to unlock ⚡ On a Roll</p>}

        <button className="btn go" onClick={onClose} autoFocus>Keep it up!</button>
      </div>
    </div>,
    document.body,
  );
}

// Small banner for the staff dashboard
export function StreakBanner({ s }) {
  if (!s || (!s.streak && !s.monthTotal)) return null;
  const next = [3, 5, 10, 25].find((n) => n > s.streak);
  return (
    <div className="streak-banner">
      <span className="sb-fire" aria-hidden="true">{s.badge?.emoji || '🔥'}</span>
      <div className="sb-text">
        <b>{s.streak ? `${s.streak} on-time ${s.streak === 1 ? 'delivery' : 'deliveries'} in a row` : 'Start a streak – deliver on time'}</b>
        <span className="small">
          {s.badge ? `${s.badge.name} · ` : ''}{s.monthOnTime}/{s.monthTotal} on time this month · best {s.best}
          {next ? ` · ${next - s.streak} more for the next badge` : ''}
        </span>
      </div>
      {next && <div className="sb-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (s.streak / next) * 100)}%` }} /></div>}
    </div>
  );
}