import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import { ErrorNote, Field, Shell, Spinner, Toast } from '../components/ui';

/** Profile: account info, BVN verification, change password, logout. */
export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [panel, setPanel] = useState(''); // '' | password | bvn
  const [toast, setToast] = useState('');

  const bvnVerified = !!user?.bvn;

  return (
    <Shell>
      <header className="px-5 py-4">
        <h1 className="font-display text-[34px] font-extrabold">Profile</h1>
      </header>

      <main className="flex-1 space-y-5 px-5 pb-6">
        <section className="card flex items-center gap-4 rounded-3xl p-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-navy to-navy-light font-display text-xl font-bold text-white">
            {(user?.first_name || 'U')[0]}
            {(user?.last_name || '')[0] || ''}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="truncate text-sm text-muted">@{user?.username} · {user?.email}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-lav px-2.5 py-0.5 text-xs font-semibold text-navy">
              A/C {user?.virtual_account}
            </p>
          </div>
        </section>

        <section className="card divide-y divide-lav-faint rounded-3xl p-2">
          <Row
            icon="🛡️"
            title="BVN Verification"
            sub={bvnVerified ? `Verified · ${user.bvn}` : 'Verify your identity'}
            badge={bvnVerified ? 'Verified' : 'Pending'}
            badgeOk={bvnVerified}
            onClick={() => setPanel(panel === 'bvn' ? '' : 'bvn')}
          />
          <Row
            icon="🔑"
            title="Change Password"
            sub="Update your login password"
            onClick={() => setPanel(panel === 'password' ? '' : 'password')}
          />
          <Row icon="📺" title="Cable TV" sub="Verify a smartcard" onClick={() => navigate('/cabletv')} />
          <Row icon="🔔" title="Notifications" sub="Alerts and messages" onClick={() => navigate('/notifications')} />
        </section>

        {panel === 'bvn' && !bvnVerified && (
          <BvnForm
            onDone={async () => {
              setToast('BVN verified ✓');
              setPanel('');
              await refresh().catch(() => {});
            }}
          />
        )}
        {panel === 'password' && (
          <PasswordForm
            onDone={() => {
              setToast('Password changed');
              setPanel('');
            }}
          />
        )}

        <button
          className="w-full rounded-2xl bg-danger-soft py-4 font-semibold text-danger transition active:scale-[0.98]"
          onClick={() => {
            logout();
            navigate('/', { replace: true });
          }}
        >
          Log Out
        </button>

        <p className="text-center text-xs text-faded">
          Patriai Financial Services ·{' '}
          <Link className="font-semibold" to="/home">
            v1.0
          </Link>
        </p>
      </main>

      <Toast message={toast} onDone={() => setToast('')} />
      <BottomNav />
    </Shell>
  );
}

function Row({ icon, title, sub, badge, badgeOk, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3.5 p-3.5 text-left">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lav-faint text-lg">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </span>
      {badge && (
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            badgeOk ? 'bg-brand-glow/30 text-brand-deep' : 'bg-lav text-navy'
          }`}
        >
          {badge}
        </span>
      )}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function BvnForm({ onDone }) {
  const [bvn, setBvn] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/fheerr/verification', {
        method: 'POST',
        body: { verification_number: bvn, verification_type: 'bvn' },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 rounded-3xl p-5">
      <p className="text-sm font-semibold">Enter your 11-digit BVN</p>
      <Field inputMode="numeric" maxLength={11} placeholder="22123456789" value={bvn} onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))} required />
      <ErrorNote>{error}</ErrorNote>
      <button className="btn-primary" disabled={bvn.length !== 11 || busy}>
        {busy ? <Spinner className="mx-auto h-5 w-5" /> : 'Verify BVN'}
      </button>
    </form>
  );
}

function PasswordForm({ onDone }) {
  const [form, setForm] = useState({ current_password: '', new_password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/users/change-password', { method: 'POST', body: form });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 rounded-3xl p-5">
      <Field
        label="Current Password"
        type="password"
        value={form.current_password}
        onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
        required
      />
      <Field
        label="New Password"
        type="password"
        hint="Minimum 8 characters"
        value={form.new_password}
        onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
        required
      />
      <ErrorNote>{error}</ErrorNote>
      <button className="btn-primary" disabled={busy}>
        {busy ? <Spinner className="mx-auto h-5 w-5" /> : 'Update Password'}
      </button>
    </form>
  );
}
