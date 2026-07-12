import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Shell, Spinner } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell className="px-5 pb-8">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
              <path d="M4 20h16M6 20v-9m4 9v-9m4 9v-9m4 9v-9M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display text-xl font-extrabold">Patriai</span>
        </div>
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 015 .3c0 1.7-2.5 2.2-2.5 3.7M12 17h.01" strokeLinecap="round" />
          </svg>
          Support
        </span>
      </header>

      <div className="card mt-4 rounded-3xl p-6">
        <h1 className="font-display text-[32px] font-extrabold leading-tight">Welcome back</h1>
        <p className="mt-2 text-[15px] text-muted">Please enter your credentials to continue</p>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Email or Username</label>
            <div className="relative">
              <input
                className="field pr-11"
                placeholder="name@patriai.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-faded">@</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-semibold">Password</label>
              <span className="text-sm font-semibold text-brand">Forgot password?</span>
            </div>
            <div className="relative">
              <input
                className="field pr-11"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-faded"
                aria-label="Toggle password visibility"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              </button>
            </div>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <button className="btn-primary flex items-center justify-center gap-2" disabled={busy}>
            {busy ? <Spinner /> : (
              <>
                Log In
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14m-6-6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="my-7 flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-faded">
          <div className="h-px flex-1 bg-lav" />
          or continue with
          <div className="h-px flex-1 bg-lav" />
        </div>

        <button className="btn-secondary flex items-center justify-center gap-2.5" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.6">
            <path d="M12 11a4 4 0 00-4 4c0 2 1 3.5 1.6 4.6M12 11a4 4 0 014 4c0 .8-.1 1.6-.3 2.4M12 11V7.5A4.5 4.5 0 007.5 12M12 7.5A4.5 4.5 0 0116.5 12v3" strokeLinecap="round" />
          </svg>
          Biometric Sign-in
        </button>

        <p className="mt-8 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-bold text-brand">
            Create one
          </Link>
        </p>
      </div>

      <footer className="mt-auto pt-10 text-center text-xs text-faded">
        <p>Privacy Policy &nbsp;·&nbsp; Terms of Service &nbsp;·&nbsp; Cookie Settings</p>
        <p className="mt-2">© 2026 Patriai Financial Services LLC. All rights reserved.</p>
      </footer>
    </Shell>
  );
}
