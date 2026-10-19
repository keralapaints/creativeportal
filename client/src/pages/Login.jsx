import { useEffect, useState } from 'react';
import { Inbox, UserCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export default function Login() {
  const { login, setup } = useAuth();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/auth/status').then((r) => setNeedsSetup(r.needsSetup)).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (needsSetup) await setup(form);
      else await login(form.email, form.password);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="auth">
      <section className="auth-art">
        <div className="brand" style={{ padding: 0 }}>Creative Desk</div>
        <div>
          <h1>Every creative request, tracked from raise to close.</h1>
          <p style={{ color: '#a7abb6', marginTop: 14, maxWidth: '42ch' }}>
            Departments raise requirements, the coordinator sets priority and assigns, creative and production deliver through Google Drive.
          </p>
        </div>
        <div>
          <div className="auth-relay" aria-hidden="true">
            <span className="n" style={{ background: 'var(--marketing)' }}><Inbox size={20} /></span>
            <span className="l" />
            <span className="n" style={{ background: 'var(--production)' }}><UserCheck size={20} /></span>
            <span className="l" />
            <span className="n" style={{ background: 'var(--creative)' }}><CheckCircle2 size={20} /></span>
          </div>
          <div className="auth-relay-labels"><span>Raise</span><span>Assign</span><span>Deliver</span></div>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>{needsSetup ? 'Create the admin account' : 'Sign in'}</h2>
            <p className="muted small" style={{ marginTop: 4 }}>
              {needsSetup ? 'This is a fresh install. The first account gets full admin access.' : 'Use the email your admin set up for you.'}
            </p>
          </div>
          {needsSetup && (
            <label className="field"><span>Your name</span><input className="input" value={form.name} onChange={set('name')} required /></label>
          )}
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required /></label>
          <label className="field"><span>Password</span><input className="input" type="password" autoComplete={needsSetup ? 'new-password' : 'current-password'} minLength={needsSetup ? 6 : undefined} value={form.password} onChange={set('password')} required /></label>
          {err && <div className="error-box">{err}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'Please wait…' : needsSetup ? 'Create account' : 'Sign in'}</button>
        </form>
      </section>
    </div>
  );
}
