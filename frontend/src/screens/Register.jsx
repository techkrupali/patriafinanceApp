import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorNote, Field, Shell, Spinner, TopBar } from '../components/ui';
import PinPad from '../components/PinPad';

const STEPS = ['Personal Details', 'Secure Your Vault', 'Account Credentials'];

/** 3-step "Get Started" wizard — Figma "Create Your Account" + "Security PIN Setup". */
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    pin: '',
    confirm_pin: '',
    username: '',
    company: '',
    password: '',
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setPin = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function nextFromDetails(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{10,15}$/.test(form.phone)) return setError('Phone number must be 10–15 digits');
    setStep(1);
  }

  function nextFromPin() {
    setError('');
    if (form.pin.length !== 4) return setError('Enter a 4-digit PIN');
    if (form.pin !== form.confirm_pin) return setError('PINs do not match — try again');
    setStep(2);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      await register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        pin: form.pin,
        company: form.company.trim(),
        password: form.password,
        device_id: navigator.userAgent.slice(0, 40),
      });
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Shell className="px-5 pb-8">
      <TopBar
        title="Patriai"
        right="Help"
        onBack={() => (step === 0 ? navigate(-1) : (setError(''), setStep(step - 1)))}
      />

      <div className="flex items-end justify-between pt-2">
        <h1 className="font-display text-[34px] font-extrabold">Get Started</h1>
        <span className="pb-2 text-xs font-bold uppercase tracking-widest text-muted">
          Step {step + 1}/3
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= step ? 'bg-gradient-to-r from-brand to-brand-mint' : 'bg-brand-glow/30'
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <form onSubmit={nextFromDetails} className="card mt-6 space-y-5 rounded-3xl bg-gradient-to-br from-white to-lav-faint p-6">
          <div>
            <h2 className="font-display text-xl font-bold">Personal Details</h2>
            <p className="mt-1 text-sm text-muted">
              Please provide your legal information as it appears on your government-issued ID.
            </p>
          </div>
          <Field label="First Name" placeholder="Enter your first name" value={form.first_name} onChange={set('first_name')} required />
          <Field label="Last Name" placeholder="Enter your last name" value={form.last_name} onChange={set('last_name')} required />
          <Field label="Phone Number" placeholder="08012345678" inputMode="numeric" value={form.phone} onChange={set('phone')} required />
          <Field label="Email Address" type="email" placeholder="name@example.com" value={form.email} onChange={set('email')} required />
          <ErrorNote>{error}</ErrorNote>
          <button className="btn-primary flex items-center justify-center gap-2">
            Continue
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14m-6-6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="flex items-start gap-3 rounded-2xl bg-lav-faint p-4 text-[13px] leading-relaxed text-muted">
            <svg className="mt-0.5 shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.8">
              <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Your data is encrypted using 256-bit AES technology. Patriai never shares your personal
            information with third parties.
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="mt-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-lav">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#001736" strokeWidth="1.8">
              <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />
              <circle cx="12" cy="11" r="1.6" fill="#001736" />
              <path d="M12 12.5V15" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="mt-5 font-display text-[28px] font-extrabold">
            {form.pin.length < 4 ? 'Secure Your Vault' : 'Confirm Your PIN'}
          </h2>
          <p className="mx-auto mt-2 max-w-[280px] text-[15px] text-muted">
            {form.pin.length < 4
              ? 'Create a 4-digit PIN to authorize transactions and secure your data.'
              : 'Re-enter the same PIN to confirm.'}
          </p>

          <div className="mt-8">
            {form.pin.length < 4 ? (
              <PinPad boxed value={form.pin} onChange={setPin('pin')} length={4} />
            ) : (
              <PinPad boxed value={form.confirm_pin} onChange={setPin('confirm_pin')} length={4} />
            )}
          </div>

          <div className="mt-5 space-y-4">
            <ErrorNote>{error}</ErrorNote>
            {form.pin.length === 4 && (
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => setForm((f) => ({ ...f, pin: '', confirm_pin: '' }))}>
                Start over
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={form.confirm_pin.length !== 4}
              onClick={nextFromPin}
            >
              Confirm PIN →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="card mt-6 space-y-5 rounded-3xl bg-gradient-to-br from-white to-lav-faint p-6">
          <div>
            <h2 className="font-display text-xl font-bold">Account Credentials</h2>
            <p className="mt-1 text-sm text-muted">Choose how you will sign in to Patriai.</p>
          </div>
          <Field label="Username" placeholder="Pick a unique username" value={form.username} onChange={set('username')} required />
          <Field label="Company (optional)" placeholder="Business name" value={form.company} onChange={set('company')} />
          <Field
            label="Password"
            type="password"
            placeholder="Minimum 8 characters"
            value={form.password}
            onChange={set('password')}
            required
          />
          <ErrorNote>{error}</ErrorNote>
          <button className="btn-primary flex items-center justify-center gap-2" disabled={busy}>
            {busy ? <Spinner /> : 'Create Account →'}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-bold text-navy">
          Log In
        </Link>
      </p>
    </Shell>
  );
}
