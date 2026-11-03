"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, label } from "@/lib/format";
import type { SupportRequestCategory, SupportRequestPriority, SupportRequestStatus, SupportRequestsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAlert, IconArrowUpRight, IconBook, IconBuilding, IconCheckCircle, IconChevronRight, IconClock, IconHeart, IconTransactions, IconUser, IconWallet } from "@/components/icons";
import { ago, agoText, Avatar, FilterChip, HeroCard, hoursSince, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs, type IconT } from "@/components/list-kit";

const CATEGORY: Record<SupportRequestCategory, { icon: IconT; dot: string }> = {
  transfer: { icon: IconArrowUpRight, dot: "#0B5D4B" },
  withdrawal: { icon: IconBuilding, dot: "#1D5FA8" },
  wallet: { icon: IconWallet, dot: "#1FA07A" },
  account: { icon: IconUser, dot: "#9B7FDB" },
  transaction: { icon: IconTransactions, dot: "#E08A3C" },
  other: { icon: IconBook, dot: "#6F8A7E" },
};
const CATEGORIES = Object.keys(CATEGORY) as SupportRequestCategory[];

const PRIORITY: Record<SupportRequestPriority, { word: string; bar: string; chip: string }> = {
  high: { word: "High", bar: "bg-danger", chip: "bg-danger/10 text-danger" },
  medium: { word: "Medium", bar: "bg-gold", chip: "bg-gold-soft text-warn" },
  low: { word: "Low", bar: "bg-line-strong/50", chip: "bg-page text-muted" },
};

const STATUS: Record<SupportRequestStatus, { word: string; dot: string; onDark: string }> = {
  pending: { word: "New", dot: "bg-gold", onDark: "#F2A93B" },
  in_review: { word: "In review", dot: "bg-info", onDark: "#9BB8F0" },
  resolved: { word: "Resolved", dot: "bg-brand", onDark: "#5FD3A5" },
  closed: { word: "Closed", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.35)" },
};
const STATUS_ORDER: SupportRequestStatus[] = ["pending", "in_review", "resolved", "closed"];

type Tab = "" | SupportRequestStatus;
type Prio = "" | SupportRequestPriority;

export default function SupportPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<Prio>("");
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
    queryKey: ["admin", "support-requests", { status, category, priority, search, page }],
    queryFn: () => api<SupportRequestsData>(`/api/v1/admin/support-requests${qs({ status, category, priority, search, page })}`),
    placeholderData: (prev) => prev,
  });
  const summary = data?.summary;
  const reset = () => setPage(1);
  const oldestH = hoursSince(summary?.oldest_open_at);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Care" title="Support" subtitle="What people asked the assistant to pass on to the team, newest first." />

      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconHeart}
            title="Open tickets"
            sub={summary.open ? `New or in review · ${summary.open_high.toLocaleString()} high priority` : "Inbox zero. Everyone has an answer."}
            value={summary.open.toLocaleString()}
            unit={summary.open === 1 ? "ticket" : "tickets"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Every ticket, by stage</p>
            <SplitBar
              empty="No tickets yet."
              parts={STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].word, value: summary.by_status[s] ?? 0, color: STATUS[s].onDark }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile icon={IconAlert} label="High priority" value={summary.open_high.toLocaleString()} hint={summary.open_high ? "Open and marked high" : "Nothing urgent open"} tone={summary.open_high ? "danger" : "muted"} />
            <KpiTile icon={IconCheckCircle} label="Resolved" value={summary.resolved_7d.toLocaleString()} hint="Resolved or closed in 7 days" tone="brand" />
            <KpiTile
              icon={IconClock}
              label="Oldest open"
              value={summary.oldest_open_at ? ago(summary.oldest_open_at) : "—"}
              hint={summary.oldest_open_at ? `Since ${formatDateTime(summary.oldest_open_at)}` : "Nothing waiting"}
              tone={!summary.oldest_open_at ? "muted" : oldestH < 24 ? "brand" : "gold"}
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by topic">
            <FilterChip active={category === ""} onClick={() => { setCategory(""); reset(); }} label="Every topic" />
            {CATEGORIES.map((c) => {
              const C = CATEGORY[c];
              return <FilterChip key={c} active={category === c} onClick={() => { setCategory(c); reset(); }} label={label(c)} icon={<C.icon className="h-3.5 w-3.5" />} dot={C.dot} />;
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
            <StatusTabs<Prio>
              label="Priority"
              value={priority}
              onChange={(v) => { setPriority(v); reset(); }}
              tabs={[
                { value: "", label: "Any priority" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search #id, subject or person" label="Search support requests" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} ticket{data.pagination.total === 1 ? "" : "s"}
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
        ) : data.support_requests.length === 0 ? (
          <EmptyState message="No tickets match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="py-3 pl-5 pr-3 font-semibold">Ticket</th>
                    <th className="px-3 py-3 font-semibold">From</th>
                    <th className="px-3 py-3 font-semibold">Topic</th>
                    <th className="px-3 py-3 font-semibold">Priority</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Raised</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.support_requests.map((r) => {
                    const P = PRIORITY[r.priority] ?? PRIORITY.low;
                    const S = STATUS[r.status] ?? STATUS.pending;
                    const C = CATEGORY[r.category] ?? CATEGORY.other;
                    const open = r.status === "pending" || r.status === "in_review";
                    return (
                      <tr key={r.id} onClick={() => router.push(`/support/${r.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="relative py-3.5 pl-5 pr-3">
                          <span className={cn("absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full", open ? P.bar : "bg-transparent")} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="flex max-w-[360px] items-center gap-2">
                              {r.status === "pending" ? <span className="h-2 w-2 shrink-0 rounded-full bg-gold" title="New" /> : null}
                              <span className={cn("truncate text-ink group-hover:text-brand", r.status === "pending" ? "font-extrabold" : "font-semibold")}>{r.subject}</span>
                            </p>
                            <p className="max-w-[360px] truncate text-xs text-muted">
                              <span className="font-mono">#{r.id}</span>
                              {r.reference ? <> · <span className="font-mono">{r.reference}</span></> : null} · {r.description_preview}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar size="sm" name={r.user?.name} seed={r.user?.id ?? r.id} />
                            <div className="min-w-0">
                              <p className="max-w-[160px] truncate font-semibold text-ink">{r.user?.name ?? "—"}</p>
                              <p className="max-w-[160px] truncate text-xs text-muted">{r.user?.email ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-page px-2.5 py-1 text-xs font-semibold text-ink">
                            <span style={{ color: C.dot }}>
                              <C.icon className="h-3.5 w-3.5" />
                            </span>
                            {label(r.category)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", P.chip)}>{P.word}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <p className="text-xs font-semibold text-ink">{agoText(r.created_at)}</p>
                          <p className="text-[11px] text-muted">{formatDateTime(r.created_at)}</p>
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
