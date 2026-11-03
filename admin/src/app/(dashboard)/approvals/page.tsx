"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { approvalActionLabel, formatDate, label, naira } from "@/lib/format";
import type { ApprovalStatus, ApprovalsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconAlert, IconApprovals, IconArrowUpRight, IconBuilding, IconCheckCircle, IconChevronRight, IconClock, IconLock, IconProjects, IconSliders, IconTransactions, IconUser } from "@/components/icons";
import { agoText, Avatar, FilterChip, HeroCard, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs, until, Yeses, type IconT } from "@/components/list-kit";

/** Money moves, project payouts and the wallet's own rules (ApprovalService::GOVERNANCE_ACTIONS). */
const ACTION: Record<string, { icon: IconT; tile: string; dot: string }> = {
  withdrawal: { icon: IconBuilding, tile: "bg-info-soft text-info", dot: "#1D5FA8" },
  transfer_bank: { icon: IconArrowUpRight, tile: "bg-gold-soft text-warn", dot: "#F2A93B" },
  transfer_wallet: { icon: IconTransactions, tile: "bg-brand-soft text-brand", dot: "#0B5D4B" },
  transfer_user: { icon: IconUser, tile: "bg-[#E6F7EF] text-[#14725C]", dot: "#1FA07A" },
  milestone_release: { icon: IconProjects, tile: "bg-[#08392F] text-[#5FD3A5]", dot: "#08392F" },
  rule_change: { icon: IconSliders, tile: "bg-[#F3EEFB] text-[#6B4BB0]", dot: "#9B7FDB" },
  unlock_wallet: { icon: IconLock, tile: "bg-[#FDF1E2] text-[#B5651D]", dot: "#E08A3C" },
  close_wallet: { icon: IconLock, tile: "bg-page text-muted", dot: "#6F8A7E" },
};
const actionStyle = (a: string) => ACTION[a] ?? ACTION.transfer_wallet;

const STATUS: Record<ApprovalStatus, { word: string; dot: string; onDark: string }> = {
  pending: { word: "Waiting", dot: "bg-gold", onDark: "#F2A93B" },
  approved: { word: "Approved", dot: "bg-brand", onDark: "#5FD3A5" },
  executed: { word: "Done", dot: "bg-[#1FA07A]", onDark: "#B9F0D8" },
  rejected: { word: "Rejected", dot: "bg-danger", onDark: "#E7836F" },
  failed: { word: "Failed", dot: "bg-danger", onDark: "#F28B5B" },
  expired: { word: "Expired", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.35)" },
  cancelled: { word: "Cancelled", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.22)" },
};
const STATUS_ORDER: ApprovalStatus[] = ["pending", "approved", "executed", "rejected", "failed", "expired", "cancelled"];

type Tab = "" | ApprovalStatus;

export default function ApprovalsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("");
  const [action, setAction] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["admin", "approvals", { status, action, search, page }],
    queryFn: () => api<ApprovalsData>(`/api/v1/admin/approvals${qs({ status, action, search, page })}`),
    placeholderData: (prev) => prev,
  });
  const summary = data?.summary;
  const reset = () => setPage(1);
  const actions = Object.entries(summary?.by_action ?? {}).map(([a, n]) => [a, Number(n)] as [string, number]);
  const notThrough = summary ? summary.by_status.rejected + summary.by_status.failed + summary.by_status.expired : 0;

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Governance" title="Approvals" subtitle="Money that needs more than one yes on a shared wallet, and how each request went." />

      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconApprovals}
            title="Waiting for sign-off"
            sub={summary.pending_all ? `${compactNaira(Number(summary.pending_amount))} waiting to move` : "Nothing waiting for a yes"}
            value={summary.pending_all.toLocaleString()}
            unit={summary.pending_all === 1 ? "request" : "requests"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Every request, by outcome</p>
            <SplitBar
              empty="No approval requests yet."
              parts={STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].word, value: summary.by_status[s] ?? 0, color: STATUS[s].onDark }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile
              icon={IconCheckCircle}
              label="Done"
              value={summary.executed_30d.toLocaleString()}
              hint={Number(summary.executed_30d_amount) ? `${compactNaira(Number(summary.executed_30d_amount))} moved in 30 days` : "None in the last 30 days"}
              tone="brand"
            />
            <KpiTile icon={IconClock} label="Expiring soon" value={summary.expiring_24h.toLocaleString()} hint={summary.expiring_24h ? "Run out within a day" : "Nothing about to run out"} tone={summary.expiring_24h ? "gold" : "muted"} />
            <KpiTile icon={IconAlert} label="Didn't go through" value={notThrough.toLocaleString()} hint="Rejected, failed or expired" tone={notThrough ? "danger" : "muted"} />
          </div>
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Skeleton className="h-[210px] rounded-[22px] lg:col-span-2" />
          <Skeleton className="h-[210px] rounded-[22px]" />
          <Skeleton className="h-[210px] rounded-[22px]" />
          <Skeleton className="h-[210px] rounded-[22px]" />
        </div>
      ) : null}

      <div className={PANEL}>
        <div className="space-y-4 border-b border-line px-5 py-5">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by kind of payment">
            <FilterChip active={action === ""} onClick={() => { setAction(""); reset(); }} label="Every kind" />
            {actions.map(([a, count]) => {
              const A = actionStyle(a);
              return <FilterChip key={a} active={action === a} onClick={() => { setAction(a); reset(); }} label={approvalActionLabel(a)} count={count} icon={<A.icon className="h-3.5 w-3.5" />} dot={A.dot} />;
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                { value: "", label: "All", count: summary?.all },
                ...STATUS_ORDER.map((s) => ({ value: s as Tab, label: STATUS[s].word, count: summary?.by_status[s], alert: s === "pending" })),
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search wallet, person or #id" label="Search approval requests" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} request{data.pagination.total === 1 ? "" : "s"}
              {isFetching ? " · updating…" : ""}
            </p>
          ) : null}
        </div>

        {isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.approvals.length === 0 ? (
          <EmptyState message="No approval requests match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Request</th>
                    <th className="px-3 py-3 font-semibold">Wallet</th>
                    <th className="px-3 py-3 font-semibold">Asked by</th>
                    <th className="px-3 py-3 text-right font-semibold">Amount</th>
                    <th className="px-3 py-3 font-semibold">Sign-off</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Asked</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.approvals.map((a) => {
                    const A = actionStyle(a.action);
                    const S = STATUS[a.status] ?? STATUS.pending;
                    const left = a.status === "pending" ? until(a.expires_at) : null;
                    return (
                      <tr key={a.id} onClick={() => router.push(`/approvals/${a.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", A.tile)}>
                              <A.icon className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[190px] truncate font-bold text-ink group-hover:text-brand">{approvalActionLabel(a.action)}</p>
                              <p className="max-w-[190px] truncate text-xs text-muted">
                                <span className="font-mono">#{a.id}</span>
                                {a.description ? ` · ${a.description}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="max-w-[150px] truncate font-semibold text-ink">{a.wallet?.name ?? "—"}</p>
                          {a.wallet?.type ? <p className="text-xs text-muted">{label(a.wallet.type)} wallet</p> : null}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar size="sm" name={a.initiator?.name} seed={a.initiator?.id ?? a.id} />
                            <div className="min-w-0">
                              <p className="max-w-[130px] truncate font-semibold text-ink">{a.initiator?.name ?? "—"}</p>
                              <p className="max-w-[130px] truncate text-xs text-muted">{a.initiator?.email ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <p className="whitespace-nowrap font-extrabold tabular-nums text-ink">{naira(a.amount)}</p>
                          {Number(a.fee) > 0 ? <p className="text-[11px] text-muted">+{naira(a.fee)} fee</p> : null}
                        </td>
                        <td className="px-3 py-3.5">
                          <Yeses got={a.approvals_count} need={a.required_approvals} word="yes" />
                          {left ? (
                            <p className={cn("mt-1 text-[11px] font-semibold", left === "passed" ? "text-danger" : "text-warn")}>
                              {left === "passed" ? "Time ran out" : `Expires ${left}`}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <p className="text-xs font-semibold text-ink">{formatDate(a.created_at)}</p>
                          <p className="text-[11px] text-muted">{agoText(a.created_at)}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <IconChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line">
              <Pagination meta={data.pagination} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
