"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";
import {
  IconApprovals,
  IconDashboard,
  IconLogout,
  IconTransactions,
  IconUsers,
  IconWallet,
  PatriaiMark,
} from "@/components/icons";

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDashboard, exact: true },
  { href: "/users", label: "Users", icon: IconUsers, exact: false },
  { href: "/wallets", label: "Wallets", icon: IconWallet, exact: false },
  { href: "/transactions", label: "Transactions", icon: IconTransactions, exact: false },
  { href: "/approvals", label: "Approvals", icon: IconApprovals, exact: false },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clear } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Best effort — clear the local session regardless.
    }
    clear();
    router.replace("/login");
  }

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-navy text-white md:w-60">
      <div className="flex items-center gap-3 px-3 py-5 md:px-5">
        <PatriaiMark />
        <div className="hidden md:block">
          <p className="text-base font-bold leading-tight">Patriai</p>
          <p className="text-[11px] font-medium uppercase tracking-widest text-mint">
            Admin
          </p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-2 md:px-3">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/10 text-mint"
                  : "text-white/70 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-2 py-4 md:px-3">
        <div className="mb-3 hidden items-center gap-3 px-3 md:flex">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint/20 text-xs font-bold text-mint">
            {(user?.first_name?.[0] ?? "A").toUpperCase()}
            {(user?.last_name?.[0] ?? "").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.full_name ?? "Admin"}</p>
            <p className="truncate text-xs text-white/50">{user?.email ?? ""}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          <IconLogout className="h-5 w-5 shrink-0" />
          <span className="hidden md:inline">
            {loggingOut ? "Logging out..." : "Log out"}
          </span>
        </button>
      </div>
    </aside>
  );
}
