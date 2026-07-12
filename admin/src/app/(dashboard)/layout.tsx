"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { Sidebar } from "@/components/sidebar";

/**
 * Client-side guard for every admin page: requires a stored token AND an
 * admin-role user. Anything else is bounced to /login. (The API enforces the
 * real authorization via the `admin` middleware; this is purely UX.)
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { token, user, hydrated, hydrate } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const authorized = Boolean(token) && user?.role === "admin";

  useEffect(() => {
    if (hydrated && !authorized) {
      router.replace("/login");
    }
  }, [hydrated, authorized, router]);

  if (!hydrated || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
