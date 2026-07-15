// Minimal inline icon set (stroke inherits currentColor).

function Svg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconDashboard({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  );
}

export function IconUsers({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S13.9 16 14.5 19" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M16 14.6c2.3.2 3.9 1.5 4.5 4" />
    </Svg>
  );
}

export function IconWallet({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M16 14.5h2" />
    </Svg>
  );
}

export function IconTransactions({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 8h13" />
      <path d="M14 4.5 17.5 8 14 11.5" />
      <path d="M20 16H7" />
      <path d="M10 12.5 6.5 16l3.5 3.5" />
    </Svg>
  );
}

export function IconApprovals({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 19 6v5.5c0 4-2.9 6.8-7 8.5-4.1-1.7-7-4.5-7-8.5V6l7-2.5Z" />
      <path d="m9 11.5 2 2 3.5-3.5" />
    </Svg>
  );
}

export function IconLoans({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
    </Svg>
  );
}

export function IconProjects({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5V7.5Z" />
      <path d="M8.5 13.5l2 2 3.5-4" />
    </Svg>
  );
}

export function IconKyc({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.3 16c.4-1.7 1.6-2.6 3.2-2.6s2.8.9 3.2 2.6" />
      <path d="M14.5 10h3.5" />
      <path d="M14.5 13.5h3.5" />
    </Svg>
  );
}

export function IconLogout({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
      <path d="M10 12h10" />
      <path d="M17 8.5 20.5 12 17 15.5" />
    </Svg>
  );
}

export function IconSearch({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
    </Svg>
  );
}

export function IconChevronLeft({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m14 6-6 6 6 6" />
    </Svg>
  );
}

export function IconChevronRight({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="m10 6 6 6-6 6" />
    </Svg>
  );
}

export function IconAlert({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 21 19.5H3L12 3.5Z" />
      <path d="M12 10v4" />
      <path d="M12 16.8v.2" />
    </Svg>
  );
}

/** Patriai brand mark: rounded green tile with a P. */
export function PatriaiMark({ className }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center justify-center rounded-lg bg-brand font-bold text-mint " +
        (className ?? "h-9 w-9 text-lg")
      }
      aria-hidden="true"
    >
      P
    </span>
  );
}
