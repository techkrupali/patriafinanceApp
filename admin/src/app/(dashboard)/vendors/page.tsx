"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, label } from "@/lib/format";
import type { CheckStatus, VendorCheck, VendorStatus, VendorsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAlert, IconBuilding, IconCheckCircle, IconChevronRight, IconProjects, IconStore } from "@/components/icons";
import { ago, agoText, Avatar, FilterChip, HeroCard, initials, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs } from "@/components/list-kit";

const STATUS: Record<VendorStatus, { word: string; dot: string; onDark: string }> = {
  submitted: { word: "Waiting for a check", dot: "bg-gold", onDark: "#F2A93B" },
  needs_changes: { word: "Sent back", dot: "bg-[#E0702A]", onDark: "#F28B5B" },
  verified: { word: "Verified", dot: "bg-brand", onDark: "#5FD3A5" },
  draft: { word: "Not submitted", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.35)" },
};
const STATUS_ORDER: VendorStatus[] = ["submitted", "needs_changes", "verified", "draft"];

/** The checks in the order the app asks for them. */
const CHECKS: VendorCheck[] = ["owner", "id_document", "cac", "directors", "address", "bank"];
const CHECK_COLOR: Record<CheckStatus, string> = { approved: "bg-brand", pending: "bg-gold", redo: "bg-danger", waiting: "bg-info", todo: "bg-line" };
const CHECK_NAME: Record<VendorCheck, string> = { owner: "Owner", id_document: "ID", cac: "CAC", directors: "Directors", address: "Address", bank: "Bank" };

const TRADE_TINTS = ["bg-[#08392F] text-[#5FD3A5]", "bg-brand-soft text-brand", "bg-gold-soft text-warn", "bg-info-soft text-info", "bg-[#F3EEFB] text-[#6B4BB0]"];

type Tab = "" | VendorStatus;

export default function VendorsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("");
  const [category, setCategory] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["admin", "vendors", { status, category, q, page }],
    queryFn: () => api<VendorsData>(`/api/v1/admin/vendors${qs({ status, category, q, page })}`),
    placeholderData: (prev) => prev,
  });
  const counts = data?.counts;
  const summary = data?.summary;
  const trades = Object.entries(summary?.by_category ?? {}).map(([c, n]) => [c, Number(n)] as [string, number]);
  const n = (s: VendorStatus) => Number(counts?.[s] ?? 0);
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Builders" title="Vendors" subtitle="Businesses families pay by milestone: their checks, their work and who's still waiting." />

      {data && summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconStore}
            title="Waiting for a check"
            sub={summary.oldest_waiting_at ? `The oldest has waited ${ago(summary.oldest_waiting_at)}` : "No business is waiting"}
            value={n("submitted").toLocaleString()}
            unit={n("submitted") === 1 ? "business" : "businesses"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Every business, by stage</p>
            <SplitBar empty="No businesses yet." parts={STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].word, value: n(s), color: STATUS[s].onDark }))} />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile icon={IconCheckCircle} label="Verified" value={n("verified").toLocaleString()} hint={summary.verified_30d ? `+${summary.verified_30d} in the last 30 days` : "None new in 30 days"} tone="brand" />
            <KpiTile icon={IconAlert} label="Sent back" value={n("needs_changes").toLocaleString()} hint={n("needs_changes") ? "Fixing what we asked" : "Nothing sent back"} tone={n("needs_changes") ? "gold" : "muted"} />
            <KpiTile icon={IconProjects} label="Jobs in progress" value={summary.projects_active.toLocaleString()} hint="Active projects with a builder" tone="info" />
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
          {trades.length ? (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by trade">
              <FilterChip active={category === ""} onClick={() => { setCategory(""); reset(); }} label="Every trade" count={summary?.all} />
              {trades.map(([c, count], i) => (
                <FilterChip key={c} active={category === c} onClick={() => { setCategory(c); reset(); }} label={label(c)} count={count} icon={<IconBuilding className="h-3.5 w-3.5" />} dot={["#0B5D4B", "#F2A93B", "#1D5FA8", "#9B7FDB", "#E08A3C"][i % 5]} />
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                { value: "", label: "All", count: summary?.all },
                { value: "submitted", label: "Waiting", count: counts ? n("submitted") : undefined, alert: true },
                { value: "needs_changes", label: "Sent back", count: counts ? n("needs_changes") : undefined },
                { value: "verified", label: "Verified", count: counts ? n("verified") : undefined },
                { value: "draft", label: "Not submitted", count: counts ? n("draft") : undefined },
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search business, place or owner" label="Search businesses" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} business{data.pagination.total === 1 ? "" : "es"} · waiting ones first
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
        ) : data.vendors.length === 0 ? (
          <EmptyState message="No businesses match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Business</th>
                    <th className="px-3 py-3 font-semibold">Owner</th>
                    <th className="px-3 py-3 font-semibold">Trade</th>
                    <th className="px-3 py-3 font-semibold">Checks</th>
                    <th className="px-3 py-3 font-semibold">Rating</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v) => {
                    const S = STATUS[v.status] ?? STATUS.draft;
                    const checks = v.checks ?? null;
                    const keys = checks ? CHECKS.filter((k) => checks[k]).concat((Object.keys(checks) as VendorCheck[]).filter((k) => !CHECKS.includes(k))) : [];
                    const approved = keys.filter((k) => checks?.[k]?.status === "approved").length;
                    const redo = keys.filter((k) => checks?.[k]?.status === "redo").length;
                    return (
                      <tr key={v.id} onClick={() => router.push(`/vendors/${v.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold", TRADE_TINTS[v.id % TRADE_TINTS.length])}>
                              {initials(v.business_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[230px] truncate font-bold text-ink group-hover:text-brand">{v.business_name}</p>
                              <p className="max-w-[230px] truncate text-xs text-muted">{v.location ?? "No location yet"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" name={v.owner_name} />
                            <p className="max-w-[140px] truncate font-semibold text-ink">{v.owner_name ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-page px-2.5 py-1 text-xs font-semibold text-ink">
                            <IconBuilding className="h-3.5 w-3.5 text-brand" />
                            {label(v.category)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          {keys.length ? (
                            <>
                              <div className="flex gap-1">
                                {keys.map((k) => (
                                  <span key={k} title={`${CHECK_NAME[k] ?? label(k)} · ${label(checks?.[k]?.status ?? "todo")}`} className={cn("h-1.5 w-6 rounded-full", CHECK_COLOR[checks?.[k]?.status ?? "todo"] ?? "bg-line")} />
                                ))}
                              </div>
                              <p className="mt-1 text-[11px] text-muted">
                                {approved} of {keys.length} approved
                                {redo ? <span className="font-semibold text-danger"> · {redo} to redo</span> : null}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-muted">Not started</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          {v.rating ? (
                            <>
                              <p className="whitespace-nowrap text-xs font-bold text-ink">
                                <span className="text-gold">★</span> {v.rating.toFixed(1)}
                              </p>
                              <p className="text-[11px] text-muted">{v.reviews} review{v.reviews === 1 ? "" : "s"}</p>
                            </>
                          ) : (
                            <span className="text-xs text-muted">No reviews yet</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {v.status === "verified" && v.verified_at ? `Since ${formatDate(v.verified_at)}` : v.submitted_at ? `Sent ${agoText(v.submitted_at)}` : `Joined ${agoText(v.created_at)}`}
                          </p>
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
