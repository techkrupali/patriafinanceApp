"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { GlobalSearch } from "@/components/global-search";
import { Button } from "@/components/ui/button";
import { IconLogout } from "@/components/icons";

/**
 * Sticky top bar for the admin shell: global user search on the left, the
 * signed-in admin's identity and a logout action on the right.
 */
export function TopBar() {
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

  const initials =
    `${(user?.first_name?.[0] ?? "A").toUpperCase()}${(
      user?.last_name?.[0] ?? ""
    ).toUpperCase()}` || "A";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur-md md:gap-6 md:px-8">
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right leading-tight sm:block">
          <p className="truncate text-sm font-semibold text-ink">
            {user?.full_name ?? "Admin"}
          </p>
          <p className="truncate text-xs text-muted">
            {user?.email ?? "Administrator"}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand ring-1 ring-inset ring-brand/15">
          {initials}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="Log out"
        >
          <IconLogout className="h-4 w-4" />
          <span className="hidden md:inline">
            {loggingOut ? "Logging out…" : "Log out"}
          </span>
        </Button>
      </div>
    </header>
  );
}
