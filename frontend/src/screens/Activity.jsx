import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { dayLabel, parseStatementDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import TxnRow from '../components/TxnRow';
import { Shell, Spinner } from '../components/ui';

const FILTERS = ['All', 'Income', 'Expenses'];

/** Figma "Recent Activity / Activity" — search, filter chips, day-grouped feed. */
export default function Activity() {
  const { user } = useAuth();
  const [txns, setTxns] = useState(null);
  const [filter, setFilter] = useState('All');
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/transactions/get-statement')
      .then((r) => setTxns(r.data || []))
      .catch(() => setTxns([]));
  }, []);

  const groups = useMemo(() => {
    let list = txns || [];
    if (filter === 'Income') list = list.filter((t) => t.type === 'Credit');
    if (filter === 'Expenses') list = list.filter((t) => t.type === 'Debit');
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((t) =>
        [t.narration, t.recipient_name, t.destination_bank, t.source_name, t.transaction_id]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(s))
      );
    }
    const map = new Map();
    for (const t of list) {
      const label = dayLabel(parseStatementDate(t.date));
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }
    return [...map.entries()];
  }, [txns, filter, q]);

  return (
    <Shell>
      <header className="flex items-center justify-between px-5 py-4">
        <p className="font-display text-lg font-bold">Hi {user?.first_name || 'there'} 👋</p>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1c30" strokeWidth="1.8">
          <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6zM10 19a2 2 0 004 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </header>

      <main className="flex-1 px-5 pb-6">
        <h1 className="font-display text-[34px] font-extrabold">Activity</h1>

        <div className="relative mt-4">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 text-faded"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            className="field pl-11"
            placeholder="Search transactions..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip ${filter === f ? 'chip-on' : 'chip-off'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {txns === null ? (
          <div className="flex justify-center py-16 text-navy">
            <Spinner className="h-7 w-7" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">No transactions found.</p>
        ) : (
          groups.map(([label, list]) => (
            <section key={label} className="mt-6">
              <h2 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-faded">
                {label}
              </h2>
              <div className="space-y-2.5">
                {list.map((t) => (
                  <TxnRow key={t.transaction_id} txn={t} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <BottomNav />
    </Shell>
  );
}
