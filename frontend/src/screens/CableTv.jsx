import { useState } from 'react';
import { api } from '../lib/api';
import { ErrorNote, Field, Shell, Spinner, TopBar } from '../components/ui';
import BottomNav from '../components/BottomNav';

const PROVIDERS = [
  { id: 'gotv', label: 'GOtv' },
  { id: 'dstv', label: 'DStv' },
  { id: 'startimes', label: 'StarTimes' },
];

export default function CableTv() {
  const [provider, setProvider] = useState('gotv');
  const [smartcard, setSmartcard] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function verify(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const r = await api('/transactions/verify-smart-card', {
        method: 'POST',
        body: { smart_card_number: smartcard, cable_tv_type: provider },
      });
      setResult(r.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <TopBar title="Cable TV" />
      <main className="flex-1 space-y-5 px-5 pb-6">
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProvider(p.id);
                setResult(null);
              }}
              className={`chip flex-1 ${provider === p.id ? 'chip-on' : 'chip-off'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={verify} className="card space-y-4 rounded-3xl p-5">
          <Field
            label="Smartcard Number"
            inputMode="numeric"
            placeholder="e.g. 7028959613"
            value={smartcard}
            onChange={(e) => setSmartcard(e.target.value.replace(/\D/g, ''))}
            required
          />
          <ErrorNote>{error}</ErrorNote>
          <button className="btn-primary" disabled={busy || smartcard.length < 8}>
            {busy ? <Spinner className="mx-auto h-5 w-5" /> : 'Verify Smartcard'}
          </button>
        </form>

        {result && (
          <div className="card space-y-3 rounded-3xl bg-brand-glow/15 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-deep">
              ✓ Verified Successfully
            </p>
            <Row k="Customer" v={result.customer_name} />
            <Row k="Provider" v={result.cable_tv} />
            <Row k="Bouquet" v={result.current_bouquet} />
            <Row k="Renewal" v={`₦${Number(result.renewal_amount).toLocaleString()}`} />
          </div>
        )}
      </main>
      <BottomNav />
    </Shell>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted">{k}</span>
      <span className="text-right text-sm font-semibold">{v}</span>
    </div>
  );
}
