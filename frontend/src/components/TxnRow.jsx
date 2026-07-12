import { naira } from '../lib/format';

const debitIcon = (
  <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
);
const creditIcon = (
  <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
);

/** Transaction list row: colored icon tile, title/subtitle, signed amount. */
export default function TxnRow({ txn, onClick }) {
  const credit = txn.type === 'Credit';
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card transition active:scale-[0.99]"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          credit ? 'bg-brand-glow/30 text-brand-dark' : 'bg-lav text-navy'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {credit ? creditIcon : debitIcon}
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {txn.narration || (credit ? 'Credit' : 'Transfer')}
        </p>
        <p className="truncate text-xs text-muted">
          {credit ? txn.source_name || 'Deposit' : txn.recipient_name || txn.destination_bank || 'Debit'}
          {' • '}
          {txn.date?.slice(11) || ''}
        </p>
      </div>
      <p className={`text-[15px] font-bold ${credit ? 'text-brand-dark' : 'text-navy-ink'}`}>
        {credit ? '+' : '-'}
        {naira(txn.amount)}
      </p>
    </button>
  );
}
