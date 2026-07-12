import { NavLink } from 'react-router-dom';

const tabs = [
  {
    to: '/home',
    label: 'Home',
    icon: (
      <path d="M3 10.5L12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    to: '/cards',
    label: 'Cards',
    icon: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19" />
      </>
    ),
  },
  {
    to: '/activity',
    label: 'Activity',
    icon: (
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.4-3.2 4-4.8 7-4.8s5.6 1.6 7 4.8" strokeLinecap="round" />
      </>
    ),
  },
];

export default function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-30 mt-auto border-t border-lav-faint bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur">
      <div className="mx-auto flex max-w-[430px] items-stretch justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-2xl px-4 py-1.5 text-[11px] font-semibold transition ${
                isActive ? 'bg-brand-glow/25 text-brand-dark' : 'text-faded'
              }`
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              {t.icon}
            </svg>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
