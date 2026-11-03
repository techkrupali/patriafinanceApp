"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { label, naira, ONBOARDING_PURPOSES } from "@/lib/format";
import type { FlowPoint, StatsData } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { FlowChart, compactNaira } from "@/components/dashboard/flow-chart";
import {
  IconAlert,
  IconApprovals,
  IconArrowUpRight,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconKyc,
  IconLoans,
  IconProjects,
  IconSliders,
  IconTransactions,
  IconTrendDown,
  IconTrendUp,
  IconUsers,
  IconWallet,
  PatriaiMark,
} from "@/components/icons";

type IconT = (props: { className?: string }) => React.ReactNode;

/** Emerald shades for ranked bars, strongest first. */
const SHADES = ["#0B5D4B", "#1FA07A", "#3DB98E", "#5FD3A5", "#8FE0BF", "#B7EBD5", "#CDEFE0", "#DFF3EA"];
/** Wallet bars: the biggest in deep emerald, the rest in mint tints dark text reads on. */
const BAR_TINTS = ["#0B5D4B", "#7ED9B5", "#9BE2C6", "#B5EAD5", "#C8F0DF", "#D6F4E7", "#E1F6EC", "#E8F8F0"];

function greeting(): string {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[22px] border border-line/80 bg-white p-5 shadow-card sm:p-6", className)} {...props} />;
}

function PanelHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

function SeeAll({ href, children = "See all" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold text-brand transition-colors hover:bg-brand-soft">
      {children}
      <IconChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/** "+12.4%" style delta chip. */
function Delta({ up, children, onDark = false }: { up: boolean; children: React.ReactNode; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        onDark ? "bg-white/15 text-white" : up ? "bg-brand-soft text-brand" : "bg-danger/10 text-danger",
      )}
    >
      {up ? <IconTrendUp className="h-3 w-3" /> : <IconTrendDown className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** A soft mint line with a glow under it, scaled to its own box. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-14" />;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 300, 70 - (v / max) * 62] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 300 72" preserveAspectRatio="none" className="h-14 w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="hero-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5FD3A5" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#5FD3A5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L300,72 L0,72 Z`} fill="url(#hero-spark)" />
      <path d={line} fill="none" stroke="#5FD3A5" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill="#F2A93B" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The hero: every naira on Patriai, with the last 30 days in and out. */
function BalanceHero({ stats, in30, out30 }: { stats: StatsData; in30: number; out30: number }) {
  const total = Number(stats.wallets.total_balance);
  const [whole, kobo] = naira(total).replace("₦", "").split(".");
  const net = in30 - out30;
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-[22px] p-6 text-white shadow-[0_24px_60px_-30px_rgba(8,57,47,0.7)] sm:p-7"
      style={{ background: "linear-gradient(140deg, #08392F 0%, #0B5D4B 58%, #12775F 100%)" }}
    >
      <svg viewBox="0 0 400 400" className="animate-ring pointer-events-none absolute -right-36 -top-32 h-72 w-72 opacity-60 sm:-right-28 sm:-top-28 sm:h-80 sm:w-80 sm:opacity-80" aria-hidden="true">
        <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(243,247,244,0.10)" strokeWidth="30" />
        <circle cx="200" cy="262" r="92" fill="none" stroke="#5FD3A5" strokeOpacity="0.35" strokeWidth="26" strokeDasharray="420 160" strokeLinecap="round" />
      </svg>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(#F3F7F4 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/15">
            <IconWallet className="h-5 w-5 text-[#5FD3A5]" />
          </span>
          <div>
            <p className="text-[15px] font-bold">Total balance</p>
            <p className="text-xs text-white/65">Across {stats.wallets.total.toLocaleString()} wallets</p>
          </div>
        </div>
        <Link href="/wallets" className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15 transition-colors hover:bg-white/20">
          Wallets
        </Link>
      </div>

      <p className="relative mt-7 flex items-baseline gap-1 font-extrabold tracking-tight">
        <span className="text-2xl text-white/55">₦</span>
        <span className="text-[40px] leading-none tabular-nums sm:text-[46px]">{whole}</span>
        <span className="text-xl text-white/55 tabular-nums">.{kobo}</span>
      </p>
      <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
        <Delta up={net >= 0} onDark>
          {net >= 0 ? "+" : "−"}
          {compactNaira(Math.abs(net))}
        </Delta>
        net in the last 30 days
      </div>

      {/* Money in, each of the last 30 days; it also fills the card when the row is tall. */}
      <div className="relative mt-5 flex min-h-[76px] flex-1 flex-col justify-end pb-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
          <span>Money in · last 30 days</span>
          <span className="font-semibold text-white/80">{compactNaira(in30)}</span>
        </div>
        <Sparkline values={(stats.trend?.daily ?? []).map((d) => Number(d.in))} />
      </div>
      <div className="relative grid grid-cols-1 gap-2 rounded-2xl bg-white/8 p-2.5 ring-1 ring-white/10 sm:grid-cols-3 sm:gap-2.5">
        {[
          { k: "Money in", v: in30, hint: "Bank deposits", up: true },
          { k: "Money out", v: out30, hint: "Payouts to banks", up: false },
          { k: "Escrow held", v: Number(stats.projects.escrow), hint: "Active projects", up: true },
        ].map((t) => (
          <div key={t.k} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-ink sm:block sm:py-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-muted">{t.k}</p>
            </div>
            <p className="shrink-0 text-[15px] font-extrabold tabular-nums sm:mt-1 sm:text-base">{compactNaira(t.v)}</p>
            <p className="hidden truncate text-[10.5px] text-muted sm:mt-0.5 sm:block">{t.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** What needs a person today; zeros show as clear. */
function Attention({ stats }: { stats: StatsData }) {
  const rows: { icon: IconT; title: string; hint: string; count: number; href: string; tone: "gold" | "info" | "danger" }[] = [
    { icon: IconApprovals, title: "Pending approvals", hint: "Awaiting sign-off", count: stats.approvals.pending, href: "/approvals", tone: "gold" },
    { icon: IconKyc, title: "KYC reviews", hint: "Waiting for a check", count: stats.kyc.pending, href: "/kyc", tone: "gold" },
    { icon: IconLoans, title: "Loan requests", hint: "Awaiting a decision", count: stats.loans.pending, href: "/loans", tone: "gold" },
    { icon: IconClock, title: "Pending transactions", hint: "Still in flight", count: stats.transactions.pending, href: "/transactions", tone: "info" },
    { icon: IconAlert, title: "Failed transactions", hint: "Need a look", count: stats.transactions.failed, href: "/transactions", tone: "danger" },
  ];
  const open = rows.reduce((n, r) => n + r.count, 0);
  const tones = {
    gold: "bg-gold-soft text-warn",
    info: "bg-info-soft text-info",
    danger: "bg-danger/10 text-danger",
  };
  return (
    <Panel className="flex h-full flex-col">
      <PanelHead
        title="Needs attention"
        sub={open ? `${open.toLocaleString()} open item${open === 1 ? "" : "s"}` : "You're all caught up"}
        action={open ? <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-bold text-warn">{open}</span> : null}
      />
      <ul className="-mx-2 flex-1 space-y-1">
        {rows.map((r) => {
          const clear = r.count === 0;
          return (
            <li key={r.title}>
              <Link href={r.href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-rowhover">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", clear ? "bg-page text-muted" : tones[r.tone])}>
                  <r.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-semibold", clear ? "text-muted" : "text-ink")}>{r.title}</span>
                  <span className="block truncate text-xs text-muted">{clear ? "Nothing waiting" : r.hint}</span>
                </span>
                {clear ? (
                  <IconCheckCircle className="h-5 w-5 shrink-0 text-brand/60" />
                ) : (
                  <span className={cn("min-w-8 rounded-full px-2 py-0.5 text-center text-sm font-bold tabular-nums", tones[r.tone])}>{r.count.toLocaleString()}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Where the money sits, by wallet type (bars filled to their share). */
function MoneyByType({ stats }: { stats: StatsData }) {
  const rows = Object.entries(stats.balance_by_type ?? {})
    .map(([type, v]) => ({ type, v: Number(v) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = rows.reduce((n, r) => n + r.v, 0);
  return (
    <Panel className="h-full">
      <PanelHead title="Money by wallet" sub="Where balances sit today" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No money in wallets yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r, i) => {
            const pct = total ? Math.round((r.v / total) * 100) : 0;
            const fill = BAR_TINTS[Math.min(i, BAR_TINTS.length - 1)];
            const white = i === 0 && pct >= 28;
            return (
              <li key={r.type} className="relative h-10 overflow-hidden rounded-xl bg-page" title={`${label(r.type)} · ${naira(r.v)}`}>
                <div className="absolute inset-y-0 left-0 rounded-xl transition-all duration-700" style={{ width: `${Math.max(pct, 3)}%`, background: fill }} />
                <div className="relative flex h-full items-center justify-between px-3 text-[13px]">
                  <span className={cn("font-semibold", white ? "text-white" : "text-ink")}>{label(r.type)}</span>
                  <span className="font-bold tabular-nums text-ink">{pct}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

type Range = "1Y" | "6M" | "1M";

function CashFlow({ stats }: { stats: StatsData }) {
  const [range, setRange] = useState<Range>("1Y");
  const data: FlowPoint[] = useMemo(() => {
    const t = stats.trend;
    if (!t) return [];
    return range === "1M" ? t.daily : range === "6M" ? t.monthly.slice(-6) : t.monthly;
  }, [stats.trend, range]);
  const sIn = data.reduce((n, d) => n + Number(d.in), 0);
  const sOut = data.reduce((n, d) => n + Number(d.out), 0);
  return (
    <Panel className="h-full">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Cash flow</h2>
          <p className="mt-0.5 text-[13px] text-muted">Money into Patriai and out to banks</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-page p-1" role="tablist" aria-label="Period">
          {(["1Y", "6M", "1M"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                range === r ? "bg-navy text-white shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Money in
          </p>
          <p className="text-xl font-extrabold tabular-nums text-ink">{naira(sIn)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-gold" /> Money out
          </p>
          <p className="text-xl font-extrabold tabular-nums text-ink">{naira(sOut)}</p>
        </div>
        <Delta up={sIn - sOut >= 0}>
          Net {sIn - sOut >= 0 ? "+" : "−"}
          {compactNaira(Math.abs(sIn - sOut))}
        </Delta>
      </div>
      {data.length ? <FlowChart data={data} /> : <p className="py-16 text-center text-sm text-muted">No money has moved yet.</p>}
    </Panel>
  );
}

function RecentTable({ stats }: { stats: StatsData }) {
  const rows = stats.recent ?? [];
  const pill = (type: string) =>
    type === "fund" || type === "funding" || type === "refund"
      ? "bg-brand-soft text-brand"
      : type === "withdrawal"
        ? "bg-gold-soft text-warn"
        : type === "fee"
          ? "bg-danger/10 text-danger"
          : "bg-info-soft text-info";
  return (
    <Panel className="h-full">
      <PanelHead title="Recent transactions" sub="The latest money moving" action={<SeeAll href="/transactions" />} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No transactions yet.</p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[400px] text-left text-[13px]">
            <thead>
              <tr className="text-xs text-muted">
                <th className="rounded-l-xl bg-page px-3 py-2.5 font-semibold">Description</th>
                <th className="bg-page px-3 py-2.5 font-semibold">Type</th>
                <th className="bg-page px-3 py-2.5 font-semibold">Date</th>
                <th className="rounded-r-xl bg-page px-3 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const credit = t.direction === "credit";
                return (
                  <tr key={t.id} className="group">
                    <td className="max-w-[150px] px-3 py-3">
                      <Link href={`/transactions/${t.id}`} className="block truncate font-semibold text-ink group-hover:text-brand">
                        {t.description}
                      </Link>
                      <span className="block truncate text-[11px] text-muted">{[t.owner, t.wallet].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="px-2 py-3">
                      <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", pill(t.type))}>{label(t.type)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums", t.status !== "successful" ? "text-muted" : credit ? "text-brand" : "text-danger")}>
                      {credit ? "+" : "−"}₦{Math.round(Number(t.amount)).toLocaleString("en-NG")}
                      {t.status !== "successful" ? <span className="block text-[10px] font-semibold capitalize">{t.status}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Customers, with a 14-day bar sparkline of sign-ups. */
function People({ stats }: { stats: StatsData }) {
  const days = stats.signups_daily ?? [];
  const max = Math.max(1, ...days.map((d) => d.count));
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover !== null ? days[hover] : null;
  const activePct = stats.users.total ? Math.round((stats.users.active / stats.users.total) * 100) : 0;
  return (
    <Panel className="h-full">
      <PanelHead title="People" sub="Customers on Patriai" action={<SeeAll href="/users" />} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-extrabold tracking-tight tabular-nums text-ink">{stats.users.total.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted">
            {stats.users.active.toLocaleString()} active · {activePct}%
          </p>
        </div>
        <Delta up>+{stats.users.new_7d.toLocaleString()} this week</Delta>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-muted">Sign-ups, last 14 days</span>
          <span className="font-semibold text-ink">{shown ? `${shown.label}: ${shown.count}` : ""}</span>
        </div>
        <div className="flex h-24 items-end gap-1.5" onMouseLeave={() => setHover(null)}>
          {days.map((d, i) => {
            const peak = d.count === max && d.count > 0;
            return (
              <div
                key={d.key}
                onMouseEnter={() => setHover(i)}
                className="group relative flex-1 rounded-t-md transition-all duration-500"
                style={{
                  height: `${Math.max(6, (d.count / max) * 100)}%`,
                  background: peak || hover === i ? "linear-gradient(180deg, #1FA07A, #0B5D4B)" : "linear-gradient(180deg, #DFF3EA, #EEF5F1)",
                }}
                title={`${d.label}: ${d.count}`}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted">
          <span>{days[0]?.label}</span>
          <span>Today</span>
        </div>
      </div>
    </Panel>
  );
}

function Tile({ icon: Icon, title, value, hint, href }: { icon: IconT; title: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-line/70 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card-hover">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <IconArrowUpRight className="h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-3 truncate text-[22px] font-extrabold tracking-tight tabular-nums text-ink">{value}</p>
      <p className="truncate text-[13px] font-semibold text-ink">{title}</p>
      {hint ? <p className="truncate text-[11px] text-muted">{hint}</p> : null}
    </Link>
  );
}

/** Two-part bar ("Phone + PIN 92% · Email 8%"). */
function Split({ parts }: { parts: { name: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-page">
        {parts.map((p) => (
          <div key={p.name} style={{ width: total ? `${(p.n / total) * 100}%` : "0%", background: p.color }} className="transition-all duration-700" />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
        {parts.map((p) => (
          <span key={p.name} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="font-semibold text-ink">{p.name}</span>
            {total ? `${Math.round((p.n / total) * 100)}%` : "0%"} · {p.n.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}

function SetupBanner({ tone, title, children }: { tone: "amber" | "blue"; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", tone === "amber" ? "border-gold/40 bg-gold-soft" : "border-info/20 bg-info-soft")}>
      <IconAlert className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "amber" ? "text-warn" : "text-info")} />
      <p className={cn("text-[13px]", tone === "amber" ? "text-warn" : "text-info")}>
        <span className="font-bold text-ink">{title}. </span>
        {children}
      </p>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-16 w-80 rounded-2xl" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Skeleton className="h-[330px] rounded-[22px] xl:col-span-5" />
        <Skeleton className="h-[330px] rounded-[22px] xl:col-span-4" />
        <Skeleton className="h-[330px] rounded-[22px] xl:col-span-3" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Skeleton className="h-[400px] rounded-[22px] xl:col-span-7" />
        <Skeleton className="h-[400px] rounded-[22px] xl:col-span-5" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api<StatsData>("/api/v1/admin/stats"),
  });
  const firstName = user?.first_name?.trim();
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

  const header = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{today}</p>
        <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
          <span className="text-gold">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Every family&apos;s money, approvals and people on Patriai, in one place.</p>
      </div>
      {data ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/transactions" className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink shadow-card transition-colors hover:bg-rowhover">
            <IconTransactions className="h-4 w-4 text-brand" />
            Transactions
          </Link>
          <Link
            href="/approvals"
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(11,93,75,0.9)] transition-transform hover:-translate-y-0.5"
            style={{ background: "linear-gradient(120deg, #0B5D4B, #1FA07A)" }}
          >
            <PatriaiMark onDark className="h-4 w-4" />
            Review queue
            {data.approvals.pending + data.kyc.pending + data.loans.pending > 0 ? (
              <span className="rounded-full bg-gold px-1.5 text-[11px] font-bold text-[#2A1B00]">{data.approvals.pending + data.kyc.pending + data.loans.pending}</span>
            ) : null}
          </Link>
        </div>
      ) : null}
    </div>
  );

  if (isError) {
    return (
      <>
        {header}
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }
  if (isPending) {
    return (
      <>
        {header}
        <LoadingDashboard />
      </>
    );
  }

  const in30 = (data.trend?.daily ?? []).reduce((n, d) => n + Number(d.in), 0);
  const out30 = (data.trend?.daily ?? []).reduce((n, d) => n + Number(d.out), 0);
  const { signups } = data;
  const joined = signups.phone + signups.password;
  const purposes = Object.keys(ONBOARDING_PURPOSES)
    .map((key) => [key, signups.purposes[key] ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const purposeMax = Math.max(1, ...purposes.map(([, n]) => n));

  return (
    <div className="animate-rise">
      {header}

      {!data.system.sms_configured || !data.system.ai_configured ? (
        <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {!data.system.sms_configured ? (
            <SetupBanner tone="amber" title="Sign-up codes aren't being sent">
              Set TERMII_API_KEY on the API server; until then codes are only written to the server log.
            </SetupBanner>
          ) : null}
          {!data.system.ai_configured ? (
            <SetupBanner tone="blue" title="Steward is on built-in answers">
              Set ANTHROPIC_API_KEY on the API server to turn on the AI assistant.
            </SetupBanner>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-12">
        <div className="h-full lg:col-span-2 xl:col-span-5">
          <BalanceHero stats={data} in30={in30} out30={out30} />
        </div>
        <div className="xl:col-span-4">
          <Attention stats={data} />
        </div>
        <div className="xl:col-span-3">
          <MoneyByType stats={data} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <CashFlow stats={data} />
        </div>
        <div className="xl:col-span-5">
          <RecentTable stats={data} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <People stats={data} />
        </div>
        <div className="xl:col-span-8">
          <Panel className="h-full">
            <PanelHead title="Portfolio" sub="What families run on Patriai" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile icon={IconWallet} title="Wallets" value={data.wallets.total.toLocaleString()} hint="All types" href="/wallets" />
              <Tile icon={IconSliders} title="Running rules" value={data.rules.active.toLocaleString()} hint={`${data.rules.paused.toLocaleString()} paused`} href="/wallets" />
              <Tile icon={IconUsers} title="Pending invites" value={data.invitations.pending.toLocaleString()} hint="Sent, not yet accepted" href="/users" />
              <Tile icon={IconTransactions} title="Transactions" value={data.transactions.total.toLocaleString()} hint={`${data.transactions.pending} pending · ${data.transactions.failed} failed`} href="/transactions" />
              <Tile icon={IconLoans} title="Active loans" value={data.loans.active.toLocaleString()} hint={`${compactNaira(Number(data.loans.outstanding))} outstanding`} href="/loans" />
              <Tile icon={IconProjects} title="Active projects" value={data.projects.active.toLocaleString()} hint={`${compactNaira(Number(data.projects.escrow))} in escrow`} href="/projects" />
              <Tile icon={IconKyc} title="KYC queue" value={data.kyc.pending.toLocaleString()} hint="Waiting for review" href="/kyc" />
              <Tile icon={IconApprovals} title="Approvals" value={data.approvals.pending.toLocaleString()} hint="Waiting for a yes" href="/approvals" />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Panel className="h-full">
            <PanelHead title="What brings people to Patriai" sub={`${signups.answered_purposes.toLocaleString()} answered at sign-up`} />
            {signups.answered_purposes === 0 ? (
              <p className="text-sm text-muted">No answers yet.</p>
            ) : (
              <ul className="space-y-3.5">
                {purposes.map(([key, n], i) => (
                  <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[260px_minmax(0,1fr)_auto]">
                    <span className="truncate text-[13px] font-semibold text-ink">{ONBOARDING_PURPOSES[key]}</span>
                    <span className="order-3 col-span-2 h-2.5 overflow-hidden rounded-full bg-page sm:order-none sm:col-span-1">
                      <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max((n / purposeMax) * 100, n ? 4 : 0)}%`, background: SHADES[Math.min(i, 4)] }} />
                    </span>
                    <span className="text-right text-xs font-bold tabular-nums text-ink">{n.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="xl:col-span-5">
          <Panel className="h-full">
            <PanelHead title="How people joined" sub={`${joined.toLocaleString()} accounts`} />
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Sign-in</p>
            <Split
              parts={[
                { name: "Phone + PIN", n: signups.phone, color: "#0B5D4B" },
                { name: "Email (older)", n: signups.password, color: "#F2A93B" },
              ]}
            />
            <p className="mb-2.5 mt-7 text-xs font-semibold uppercase tracking-wide text-muted">App language</p>
            <Split
              parts={[
                { name: "English", n: signups.languages.en, color: "#1FA07A" },
                { name: "Pidgin", n: signups.languages.pcm, color: "#08392F" },
              ]}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
