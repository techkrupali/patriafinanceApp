import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { naira } from '../lib/format';
import BottomNav from '../components/BottomNav';
import { ErrorNote, Shell, Spinner, Toast, TopBar } from '../components/ui';

/** Loans: active loan status, eligibility check, apply, history. */
export default function Loans() {
  const [active, setActive] = useState(undefined); // undefined loading | null none | loan
  const [loans, setLoans] = useState([]);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    api('/loan/get-active-loan')
      .then((r) => setActive(r.data?.[0] || null))
      .catch(() => setActive(null));
    api('/loan/get-all-loans')
      .then((r) => setLoans(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell>
      <TopBar title="Loans" />
      <main className="flex-1 space-y-5 px-5 pb-6">
        {active === undefined ? (
          <div className="flex justify-center py-16 text-navy">
            <Spinner className="h-7 w-7" />
          </div>
        ) : active ? (
          <ActiveLoan loan={active} />
        ) : (
          <ApplyLoan
            onApplied={() => {
              setToast('Loan application submitted');
              load();
            }}
          />
        )}

        {loans.length > 0 && (
          <section>
            <h2 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-faded">
              Loan History
            </h2>
            <div className="space-y-2.5">
              {loans.map((l) => (
                <div key={l.loan_id} className="card flex items-center justify-between rounded-2xl">
                  <div>
                    <p className="font-semibold">{naira(l.principal)}</p>
                    <p className="text-xs text-muted">Code {l.loan_code}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      l.status === 'paid'
                        ? 'bg-brand-glow/30 text-brand-deep'
                        : l.status === 'pending'
                          ? 'bg-lav text-navy'
                          : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Toast message={toast} onDone={() => setToast('')} />
      <BottomNav />
    </Shell>
  );
}

function ActiveLoan({ loan }) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-navy to-navy-light p-6 text-white shadow-cta">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-faded">
          {loan.status === 'pending' ? 'Pending Approval' : 'Active Loan'}
        </p>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold">
          {loan.duration} mo
        </span>
      </div>
      <p className="mt-2 font-display text-[36px] font-extrabold">{naira(loan.principal)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white/10 p-3">
          <p className="text-[11px] uppercase tracking-widest text-faded">Interest</p>
          <p className="mt-0.5 font-semibold">{naira(loan.interest)}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3">
          <p className="text-[11px] uppercase tracking-widest text-faded">Due Date</p>
          <p className="mt-0.5 font-semibold">{loan.due_date}</p>
        </div>
      </div>
      {loan.status === 'pending' && (
        <p className="mt-4 text-[13px] text-faded">
          Your application is being reviewed. You&apos;ll get a notification once approved.
        </p>
      )}
    </section>
  );
}

function ApplyLoan({ onApplied }) {
  const [principal, setPrincipal] = useState('');
  const [duration, setDuration] = useState(3);
  const [eligible, setEligible] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const interest = Number(principal || 0) * 0.04 * duration;

  async function check() {
    setError('');
    setEligible(null);
    setBusy(true);
    try {
      await api('/loan/check-eligibility', { method: 'POST', body: { principal } });
      setEligible(true);
    } catch (err) {
      setEligible(false);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setError('');
    setBusy(true);
    try {
      await api('/loan/store-loan', { method: 'POST', body: { principal, duration: String(duration) } });
      onApplied();
    } catch (err) {
      setError(err.message);
      setEligible(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-5 rounded-3xl p-6">
      <div>
        <h2 className="font-display text-xl font-bold">Need a quick loan?</h2>
        <p className="mt-1 text-sm text-muted">
          Borrow up to 40% of your 90-day inflow at 4% monthly interest.
        </p>
      </div>

      <div className="rounded-3xl bg-lav-faint p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Loan Amount</p>
        <div className="mt-2 flex items-center justify-center gap-1">
          <span className="font-display text-2xl font-extrabold">₦</span>
          <input
            className="w-44 bg-transparent text-center font-display text-[34px] font-extrabold outline-none placeholder:text-lav"
            placeholder="0"
            inputMode="numeric"
            value={principal}
            onChange={(e) => {
              setPrincipal(e.target.value.replace(/\D/g, ''));
              setEligible(null);
            }}
          />
        </div>
      </div>

      <div>
        <label className="label">Duration — {duration} month{duration > 1 ? 's' : ''}</label>
        <input
          type="range"
          min={1}
          max={12}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full accent-brand"
        />
        <div className="mt-1 flex justify-between text-xs text-faded">
          <span>1 mo</span>
          <span>12 mo</span>
        </div>
      </div>

      {Number(principal) > 0 && (
        <div className="rounded-2xl bg-lav-faint p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Interest ({duration} × 4%)</span>
            <span className="font-semibold">{naira(interest)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-lav pt-2">
            <span className="text-muted">Total repayment</span>
            <span className="font-display font-extrabold">{naira(Number(principal) + interest)}</span>
          </div>
        </div>
      )}

      {eligible === true && (
        <div className="flex items-center gap-2 rounded-2xl bg-brand-glow/20 px-4 py-3 text-sm font-semibold text-brand-deep">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          You&apos;re eligible for this loan!
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {eligible !== true ? (
        <button className="btn-primary" onClick={check} disabled={!Number(principal) || busy}>
          {busy ? <Spinner className="mx-auto h-5 w-5" /> : 'Check Eligibility'}
        </button>
      ) : (
        <button className="btn-primary" onClick={apply} disabled={busy}>
          {busy ? <Spinner className="mx-auto h-5 w-5" /> : `Apply for ${naira(principal, { decimals: 0 })} →`}
        </button>
      )}
    </section>
  );
}
