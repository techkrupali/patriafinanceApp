import { Link } from 'react-router-dom';
import { Shell } from '../components/ui';

/** Splash — Figma "Welcome to Payslack", rebranded Patriai. */
export default function Welcome() {
  return (
    <Shell className="items-center px-6 pb-10 pt-14 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-lav bg-white px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#047857">
          <path d="M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4z" />
        </svg>
        Secure Portal
      </span>

      <div className="mt-24 flex h-36 w-36 rotate-45 items-center justify-center rounded-[2.2rem] bg-gradient-to-br from-navy to-navy-light shadow-cta">
        <svg
          className="-rotate-45"
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
        >
          <path d="M4 20h16M6 20V10m12 10V10M4 10l8-6 8 6M10 20v-4a2 2 0 014 0v4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 className="mt-16 font-display text-5xl font-extrabold tracking-tight text-navy-ink">
        Patriai
      </h1>
      <p className="mt-4 max-w-[280px] text-[17px] leading-relaxed text-muted">
        A structured approach to institutional wealth and digital movement.
      </p>

      <div className="mt-auto w-full space-y-3 pt-16">
        <Link to="/register" className="btn-primary block">
          Get Started
        </Link>
        <Link to="/login" className="btn-secondary block">
          Log In
        </Link>
      </div>

      <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.3em] text-faded">
        Institutional Grade
      </p>
      <p className="mt-2 text-[11px] text-faded">© 2026 Patriai Financial Services. All rights reserved.</p>
    </Shell>
  );
}
