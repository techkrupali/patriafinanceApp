"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { LoginData } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import {
  IconAlert,
  IconEye,
  IconEyeOff,
  IconKyc,
  IconLock,
  IconScale,
  IconShield,
  IconTransactions,
  IconUser,
  PatriaiMark,
} from "@/components/icons";

/** The logo's three circles, drawn big: an outer ring, the mint ring and the gold seed. */
function Rings({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 400 400" className="animate-ring absolute inset-0 h-full w-full">
        <circle cx="200" cy="200" r="186" fill="none" stroke="rgba(243,247,244,0.10)" strokeWidth="2" strokeDasharray="2 14" />
      </svg>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full">
        <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(243,247,244,0.16)" strokeWidth="34" />
      </svg>
      <svg viewBox="0 0 400 400" className="animate-ring-reverse absolute inset-0 h-full w-full">
        <circle cx="200" cy="262" r="92" fill="none" stroke="#5FD3A5" strokeOpacity="0.55" strokeWidth="30" strokeDasharray="420 160" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 400 400" className="animate-seed absolute inset-0 h-full w-full">
        <circle cx="200" cy="296" r="40" fill="#F2A93B" />
        <circle cx="200" cy="296" r="58" fill="none" stroke="#F2A93B" strokeOpacity="0.25" strokeWidth="2" />
      </svg>
    </div>
  );
}

const DESK = [
  { icon: IconKyc, title: "KYC and vendor checks", line: "BVN, NIN, selfies and builders, one queue" },
  { icon: IconTransactions, title: "Money as it moves", line: "Wallets, transfers and approvals, live" },
  { icon: IconScale, title: "Disputes, settled fairly", line: "Every case with its evidence in one place" },
];

export default function LoginPage() {
  const router = useRouter();
  const { token, user, hydrated, hydrate, setSession } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Already signed in as an admin? Go straight to the dashboard.
  useEffect(() => {
    if (hydrated && token && user?.role === "admin") {
      router.replace("/");
    }
  }, [hydrated, token, user, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await api<LoginData>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });

      if (data.user.role !== "admin") {
        setError("Not an admin account");
        return;
      }

      setSession(data.token, data.user);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 text-[15px] text-ink shadow-[0_1px_1px_rgba(8,57,47,0.03)] transition-colors placeholder:text-muted/60 hover:border-line-strong/40 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";

  return (
    <main className="flex min-h-screen flex-col bg-page lg:flex-row">
      {/* The brand side: deep emerald, the logo's rings, what the desk is for. */}
      <section
        style={{ background: "linear-gradient(135deg, #08392F 0%, #0A4A3D 55%, #0B5D4B 100%)" }}
        className="relative overflow-hidden px-6 pb-8 pt-7 text-[#F3F7F4] sm:px-10 lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(#F3F7F4 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          aria-hidden="true"
        />
        <Rings className="pointer-events-none absolute -right-32 -top-28 h-[240px] w-[240px] sm:-right-24 sm:-top-20 sm:h-[360px] sm:w-[360px] lg:-right-40 lg:top-auto lg:bottom-[-120px] lg:h-[620px] lg:w-[620px]" />

        <div className="relative flex items-center gap-3">
          <PatriaiMark onDark className="h-10 w-10" />
          <div className="leading-tight">
            <p className="text-lg font-extrabold tracking-tight">Patriai</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5FD3A5]">Admin</p>
          </div>
        </div>

        <div className="animate-rise relative mt-7 max-w-md sm:mt-10 lg:mt-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5FD3A5]/30 bg-[#5FD3A5]/10 px-3 py-1 text-xs font-semibold text-[#5FD3A5]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#F2A93B]" />
            Staff console
          </span>
          <h2 className="mt-4 text-[26px] font-extrabold leading-[1.15] tracking-tight sm:text-4xl lg:text-[44px]">
            Keep every family&apos;s money <span className="text-[#F2A93B]">safe and moving.</span>
          </h2>
          <p className="mt-4 hidden text-[15px] leading-relaxed text-[#F3F7F4]/75 sm:block">
            Verifications, payments, vendors and disputes for every Patriai family, in one calm place.
          </p>

          <ul className="mt-8 hidden space-y-3 lg:block">
            {DESK.map(({ icon: Icon, title, line }) => (
              <li key={title} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5FD3A5]/15 text-[#5FD3A5]">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-[13px] text-[#F3F7F4]/65">{line}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-8 hidden text-xs text-[#F3F7F4]/50 lg:block">© {new Date().getFullYear()} Patriai · Family money, together.</p>
      </section>

      {/* The form. */}
      <section className="flex flex-1 items-start justify-center px-4 py-6 sm:px-8 sm:py-10 lg:items-center lg:py-12">
        <div className="animate-rise w-full max-w-[400px]">
          <div className="rounded-[22px] border border-line/70 bg-white p-7 shadow-[0_24px_60px_-28px_rgba(8,57,47,0.35)] sm:p-9">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
                <PatriaiMark className="h-8 w-8" />
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-warn">
                <IconShield className="h-3.5 w-3.5" />
                Staff only
              </span>
            </div>

            <h1 className="mt-6 text-2xl font-extrabold tracking-tight text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">Sign in to the Patriai admin console.</p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="identifier" className="mb-1.5 block text-xs font-semibold text-ink">
                  Email or phone
                </label>
                <div className="relative">
                  <IconUser className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                  <input
                    id="identifier"
                    name="identifier"
                    autoComplete="username"
                    placeholder="admin@patriai.app"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className={field}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-ink">
                  Password
                </label>
                <div className="relative">
                  <IconLock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                  <input
                    id="password"
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${field} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-rowhover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                    {show ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              {error ? (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">
                  <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="h-12 w-full rounded-xl text-[15px]" disabled={busy}>
                {busy ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            <div className="mt-7 flex items-center gap-3 rounded-xl bg-page px-3.5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <IconLock className="h-4 w-4" />
              </span>
              <p className="text-xs leading-relaxed text-muted">Only Patriai admin accounts can sign in here. Families use the Patriai app.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
