import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { maskAccount, naira } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import PinPad from '../components/PinPad';
import { ErrorNote, Field, Shell, Spinner, SuccessBadge, TopBar } from '../components/ui';

/** 4-step transfer: recipient -> amount -> authorize PIN -> success. */
export default function Transfer() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [banks, setBanks] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [bankCode, setBankCode] = useState('');
  const [account, setAccount] = useState('');
  const [verified, setVerified] = useState(null); // { first_name, last_name, bank_name }
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saveBenef, setSaveBenef] = useState(true);
  const [quote, setQuote] = useState(null); // initiate-transaction response
  const [pin, setPin] = useState('');
  const [receipt, setReceipt] = useState(null); // final response

  useEffect(() => {
    api('/get-banks', { auth: false }).then((r) => setBanks(r.data || [])).catch(() => {});
    api('/transactions/get-beneficiary')
      .then((r) => setBeneficiaries(r.bankdata || []))
      .catch(() => {});
  }, []);

  const bank = useMemo(() => banks.find((b) => b.bank_code === bankCode), [banks, bankCode]);
  const recipientName = verified ? `${verified.first_name} ${verified.last_name}` : '';

  async function verify(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/verify-bank-account', {
        method: 'POST',
        body: { account_number: account, bank_code: bankCode },
      });
      setVerified(r.data);
    } catch (err) {
      setVerified(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function pickBeneficiary(b) {
    setBankCode(b.bank_code || '');
    setAccount(b.account_number || '');
    const [first = '', ...rest] = (b.account_name || '').split(' ');
    setVerified({ first_name: first, last_name: rest.join(' '), bank_name: b.bank_name });
    setSaveBenef(false);
    setError('');
  }

  async function getQuote(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/transactions/initiate-transaction', {
        method: 'POST',
        body: {
          final_amount: amount,
          transaction_type: '8',
          destination_account: account,
          description: note || `Transfer to ${recipientName}`,
        },
      });
      setQuote(r.data);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError('');
    setBusy(true);
    try {
      const r = await api('/transactions/bnk/bank-transfer', {
        method: 'POST',
        body: {
          destination_account: account,
          bank_name: bank?.bank_name || verified?.bank_name,
          bank_code: bankCode,
          receipient_name: recipientName,
          beneficiary: String(saveBenef),
          responseType: 'BankTransfer',
          transaction_reference: quote.transaction_reference,
          final_amount: amount,
          transaction_pin: pin,
          description: note || `Transfer to ${recipientName}`,
        },
      });
      setReceipt(r.data);
      await refresh().catch(() => {});
      setStep(3);
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 3: success ----
  if (step === 3) {
    return (
      <Shell className="px-5 pb-8 pt-10 text-center">
        <SuccessBadge />
        <h1 className="mt-6 font-display text-[30px] font-extrabold">Transfer Sent!</h1>
        <p className="mx-auto mt-2 max-w-[300px] text-[15px] text-muted">
          {naira(amount)} has been successfully sent to {recipientName}.
        </p>

        <div className="card mt-8 rounded-3xl bg-lav-faint p-5 text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
            Transaction Summary
          </p>
          <SummaryRow k="Reference ID" v={quote.transaction_reference} mono />
          <SummaryRow k="Recipient" v={recipientName} />
          <SummaryRow k="Bank" v={bank?.bank_name || verified?.bank_name} />
          <SummaryRow k="Amount" v={naira(amount)} accent />
          <SummaryRow k="Fee" v={naira(quote.charge)} />
          <div className="mt-3 border-t border-lav pt-3">
            <SummaryRow k="New Balance" v={naira(receipt.balance)} bold />
          </div>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          <button className="btn-primary" onClick={() => navigate('/home')}>
            Go to Home →
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              setStep(0);
              setVerified(null);
              setAccount('');
              setAmount('');
              setNote('');
              setPin('');
              setQuote(null);
              setReceipt(null);
            }}
          >
            Send Another
          </button>
        </div>
      </Shell>
    );
  }

  // ---- Step 2: authorize PIN ----
  if (step === 2) {
    return (
      <Shell className="px-5 pb-8">
        <TopBar title="Authorize Payment" right="Patriai" onBack={() => (setPin(''), setStep(1))} />
        <div className="card mt-2 rounded-3xl bg-gradient-to-br from-lav-faint to-brand-glow/15 p-6 text-center">
          <p className="text-sm text-muted">Transfer Amount</p>
          <p className="mt-1 font-display text-[32px] font-extrabold">{naira(quote.total)}</p>
          <div className="mx-auto my-3 h-px w-3/4 bg-lav" />
          <p className="text-sm text-muted">Recipient</p>
          <p className="mt-0.5 font-semibold">
            {recipientName} · {maskAccount(account)}
          </p>
        </div>

        <p className="mx-auto mt-8 max-w-[300px] text-center text-[15px] text-muted">
          Enter your 4-digit PIN to confirm the {naira(amount)} transfer
          {bank ? ` via ${bank.bank_name}` : ''}. Fee: {naira(quote.charge)}.
        </p>

        <div className="mt-8">
          <PinPad value={pin} onChange={setPin} length={4} />
        </div>

        <div className="mt-4 space-y-4 text-center">
          <ErrorNote>{error}</ErrorNote>
          <p className="text-sm font-semibold text-navy">Forgot PIN?</p>
        </div>

        <div className="mt-auto pt-6">
          <button className="btn-primary flex items-center justify-center gap-2" disabled={pin.length !== 4 || busy} onClick={confirm}>
            {busy ? <Spinner /> : 'Confirm & Send'}
          </button>
        </div>
      </Shell>
    );
  }

  // ---- Step 1: amount ----
  if (step === 1) {
    return (
      <Shell className="px-5 pb-8">
        <TopBar title="Send Money" onBack={() => setStep(0)} />
        <div className="rounded-3xl bg-lav-faint p-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">Enter Amount</p>
          <div className="mt-3 flex items-center justify-center gap-1">
            <span className="font-display text-3xl font-extrabold">₦</span>
            <input
              className="w-52 bg-transparent text-center font-display text-[40px] font-extrabold text-navy-ink outline-none placeholder:text-lav"
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              autoFocus
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            To <b>{recipientName}</b> · {verified?.bank_name}
          </p>
        </div>

        <form onSubmit={getQuote} className="card mt-5 space-y-5 rounded-3xl p-5">
          <Field label="Notes" placeholder="What is this for?" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="flex items-center justify-between rounded-2xl bg-lav-faint p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-glow/40 text-brand-dark">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold">Save Beneficiary</p>
                <p className="text-xs text-muted">Reuse for future transfers</p>
              </div>
            </div>
            <input type="checkbox" checked={saveBenef} onChange={(e) => setSaveBenef(e.target.checked)} className="h-6 w-11 appearance-none rounded-full bg-lav transition checked:bg-brand before:block before:h-6 before:w-6 before:-translate-x-0 before:rounded-full before:border-4 before:border-transparent before:bg-white before:shadow before:transition checked:before:translate-x-5" />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <button className="btn-primary flex items-center justify-center gap-2" disabled={!Number(amount) || busy}>
            {busy ? <Spinner /> : 'Confirm Transaction →'}
          </button>
        </form>
      </Shell>
    );
  }

  // ---- Step 0: recipient ----
  return (
    <Shell className="px-5 pb-8">
      <TopBar title="Select Recipient" onBack={() => navigate('/home')} />

      <form onSubmit={verify} className="card space-y-5 rounded-3xl p-5">
        <div>
          <label className="label">Bank</label>
          <select
            className="field appearance-none"
            value={bankCode}
            onChange={(e) => {
              setBankCode(e.target.value);
              setVerified(null);
            }}
            required
          >
            <option value="">Select a bank…</option>
            {banks.map((b) => (
              <option key={b.bank_code} value={b.bank_code}>
                {b.bank_name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Account Number"
          placeholder="10-digit account number"
          inputMode="numeric"
          maxLength={10}
          value={account}
          onChange={(e) => {
            setAccount(e.target.value.replace(/\D/g, ''));
            setVerified(null);
          }}
          required
        />

        {verified && (
          <div className="flex items-center gap-3 rounded-2xl bg-brand-glow/20 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {verified.first_name[0]}
              {verified.last_name[0] || ''}
            </div>
            <div>
              <p className="font-semibold">{recipientName}</p>
              <p className="text-xs text-muted">{verified.bank_name}</p>
            </div>
            <svg className="ml-auto" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.4">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <ErrorNote>{error}</ErrorNote>

        {!verified ? (
          <button className="btn-primary flex items-center justify-center gap-2" disabled={busy || account.length !== 10 || !bankCode}>
            {busy ? <Spinner /> : 'Verify Account'}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setStep(1)}>
            Continue →
          </button>
        )}
      </form>

      <section className="mt-6">
        <h2 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-faded">
          Saved Beneficiaries
        </h2>
        {beneficiaries.length === 0 ? (
          <p className="px-1 text-sm text-muted">
            None yet — verified recipients can be saved during transfer.
          </p>
        ) : (
          <div className="space-y-2.5">
            {beneficiaries.map((b) => (
              <button
                key={b.id}
                onClick={() => pickBeneficiary(b)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-lav font-bold text-navy">
                  {(b.account_name || '?')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{b.account_name}</p>
                  <p className="truncate text-xs text-muted">
                    {b.bank_name} · {maskAccount(b.account_number)}
                  </p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="mt-auto pt-6 text-center text-xs text-faded">
        Transfers are protected by your transaction PIN.{' '}
        <Link to="/home" className="font-semibold text-brand">
          Cancel
        </Link>
      </p>
    </Shell>
  );
}

function SummaryRow({ k, v, mono = false, accent = false, bold = false }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <span className="text-sm text-muted">{k}</span>
      <span
        className={`text-right text-sm ${mono ? 'font-mono' : ''} ${
          accent ? 'font-bold text-brand-dark' : bold ? 'font-display text-base font-extrabold' : 'font-semibold'
        }`}
      >
        {v}
      </span>
    </div>
  );
}
