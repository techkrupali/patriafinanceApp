"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, formatDeadline, naira } from "@/lib/format";
import type { DisputeRow, DisputeStatus, DisputesData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconAlert, IconArrowDownLeft, IconArrowUpRight, IconCheckCircle, IconChevronRight, IconLock, IconProjects, IconScale } from "@/components/icons";
import { Avatar, FilterChip, HeroCard, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs, type IconT } from "@/components/list-kit";

const KIND: Record<DisputeRow["kind"], { icon: IconT; tile: string; dot: string; word: string; one: string }> = {
  milestone: { icon: IconProjects, tile: "bg-[#08392F] text-[#5FD3A5]", dot: "#0B5D4B", word: "Project milestones", one: "Project milestone" },
  payment_made: { icon: IconArrowUpRight, tile: "bg-gold-soft text-warn", dot: "#F2A93B", word: "Payments made", one: "Payment made" },
  payment_received: { icon: IconArrowDownLeft, tile: "bg-info-soft text-info", dot: "#1D5FA8", word: "Payments received", one: "Payment received" },
  other: { icon: IconScale, tile: "bg-page text-muted", dot: "#6F8A7E", word: "Other", one: "Other" },
};
const KINDS: DisputeRow["kind"][] = ["milestone", "payment_made", "payment_received"];

const STATUS: Record<DisputeStatus, { word: string; dot: string; onDark: string }> = {
  escalated: { word: "With Patriai", dot: "bg-gold", onDark: "#F2A93B" },
  under_review: { word: "Case officer", dot: "bg-info", onDark: "#9BB8F0" },
  open: { word: "Just opened", dot: "bg-[#9B7FDB]", onDark: "#C9B6F2" },
  responded: { word: "Builder replied", dot: "bg-[#1D8FA8]", onDark: "#8FD3E0" },
  fixing: { word: "Being fixed", dot: "bg-[#E08A3C]", onDark: "#F5B97A" },
  agreed: { word: "Refund agreed", dot: "bg-[#1FA07A]", onDark: "#B9F0D8" },
  resolved: { word: "Resolved", dot: "bg-brand", onDark: "#5FD3A5" },
  rejected: { word: "Not upheld", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.35)" },
};
const ACTIVE: DisputeStatus[] = ["escalated", "under_review", "open", "responded", "fixing", "agreed"];

/** A payment dispute goes straight to Patriai; only a milestone one waits for the builder first. */
function statusOf(d: DisputeRow) {
  if (d.status === "open") return d.kind === "milestone" ? { word: "With the builder", dot: "bg-[#9B7FDB]" } : { word: "With Patriai", dot: "bg-gold" };
  return STATUS[d.status] ?? STATUS.open;
}
const CLOSED: DisputeStatus[] = ["resolved", "rejected"];

type Tab = "" | "active" | DisputeStatus;

/** The date that matters now: Patriai's decision, the builder's reply, or when it closed. */
function Deadline({ d }: { d: DisputeRow }) {
  const withPatriai = d.status === "escalated" || d.status === "under_review" || (d.status === "open" && d.kind !== "milestone");
  if (withPatriai) {
    if (!d.decision_due) {
      return (
        <>
          <p className="text-xs font-semibold text-ink">No date yet</p>
          <p className="text-[11px] text-muted">Patriai decides</p>
        </>
      );
    }
    return (
      <>
        <p className={cn("text-xs font-semibold", d.overdue ? "text-danger" : "text-ink")}>{formatDeadline(d.decision_due)}</p>
        {d.overdue ? (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
            <IconAlert className="h-3 w-3" />
            Overdue
          </span>
        ) : (
          <p className="text-[11px] text-muted">Decide by</p>
        )}
      </>
    );
  }
  if (d.status === "open") {
    return (
      <>
        <p className="text-xs font-semibold text-ink">{formatDeadline(d.reply_by)}</p>
        <p className="text-[11px] text-muted">Builder replies by</p>
      </>
    );
  }
  return (
    <>
      <p className="text-xs font-semibold text-ink">{formatDate(d.resolved_at ?? d.created_at)}</p>
      <p className="text-[11px] text-muted">{d.resolved_at ? "Closed" : "Opened"}</p>
    </>
  );
}

export default function DisputesPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("active");
  const [kind, setKind] = useState("");
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
    queryKey: ["admin", "disputes", { status, kind, search, page }],
    queryFn: () => api<DisputesData>(`/api/v1/admin/disputes${qs({ status, kind, search, page })}`),
    placeholderData: (prev) => prev,
  });
  const summary = data?.summary;
  const counts = data?.counts;
  const c = (s: DisputeStatus) => Number(counts?.[s] ?? 0);
  const decision = data?.waiting?.decision ?? c("escalated");
  const builder = data?.waiting?.builder ?? c("open");
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Fairness" title="Disputes" subtitle="When a family and a builder, or a payer and payee, disagree: what's on hold and who decides next." />

      {data && summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconScale}
            title="Waiting for Patriai's decision"
            sub={`${builder.toLocaleString()} waiting for the builder · ${summary.active.toLocaleString()} not closed`}
            value={decision.toLocaleString()}
            unit={decision === 1 ? "dispute" : "disputes"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Not closed, by who&apos;s next</p>
            <SplitBar
              empty="No open disputes. All quiet."
              parts={[
                { key: "decide", label: "Patriai to decide", value: decision, color: "#F2A93B" },
                { key: "builder", label: "Builder to reply", value: builder, color: "#C9B6F2" },
                ...(["responded", "fixing", "agreed"] as DisputeStatus[]).map((s) => ({ key: s, label: STATUS[s].word, value: c(s), color: STATUS[s].onDark })),
              ]}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile icon={IconLock} label="On hold" value={compactNaira(Number(summary.on_hold))} hint="Paused by open disputes" tone="gold" />
            <KpiTile icon={IconAlert} label="Overdue" value={summary.overdue.toLocaleString()} hint={summary.overdue ? "Past the decision date" : "Every decision on time"} tone={summary.overdue ? "danger" : "muted"} />
            <KpiTile icon={IconCheckCircle} label="Closed" value={summary.closed_30d.toLocaleString()} hint="Decided in the last 30 days" tone="brand" />
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by kind">
            <FilterChip active={kind === ""} onClick={() => { setKind(""); reset(); }} label="Milestones and payments" />
            {KINDS.map((k) => {
              const K = KIND[k];
              return <FilterChip key={k} active={kind === k} onClick={() => { setKind(k); reset(); }} label={K.word} icon={<K.icon className="h-3.5 w-3.5" />} dot={K.dot} />;
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                { value: "active", label: "Not closed", count: summary?.active },
                ...ACTIVE.map((s) => ({ value: s as Tab, label: STATUS[s].word, count: counts ? c(s) : undefined, alert: s === "escalated" })),
                ...CLOSED.map((s) => ({ value: s as Tab, label: STATUS[s].word, count: counts ? c(s) : undefined })),
                { value: "" as Tab, label: "All", count: summary?.all },
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search subject, DSP number, project or person" label="Search disputes" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} dispute{data.pagination.total === 1 ? "" : "s"} · nearest decision first
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
        ) : data.disputes.length === 0 ? (
          <EmptyState message={status === "active" && !search && !kind ? "No open disputes. All quiet." : "No disputes match your filters."} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Dispute</th>
                    <th className="px-3 py-3 font-semibold">Raised by</th>
                    <th className="px-3 py-3 font-semibold">Against</th>
                    <th className="px-3 py-3 text-right font-semibold">On hold</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Next date</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.disputes.map((d) => {
                    const K = KIND[d.kind] ?? KIND.other;
                    const S = statusOf(d);
                    return (
                      <tr key={d.id} onClick={() => router.push(`/disputes/${d.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", K.tile)}>
                              <K.icon className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[260px] truncate font-bold text-ink group-hover:text-brand">{d.subject}</p>
                              <p className="max-w-[260px] truncate text-xs text-muted">
                                <span className="font-mono">{d.number ?? `#${d.id}`}</span>
                                {d.project ? ` · ${d.project.title}` : ""}
                                {d.milestone ? ` · ${d.milestone.title}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" name={d.raised_by_name} />
                            <p className="max-w-[140px] truncate font-semibold text-ink">{d.raised_by_name ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="max-w-[160px] truncate font-semibold text-ink">{d.against ?? "Patriai"}</p>
                          <p className="text-[11px] text-muted">{K.one}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right">
                          {Number(d.amount_on_hold) > 0 && d.active ? (
                            <span className="inline-flex items-center gap-1 font-extrabold tabular-nums text-ink">
                              <IconLock className="h-3.5 w-3.5 text-warn" />
                              {naira(d.amount_on_hold!)}
                            </span>
                          ) : Number(d.amount_on_hold) > 0 ? (
                            <>
                              <p className="font-semibold tabular-nums text-muted">{naira(d.amount_on_hold!)}</p>
                              <p className="text-[11px] text-muted">Was on hold</p>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
                          <p className="mt-0.5 max-w-[190px] truncate text-[11px] text-muted">
                            {d.status_label}
                            {d.officer ? ` · ${d.officer}` : ""}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Deadline d={d} />
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
