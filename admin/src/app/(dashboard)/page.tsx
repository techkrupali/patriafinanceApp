"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { label, naira } from "@/lib/format";
import type { StatsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatCardSkeleton } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";

export default function DashboardPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api<StatsData>("/api/v1/admin/stats"),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Platform overview" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Platform overview" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isPending ? (
          Array.from({ length: 14 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total Users" value={data.users.total.toLocaleString()} />
            <StatCard
              label="Active Users"
              value={data.users.active.toLocaleString()}
              accent="green"
            />
            <StatCard label="New Users (7d)" value={data.users.new_7d.toLocaleString()} />
            <StatCard label="Total Wallets" value={data.wallets.total.toLocaleString()} />
            <StatCard
              label="Total Balance"
              value={naira(data.wallets.total_balance)}
              accent="green"
              hint="Across all wallets"
            />
            <StatCard
              label="Pending Approvals"
              value={data.approvals.pending.toLocaleString()}
              accent="amber"
              hint="Awaiting sign-off"
            />
            <StatCard
              label="Pending Transactions"
              value={data.transactions.pending.toLocaleString()}
              accent="amber"
            />
            <StatCard
              label="Failed Transactions"
              value={data.transactions.failed.toLocaleString()}
              accent="red"
            />
            <StatCard
              label="Active Loans"
              value={data.loans.active.toLocaleString()}
              accent="green"
            />
            <StatCard
              label="Pending Loans"
              value={data.loans.pending.toLocaleString()}
              accent="amber"
              hint="Awaiting approval"
            />
            <StatCard
              label="Loan Outstanding"
              value={naira(data.loans.outstanding)}
              hint="Unrecovered principal + interest"
            />
            <StatCard
              label="Active Projects"
              value={data.projects.active.toLocaleString()}
              accent="green"
            />
            <StatCard
              label="Escrow Held"
              value={naira(data.projects.escrow)}
              hint="Reserved across active projects"
            />
            <StatCard
              label="Pending KYC"
              value={data.kyc.pending.toLocaleString()}
              accent="amber"
              hint="Awaiting review"
            />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Wallets by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <ul className="space-y-3">
                {Object.entries(data.wallets.by_type).length === 0 ? (
                  <li className="text-sm text-muted">No wallets yet</li>
                ) : (
                  Object.entries(data.wallets.by_type).map(([type, count]) => {
                    const pct =
                      data.wallets.total > 0
                        ? Math.round((count / data.wallets.total) * 100)
                        : 0;
                    return (
                      <li key={type}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-ink">{label(type)}</span>
                          <span className="text-muted">
                            {count.toLocaleString()} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-lavender/40">
                          <div
                            className="h-2 rounded-full bg-brand"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volume In (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              <>
                <p className="text-3xl font-bold text-brand">
                  {naira(data.transactions.volume_in_30d)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Successful credits in the last 30 days
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volume Out (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              <>
                <p className="text-3xl font-bold text-ink">
                  {naira(data.transactions.volume_out_30d)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Successful debits in the last 30 days
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
