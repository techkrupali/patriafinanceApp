"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { label, naira } from "@/lib/format";
import type { StatsData } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatCardSkeleton } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import {
  IconApprovals,
  IconArrowUpRight,
  IconCheckCircle,
  IconClock,
  IconKyc,
  IconLoans,
  IconTransactions,
  IconTrendDown,
  IconTrendUp,
} from "@/components/icons";

type Tone = "amber" | "blue" | "red";

const ATTENTION_TONES: Record<
  Tone,
  { card: string; icon: string; count: string; hint: string }
> = {
  amber: {
    card: "border-amber-200 bg-amber-50 hover:border-amber-300",
    icon: "bg-amber-100 text-amber-700",
    count: "text-amber-900",
    hint: "text-amber-700/80",
  },
  blue: {
    card: "border-lavender bg-lavender/25 hover:border-brand/30",
    icon: "bg-white text-navy",
    count: "text-navy",
    hint: "text-navy/70",
  },
  red: {
    card: "border-danger/25 bg-danger/5 hover:border-danger/40",
    icon: "bg-danger/10 text-danger",
    count: "text-danger",
    hint: "text-danger/70",
  },
};

function SectionHeading({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {meta ? <span className="text-xs text-muted">{meta}</span> : null}
    </div>
  );
}

function AttentionCard({
  icon: Icon,
  title,
  count,
  hint,
  href,
  tone,
}: {
  icon: (props: { className?: string }) => React.ReactNode;
  title: string;
  count: number;
  hint: string;
  href: string;
  tone: Tone;
}) {
  const t = ATTENTION_TONES[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
        t.card,
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          t.icon,
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-2xl font-bold leading-none tabular-nums", t.count)}>
          {count.toLocaleString()}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">{title}</p>
        <p className={cn("truncate text-xs", t.hint)}>{hint}</p>
      </div>
      <IconArrowUpRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

function FlowBar({
  title,
  value,
  pct,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string;
  pct: number;
  tone: "brand" | "navy";
  icon: (props: { className?: string }) => React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-ink">
          <Icon className={cn("h-4 w-4", tone === "brand" ? "text-brand" : "text-navy")} />
          {title}
        </span>
        <span className="font-semibold tabular-nums text-ink">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-lavender/40">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "brand" ? "bg-brand" : "bg-navy",
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
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
  const title = firstName ? `Welcome back, ${firstName}` : "Dashboard";

  if (isError) {
    return (
      <>
        <PageHeader title={title} subtitle="Platform overview" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  if (isPending) {
    return (
      <>
        <PageHeader title={title} subtitle="Here's what's happening across Patriai today." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <SectionHeading title="Money" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <SectionHeading title="People" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </>
    );
  }

  const attention = [
    {
      icon: IconApprovals,
      title: "Pending approvals",
      count: data.approvals.pending,
      hint: "Awaiting sign-off",
      href: "/approvals",
      tone: "amber" as Tone,
    },
    {
      icon: IconLoans,
      title: "Loan requests",
      count: data.loans.pending,
      hint: "Awaiting approval",
      href: "/loans",
      tone: "amber" as Tone,
    },
    {
      icon: IconKyc,
      title: "KYC reviews",
      count: data.kyc.pending,
      hint: "Awaiting review",
      href: "/kyc",
      tone: "amber" as Tone,
    },
    {
      icon: IconClock,
      title: "Pending transactions",
      count: data.transactions.pending,
      hint: "Still in flight",
      href: "/transactions",
      tone: "blue" as Tone,
    },
    {
      icon: IconTransactions,
      title: "Failed transactions",
      count: data.transactions.failed,
      hint: "Need investigation",
      href: "/transactions",
      tone: "red" as Tone,
    },
  ].filter((a) => a.count > 0);

  const inV = Number(data.transactions.volume_in_30d ?? 0);
  const outV = Number(data.transactions.volume_out_30d ?? 0);
  const flowMax = Math.max(inV, outV, 1);
  const walletTotal = data.wallets.total;
  const byType = Object.entries(data.wallets.by_type);

  return (
    <>
      <PageHeader
        title={title}
        subtitle="Here's what's happening across Patriai today."
      />

      {/* Needs attention */}
      <SectionHeading title="Needs attention" />
      {attention.length === 0 ? (
        <Card className="flex items-center gap-4 px-5 py-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <IconCheckCircle className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">You&apos;re all caught up</p>
            <p className="text-sm text-muted">
              No pending approvals, KYC reviews, loan requests or failed
              transactions right now.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {attention.map((a) => (
            <AttentionCard key={a.title} {...a} />
          ))}
        </div>
      )}

      {/* Money */}
      <SectionHeading title="Money" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Total Balance"
          value={naira(data.wallets.total_balance)}
          accent="green"
          hint="Across all wallets"
        />
        <StatCard
          label="Inflow (30d)"
          value={naira(data.transactions.volume_in_30d)}
          accent="green"
          hint="Successful credits"
        />
        <StatCard
          label="Outflow (30d)"
          value={naira(data.transactions.volume_out_30d)}
          hint="Successful debits"
        />
        <StatCard
          label="Loan Outstanding"
          value={naira(data.loans.outstanding)}
          hint="Principal + interest"
        />
        <StatCard
          label="Escrow Held"
          value={naira(data.projects.escrow)}
          hint="Across active projects"
        />
      </div>

      {/* People */}
      <SectionHeading title="People" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Users" value={data.users.total.toLocaleString()} />
        <StatCard
          label="Active Users"
          value={data.users.active.toLocaleString()}
          accent="green"
        />
        <StatCard
          label="New This Week"
          value={data.users.new_7d.toLocaleString()}
          hint="Signed up in the last 7 days"
        />
      </div>

      {/* Portfolio */}
      <SectionHeading title="Portfolio" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Wallets" value={walletTotal.toLocaleString()} />
        <StatCard
          label="Active Loans"
          value={data.loans.active.toLocaleString()}
          accent="green"
        />
        <StatCard
          label="Active Projects"
          value={data.projects.active.toLocaleString()}
          accent="green"
        />
      </div>

      {/* Activity */}
      <SectionHeading title="Activity" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Transactions"
          value={data.transactions.total.toLocaleString()}
        />
        <StatCard
          label="Pending"
          value={data.transactions.pending.toLocaleString()}
          accent="amber"
        />
        <StatCard
          label="Failed"
          value={data.transactions.failed.toLocaleString()}
          accent="red"
        />
      </div>

      {/* Visualizations */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wallets by Type</CardTitle>
            <span className="text-xs text-muted">
              {walletTotal.toLocaleString()} total
            </span>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <p className="text-sm text-muted">No wallets yet.</p>
            ) : (
              <ul className="space-y-4">
                {byType.map(([type, count]) => {
                  const pct =
                    walletTotal > 0
                      ? Math.round((count / walletTotal) * 100)
                      : 0;
                  return (
                    <li key={type}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-ink">{label(type)}</span>
                        <span className="tabular-nums text-muted">
                          {count.toLocaleString()} · {pct}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-lavender/40">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>30-Day Flow</CardTitle>
            <span className="text-xs text-muted">Successful volume</span>
          </CardHeader>
          <CardContent className="space-y-5">
            <FlowBar
              title="Inflow"
              value={naira(data.transactions.volume_in_30d)}
              pct={(inV / flowMax) * 100}
              tone="brand"
              icon={IconTrendUp}
            />
            <FlowBar
              title="Outflow"
              value={naira(data.transactions.volume_out_30d)}
              pct={(outV / flowMax) * 100}
              tone="navy"
              icon={IconTrendDown}
            />
            <div className="border-t border-line pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted">Net 30-day flow</span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    inV - outV >= 0 ? "text-brand" : "text-danger",
                  )}
                >
                  {inV - outV >= 0 ? "+" : "−"}
                  {naira(Math.abs(inV - outV))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
