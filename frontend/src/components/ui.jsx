import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Phone-width shell that centers the app on desktop, mirroring the 390px Figma frames. */
export function Shell({ children, className = '' }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-page">
      <div className={`flex min-h-screen flex-col ${className}`}>{children}</div>
    </div>
  );
}

/** Top bar: back chevron + centered title + optional right slot. */
export function TopBar({ title, right = null, onBack }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-page/90 px-4 py-4 backdrop-blur">
      <button
        onClick={onBack || (() => navigate(-1))}
        aria-label="Back"
        className="flex h-9 w-9 items-center justify-center rounded-full transition active:bg-lav"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="font-display text-base font-bold">{title}</h1>
      <div className="flex h-9 min-w-9 items-center justify-end text-sm font-semibold text-muted">{right}</div>
    </header>
  );
}

export function Field({ label, hint, ...props }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input className="field" {...props} />
      {hint && <p className="mt-1 text-xs text-faded">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{children}</div>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Success check inside a glowing green circle (Figma "Wallet Funded!" style). */
export function SuccessBadge() {
  return (
    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-glow/40">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-mint shadow-lg">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/** Auto-dismissing toast (bottom). */
export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white shadow-cta">
      {message}
    </div>
  );
}
