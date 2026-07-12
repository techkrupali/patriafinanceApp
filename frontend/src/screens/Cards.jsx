import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import BottomNav from '../components/BottomNav';
import { ErrorNote, Field, Shell, Spinner, Toast } from '../components/ui';

/** Card management: apply -> activate -> manage (block/unblock, change PIN). */
export default function Cards() {
  const { user } = useAuth();
  const [data, setData] = useState(null); // { cards, is_card_available }
  const [view, setView] = useState('loading'); // loading | none | processing | manage | apply
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api('/atmcard/get-card');
      setData(r.data);
      if (!r.data.cards) setView('none');
      else if (r.data.cards.card_status === 0) setView('processing');
      else setView('manage');
    } catch {
      setView('none');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const card = data?.cards;

  return (
    <Shell>
      <header className="px-5 py-4">
        <h1 className="font-display text-[34px] font-extrabold">Cards</h1>
        <p className="text-sm text-muted">Manage your Patriai debit card</p>
      </header>

      <main className="flex-1 space-y-5 px-5 pb-6">
        {view === 'loading' && (
          <div className="flex justify-center py-16 text-navy">
            <Spinner className="h-7 w-7" />
          </div>
        )}

        {view === 'none' && <ApplyCta onApply={() => setView('apply')} />}
        {view === 'apply' && (
          <ApplyForm
            user={user}
            onDone={() => {
              setToast('Card request submitted');
              load();
            }}
            onCancel={() => setView('none')}
          />
        )}
        {view === 'processing' && <Processing card={card} onActivated={load} setToast={setToast} />}
        {view === 'manage' && card && <Manage card={card} reload={load} setToast={setToast} user={user} />}
      </main>

      <Toast message={toast} onDone={() => setToast('')} />
      <BottomNav />
    </Shell>
  );
}

function CardVisual({ card, user, frozen = false }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy to-navy-light p-6 text-white shadow-cta transition ${
        frozen ? 'opacity-60 saturate-50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="font-display text-lg font-bold">Patriai</span>
        <svg width="34" height="24" viewBox="0 0 34 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#4edea3" fillOpacity="0.85" />
          <circle cx="22" cy="12" r="10" fill="#d3e4fe" fillOpacity="0.7" />
        </svg>
      </div>
      <p className="mt-8 font-mono text-xl tracking-[0.18em]">
        {card.masked_pan.replace(/(.{4})/g, '$1 ').trim()}
      </p>
      <div className="mt-6 flex items-end justify-between text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-faded">Card Holder</p>
          <p className="font-semibold">
            {(user?.first_name || '').toUpperCase()} {(user?.last_name || '').toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-faded">Expires</p>
          <p className="font-semibold">{card.card_expiry}</p>
        </div>
      </div>
      {frozen && (
        <span className="absolute right-4 top-4 rounded-full bg-danger-soft px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-danger">
          🔒 Frozen
        </span>
      )}
    </div>
  );
}

function ApplyCta({ onApply }) {
  return (
    <div className="card flex flex-col items-center rounded-3xl border-2 border-dashed border-lav bg-lav-faint py-14 text-center shadow-none">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-navy shadow-card">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
          <path d="M2.5 10h19" />
        </svg>
      </div>
      <p className="mt-5 font-display text-lg font-bold">No card yet</p>
      <p className="mx-auto mt-1 max-w-[240px] text-sm text-muted">
        Get a Patriai debit card delivered to your doorstep.
      </p>
      <button className="btn-primary mt-6 max-w-[220px]" onClick={onApply}>
        Apply for Card
      </button>
    </div>
  );
}

function ApplyForm({ user, onDone, onCancel }) {
  const [form, setForm] = useState({ address: '', phone: user?.phone || '', note: '', transaction_pin: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/atmcard/card-apply', {
        method: 'POST',
        body: { ...form, thridparty_name: '', thridparty_phone: '' },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5 rounded-3xl p-5">
      <h2 className="font-display text-xl font-bold">Card Application</h2>
      <Field label="Delivery Address" placeholder="Street, city, state" value={form.address} onChange={set('address')} required />
      <Field label="Phone" inputMode="numeric" value={form.phone} onChange={set('phone')} required />
      <Field label="Note (optional)" placeholder="Anything we should know?" value={form.note} onChange={set('note')} />
      <Field
        label="Transaction PIN"
        type="password"
        inputMode="numeric"
        maxLength={4}
        placeholder="••••"
        value={form.transaction_pin}
        onChange={set('transaction_pin')}
        required
      />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-3">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? <Spinner className="mx-auto h-5 w-5" /> : 'Submit'}
        </button>
      </div>
    </form>
  );
}

function Processing({ card, onActivated, setToast }) {
  const [form, setForm] = useState({ card_pin: '', comfirm_card_pin: '', transaction_pin: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/\D/g, '') }));

  async function activate(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/atmcard/card/activate', { method: 'POST', body: form });
      setToast('Card activated 🎉');
      onActivated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-brand-glow/20 p-4">
        <Spinner className="h-5 w-5 text-brand-dark" />
        <div>
          <p className="text-sm font-bold text-brand-deep">Card request is processing</p>
          <p className="text-xs text-muted">Set your card PIN below to activate it.</p>
        </div>
      </div>
      <div className="opacity-70">
        <CardVisual card={card} user={null} />
      </div>
      <form onSubmit={activate} className="card space-y-5 rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Activate Card</h2>
        <Field label="New Card PIN" type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={form.card_pin} onChange={set('card_pin')} required />
        <Field label="Confirm Card PIN" type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={form.comfirm_card_pin} onChange={set('comfirm_card_pin')} required />
        <Field label="Transaction PIN" type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={form.transaction_pin} onChange={set('transaction_pin')} required />
        <ErrorNote>{error}</ErrorNote>
        <button className="btn-primary" disabled={busy}>
          {busy ? <Spinner className="mx-auto h-5 w-5" /> : 'Activate Card'}
        </button>
      </form>
    </>
  );
}

function Manage({ card, reload, setToast, user }) {
  const blocked = card.card_status === 2;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pinForm, setPinForm] = useState(null); // null | { current_card_pin, new_card_pin }
  const [blockPin, setBlockPin] = useState(null); // null | transaction_pin value

  async function toggleBlock(e) {
    e.preventDefault();
    setError('');
    setBusy('block');
    try {
      await api('/atmcard/card/block-unblock', {
        method: 'POST',
        body: { block_status: blocked ? '0' : '1', card_id: String(card.card_id), transaction_pin: blockPin },
      });
      setToast(blocked ? 'Card unfrozen' : 'Card frozen');
      setBlockPin(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function changePin(e) {
    e.preventDefault();
    setError('');
    setBusy('pin');
    try {
      await api('/atmcard/card/change-pin', {
        method: 'POST',
        body: { card_id: String(card.card_id), ...pinForm },
      });
      setToast('Card PIN updated');
      setPinForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <CardVisual card={card} user={user} frozen={blocked} />

      <div className="grid grid-cols-2 gap-3">
        <button
          className="card flex flex-col items-center gap-2 rounded-2xl py-4 font-semibold transition active:scale-[0.97]"
          onClick={() => {
            setBlockPin(blockPin === null ? '' : null);
            setPinForm(null);
            setError('');
          }}
        >
          <span className={`flex h-11 w-11 items-center justify-center rounded-full ${blocked ? 'bg-brand-glow/40 text-brand-dark' : 'bg-danger-soft text-danger'}`}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
          <span className="text-sm">{blocked ? 'Unfreeze Card' : 'Freeze Card'}</span>
        </button>
        <button
          className="card flex flex-col items-center gap-2 rounded-2xl py-4 font-semibold transition active:scale-[0.97] disabled:opacity-40"
          disabled={blocked}
          onClick={() => {
            setPinForm(pinForm === null ? { current_card_pin: '', new_card_pin: '' } : null);
            setBlockPin(null);
            setError('');
          }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lav text-navy">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="8" cy="14" r="4" />
              <path d="M11 11L20 2m-4 2l2 2m-5 1l2 2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm">Change PIN</span>
        </button>
      </div>

      {blockPin !== null && (
        <form onSubmit={toggleBlock} className="card space-y-4 rounded-3xl p-5">
          <p className="text-sm font-semibold">
            Enter transaction PIN to {blocked ? 'unfreeze' : 'freeze'} this card
          </p>
          <Field type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={blockPin} onChange={(e) => setBlockPin(e.target.value.replace(/\D/g, ''))} required />
          <ErrorNote>{error}</ErrorNote>
          <button className={blocked ? 'btn-primary' : 'w-full rounded-2xl bg-danger py-4 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50'} disabled={busy === 'block'}>
            {busy === 'block' ? <Spinner className="mx-auto h-5 w-5" /> : blocked ? 'Unfreeze Card' : 'Freeze Card'}
          </button>
        </form>
      )}

      {pinForm !== null && (
        <form onSubmit={changePin} className="card space-y-4 rounded-3xl p-5">
          <p className="text-sm font-semibold">Change card PIN</p>
          <Field label="Current PIN" type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={pinForm.current_card_pin} onChange={(e) => setPinForm((f) => ({ ...f, current_card_pin: e.target.value.replace(/\D/g, '') }))} required />
          <Field label="New PIN" type="password" maxLength={4} inputMode="numeric" placeholder="••••" value={pinForm.new_card_pin} onChange={(e) => setPinForm((f) => ({ ...f, new_card_pin: e.target.value.replace(/\D/g, '') }))} required />
          <ErrorNote>{error}</ErrorNote>
          <button className="btn-primary" disabled={busy === 'pin'}>
            {busy === 'pin' ? <Spinner className="mx-auto h-5 w-5" /> : 'Update PIN'}
          </button>
        </form>
      )}

      <div className="card rounded-3xl p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Card Details</p>
        <DetailRow k="Card Number" v={card.masked_pan} />
        <DetailRow k="Expiry" v={card.card_expiry} />
        <DetailRow k="CVV" v="•••" />
        <DetailRow k="Status" v={blocked ? 'Frozen' : 'Active'} />
      </div>
    </>
  );
}

function DetailRow({ k, v }) {
  return (
    <div className="mt-3 flex items-center justify-between">
      <span className="text-sm text-muted">{k}</span>
      <span className="font-mono text-sm font-semibold">{v}</span>
    </div>
  );
}
