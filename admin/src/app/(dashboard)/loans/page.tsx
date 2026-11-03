"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, loanCategoryLabel, naira } from "@/lib/format";
import type { LoanStatus, LoansData, RunDueResult } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconAlert, IconCheckCircle, IconChevronRight, IconClock, IconLoans, IconTrendUp } from "@/components/icons";
import { agoText, Avatar, FilterChip, HeroCard, hoursSince, KpiTile, PageTitle, PANEL, Progress, SearchBox, SplitBar, StatusDot, StatusTabs } from "@/components/list-kit";

/** Loan purposes and their colours (on white, and lifted on the dark card). */
const CATEGORY: Record<string, { dot: string; onDark: string }> = {
  rent: { dot: "#0B5D4B", onDark: "#5FD3A5" },
  mortgage: { dot: "#1FA07A", onDark: "#B9F0D8" },
  car: { dot: "#1D5FA8", onDark: "#9BB8F0" },
  school_fees: { dot: "#F2A93B", onDark: "#F2A93B" },
  family_emergency: { dot: "#B3311A", onDark: "#E7836F" },
  business: { dot: "#9B7FDB", onDark: "#C9B6F2" },
  feeding: { dot: "#E08A3C", onDark: "#F5B97A" },
  child_allowance: { dot: "#D9B23A", onDark: "#F0D58A" },
  short_term: { dot: "#6F8A7E", onDark: "rgba(243,247,244,0.45)" },
};
const CATEGORIES = Object.keys(CATEGORY);

const STATUS: Record<LoanStatus, { word: string; dot: string }> = {
  pending: { word: "Waiting", dot: "bg-gold" },
  approved: { word: "Approved", dot: "bg-info" },
  disbursed: { word: "Paid out", dot: "bg-[#1FA07A]" },
  active: { word: "Repaying", dot: "bg-brand" },
  repaid: { word: "Repaid", dot: "bg-[#5FD3A5]" },
  defaulted: { word: "Defaulted", dot: "bg-danger" },
  rejected: { word: "Rejected", dot: "bg-line-strong" },
  cancelled: { word: "Cancelled", dot: "bg-line-strong" },
};
const STATUS_ORDER: LoanStatus[] = ["pending", "approved", "disbursed", "active", "repaid", "defaulted", "rejected", "cancelled"];
const LIVE: LoanStatus[] = ["disbursed", "active", "defaulted"];

type Tab = "" | LoanStatus;

export default function LoansPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Tab>("");
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["admin", "loans", { status, category, search, page }],
    queryFn: () => api<LoansData>(`/api/v1/admin/loans${qs({ status, category, search, page })}`),
    placeholderData: (prev) => prev,
  });

  const runDue = useMutation({
    mutationFn: () => api<RunDueResult>("/api/v1/admin/loans/run-due", { method: "POST" }),
    onSuccess: (res) => {
      setToast({
        tone: "green",
        message: `${res.loans_processed} loan${res.loans_processed === 1 ? "" : "s"} processed · ${res.loans_penalized} penalised · ${naira(res.penalty_charged)} charged`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "loans"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (err: Error) => setToast({ tone: "red", message: err.message }),
  });

  const summary = data?.summary;
  const owedBy = Object.entries(summary?.by_category ?? {})
    .map(([c, v]) => ({ c, v: Number(v) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Credit" title="Loans" subtitle="Who borrowed, what for, how much is left to pay and when it's due.">
        <button
          type="button"
          onClick={() => runDue.mutate()}
          disabled={runDue.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-bold text-ink shadow-sm transition-colors hover:border-brand/40 hover:bg-rowhover disabled:opacity-60"
        >
          <IconClock className="h-4 w-4 text-brand" />
          {runDue.isPending ? "Running…" : "Run due repayments"}
        </button>
      </PageTitle>

      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconLoans}
            title="Still owed to Patriai"
            sub={`${summary.live.toLocaleString()} loan${summary.live === 1 ? "" : "s"} out · ${summary.waiting.toLocaleString()} application${summary.waiting === 1 ? "" : "s"} waiting`}
            money={Number(summary.outstanding)}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Owed, by purpose</p>
            <SplitBar
              empty="Nothing owed right now."
              parts={owedBy.map((r) => ({ key: r.c, label: loanCategoryLabel(r.c), value: r.v, color: CATEGORY[r.c]?.onDark ?? "#B9F0D8", hint: compactNaira(r.v) }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile
              icon={IconTrendUp}
              label="Lent"
              value={summary.lent_30d.toLocaleString()}
              hint={Number(summary.lent_30d_amount) ? `${compactNaira(Number(summary.lent_30d_amount))} paid out in 30 days` : "None in the last 30 days"}
              tone="brand"
            />
            <KpiTile icon={IconCheckCircle} label="Repaid" value={summary.repaid.toLocaleString()} hint="Paid back in full" tone="gold" />
            <KpiTile
              icon={IconAlert}
              label="Defaulted"
              value={summary.defaulted.toLocaleString()}
              hint={summary.defaulted ? `${compactNaira(Number(summary.defaulted_amount))} still owed` : "No one has defaulted"}
              tone={summary.defaulted ? "danger" : "muted"}
            />
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by purpose">
            <FilterChip active={category === ""} onClick={() => { setCategory(""); reset(); }} label="Every purpose" />
            {CATEGORIES.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => { setCategory(c); reset(); }} label={loanCategoryLabel(c)} dot={CATEGORY[c].dot} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                { value: "", label: "All", count: summary?.all },
                ...STATUS_ORDER.map((s) => ({ value: s as Tab, label: STATUS[s].word, count: summary?.by_status[s], alert: s === "pending" || s === "defaulted" })),
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search reference, borrower or email" label="Search loans" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} loan{data.pagination.total === 1 ? "" : "s"}
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
        ) : data.loans.length === 0 ? (
          <EmptyState message="No loans match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Borrower</th>
                    <th className="px-3 py-3 font-semibold">Purpose</th>
                    <th className="px-3 py-3 text-right font-semibold">Borrowed</th>
                    <th className="w-48 px-3 py-3 font-semibold">Paid back</th>
                    <th className="px-3 py-3 font-semibold">Due</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.loans.map((l) => {
                    const S = STATUS[l.status] ?? STATUS.pending;
                    const total = Number(l.total_repayable);
                    const left = Number(l.outstanding);
                    const paidPct = total ? ((total - left) / total) * 100 : 0;
                    const live = LIVE.includes(l.status);
                    const late = live && hoursSince(l.due_at) > 0;
                    return (
                      <tr key={l.id} onClick={() => router.push(`/loans/${l.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={l.user?.name} seed={l.user?.id ?? l.id} />
                            <div className="min-w-0">
                              <p className="max-w-[210px] truncate font-bold text-ink group-hover:text-brand">{l.user?.name ?? "—"}</p>
                              <p className="max-w-[210px] truncate font-mono text-xs text-muted">{l.reference}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-page px-2.5 py-1 text-xs font-semibold text-ink">
                            <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY[l.category]?.dot ?? "#6F8A7E" }} />
                            {loanCategoryLabel(l.category)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <p className="whitespace-nowrap font-extrabold tabular-nums text-ink">{naira(l.principal)}</p>
                          <p className="text-[11px] text-muted">{l.tenor_days ? `${l.tenor_days} days · ` : ""}{naira(l.total_repayable)} to repay</p>
                        </td>
                        <td className="px-3 py-3.5">
                          {live || l.status === "repaid" ? (
                            <>
                              <Progress pct={l.status === "repaid" ? 100 : paidPct} tone={l.status === "defaulted" ? "bg-danger" : "bg-brand"} />
                              <p className="mt-1 text-[11px] text-muted">
                                {l.status === "repaid" ? "All paid" : <><span className="font-semibold text-ink">{naira(l.outstanding)}</span> left</>}
                              </p>
                              {Number(l.penalty_accrued) > 0 ? <p className="text-[11px] font-semibold text-danger">+{naira(l.penalty_accrued)} penalty</p> : null}
                            </>
                          ) : (
                            <span className="text-xs text-muted">Not paid out</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          {l.due_at ? (
                            <>
                              <p className={cn("text-xs font-semibold", late ? "text-danger" : "text-ink")}>{formatDate(l.due_at)}</p>
                              <p className={cn("text-[11px]", late ? "font-semibold text-danger" : "text-muted")}>{late ? "Overdue" : live ? "Due date" : l.status === "repaid" ? "Was due" : "Due"}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-semibold text-ink">{formatDate(l.created_at)}</p>
                              <p className="text-[11px] text-muted">Applied {agoText(l.created_at)}</p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
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

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
