"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  IconApprovals,
  IconDashboard,
  IconKyc,
  IconLoans,
  IconProjects,
  IconTransactions,
  IconUsers,
  IconWallet,
  PatriaiMark,
} from "@/components/icons";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  exact?: boolean;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: IconDashboard, exact: true }],
  },
  {
    label: "Money",
    items: [
      { href: "/wallets", label: "Wallets", icon: IconWallet },
      { href: "/transactions", label: "Transactions", icon: IconTransactions },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/users", label: "Users", icon: IconUsers },
      { href: "/kyc", label: "KYC", icon: IconKyc },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/approvals", label: "Approvals", icon: IconApprovals },
      { href: "/loans", label: "Loans", icon: IconLoans },
      { href: "/projects", label: "Projects", icon: IconProjects },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-40 flex h-screen w-16 shrink-0 flex-col bg-navy text-white md:w-60">
      <div className="flex items-center gap-3 px-3 py-5 md:px-5">
        <PatriaiMark />
        <div className="hidden md:block">
          <p className="text-base font-bold leading-tight">Patriai</p>
          <p className="text-[11px] font-medium uppercase tracking-widest text-mint">
            Admin
          </p>
        </div>
      </div>

      <nav className="mt-1 flex-1 overflow-y-auto px-2 pb-6 md:px-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-6")}>
            <p className="mb-1.5 hidden px-3 text-[10px] font-semibold uppercase tracking-widest text-white/35 md:block">
              {group.label}
            </p>
            <div className="mx-2 mb-2 h-px bg-white/10 md:hidden" />
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={label}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-mint/50",
                      active
                        ? "bg-white/10 text-mint"
                        : "text-white/65 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-mint"
                        aria-hidden="true"
                      />
                    ) : null}
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="hidden md:inline">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
