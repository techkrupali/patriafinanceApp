import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { naira } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import TxnRow from '../components/TxnRow';
import { Shell } from '../components/ui';

/** Figma "Home Dashboard": balance hero, quick actions, recent activity, smart card. */
export default function Dashboard() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [txns, setTxns] = useState([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    refresh().then(setDetails).catch(() => {});
    api('/transactions/get-statement')
      .then((r) => setTxns((r.data || []).slice(0, 5)))
      .catch(() => {});
  }, [refresh]);

  const u = details || user || {};
  const { inflow, outflow } = useMemo(() => {
    return {
      inflow: Number(u.totalcredit || 0),
      outflow: Number(u.totaldebit || 0),
    };
  }, [u]);
  const flowMax = Math.max(inflow, outflow, 1);
  const unread = (u.notifications || []).filter((n) => !n.is_read).length;

  return (
    <Shell>
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-navy to-navy-light font-display text-base font-bold text-white">
            {(u.first_name || 'U')[0]}
            {(u.last_name || '')[0] || ''}
          </div>
          <p className="font-display text-lg font-bold">
            Hi {u.first_name || 'there'} <span className="align-middle">👋</span>
          </p>
        </div>
        <Link to="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1c30" strokeWidth="1.8">
            <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6zM10 19a2 2 0 004 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-danger" />
          )}
        </Link>
      </header>

      <main className="flex-1 space-y-5 px-5 pb-6">
        {/* Balance hero */}
        <section className="rounded-3xl bg-gradient-to-br from-navy to-navy-light p-6 text-white shadow-cta">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-faded">Total Balance</p>
            <button onClick={() => setHidden((v) => !v)} className="text-faded" aria-label="Toggle balance">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                <circle cx="12" cy="12" r="2.6" />
              </svg>
            </button>
          </div>
          <p className="mt-2 font-display text-[40px] font-extrabold tracking-tight">
            {hidden ? '••••••' : naira(u.balance || 0)}
          </p>

          <div className="mt-5 space-y-3">
            <FlowBar label="Inflow" value={inflow} max={flowMax} positive hidden={hidden} />
            <FlowBar label="Outflow" value={outflow} max={flowMax} hidden={hidden} />
          </div>
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-3 gap-3">
          <QuickAction
            to="/transfer"
            label="Send Money"
            tint="bg-brand-glow/40 text-brand-dark"
            icon={<path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" transform="rotate(45 12 12)" />}
          />
          <QuickAction
            to="/cards"
            label="My Cards"
            tint="bg-lav text-navy"
            icon={
              <>
                <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
                <path d="M2.5 10h19" />
              </>
            }
          />
          <QuickAction
            to="/loans"
            label="Get Loan"
            tint="bg-lav text-navy"
            icon={<path d="M12 3v18M7 8c0-1.7 2.2-3 5-3s5 1.3 5 3-2.2 3-5 3-5 1.3-5 3 2.2 3 5 3 5-1.3 5-3" strokeLinecap="round" />}
          />
        </section>

        {/* Recent activity */}
        <section className="rounded-3xl bg-lav-faint p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="font-display text-lg font-bold">Recent Activity</h2>
            <Link to="/activity" className="text-sm font-bold text-brand">
              View All
            </Link>
          </div>
          <div className="space-y-2.5">
            {txns.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-muted">
                No transactions yet — send your first transfer!
              </p>
            )}
            {txns.map((t) => (
              <TxnRow key={t.transaction_id} txn={t} onClick={() => navigate('/activity')} />
            ))}
          </div>
        </section>

        {/* Smart suggestions */}
        <section className="rounded-3xl bg-lav p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6cf8bb" strokeWidth="2">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[13px] font-bold uppercase tracking-widest text-navy">Smart Suggestions</p>
          </div>
          <div className="mt-3 rounded-2xl bg-white p-4">
            <p className="text-[15px]">
              Save a beneficiary to make repeat transfers <b className="text-brand-dark">2× faster</b> 🎯
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-lav-faint pt-3">
              <span className="text-xs text-faded">Tip of the week</span>
              <Link to="/transfer" className="text-sm font-bold text-brand">
                Send Money
              </Link>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </Shell>
  );
}

function FlowBar({ label, value, max, positive = false, hidden }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-faded">{label}</span>
        <span className={`font-semibold ${positive ? 'text-brand-glow' : 'text-rose-200'}`}>
          {hidden ? '•••' : naira(value)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${positive ? 'bg-gradient-to-r from-brand to-brand-mint' : 'bg-rose-300/70'}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function QuickAction({ to, label, icon, tint }) {
  return (
    <Link to={to} className="card flex flex-col items-center gap-2.5 rounded-2xl py-4 transition active:scale-[0.97]">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${tint}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          {icon}
        </svg>
      </div>
      <span className="text-center text-xs font-semibold leading-tight">{label}</span>
    </Link>
  );
}
