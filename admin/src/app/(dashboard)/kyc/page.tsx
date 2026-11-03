"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, label } from "@/lib/format";
import type { KycData, KycStatus } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAlert, IconCheckCircle, IconChevronRight, IconClock, IconKyc, IconShield, IconTrendUp } from "@/components/icons";
import { ago, agoText, Avatar, countsOf, tierExtra, FilterChip, HeroCard, hoursSince, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs } from "@/components/list-kit";

const TIER_ON_DARK = ["#B9F0D8", "#5FD3A5", "#F2A93B", "#9BB8F0", "#E3A0D8"];
const TIER_DOT = ["#0B5D4B", "#1FA07A", "#F2A93B", "#1D5FA8", "#9B7FDB"];
const tierColor = (list: string[], t: number) => list[Math.min(Math.max(t - 1, 0), list.length - 1)];

const STATUS_DOT: Record<KycStatus, string> = { pending: "bg-gold", approved: "bg-brand", rejected: "bg-danger" };
const STATUS_WORD: Record<KycStatus, string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected" };

type Tab = "" | KycStatus;

/** What the form held: the app sends "personal" (details + photos). */
const FORM: Record<string, string> = { personal: "Personal details", bvn: "BVN", nin: "NIN", id_address: "ID + address", business: "Business papers" };

/** How long it's waited: calm under a day, gold to three days, red past that. */
function Waiting({ since }: { since: string | null }) {
  const h = hoursSince(since);
  const a = ago(since);
  const tone = h < 24 ? "bg-brand-soft text-brand" : h < 72 ? "bg-gold-soft text-warn" : "bg-danger/10 text-danger";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold tabular-nums", tone)}>
      <IconClock className="h-3.5 w-3.5" />
      {a === "just now" ? "Just now" : /^\d+[mhd]$/.test(a) ? `${a} waiting` : `Since ${a}`}
    </span>
  );
}

export default function KycPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("pending");
  const [tier, setTier] = useState("");
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
    queryKey: ["admin", "kyc", { status, tier, search, page }],
    queryFn: () => api<KycData>(`/api/v1/admin/kyc${qs({ status, tier, search, page })}`),
    placeholderData: (prev) => prev,
  });
  // The tiers admin set in Settings, for the chips.
  const { data: settings } = useQuery({
    queryKey: ["admin", "system-settings"],
    queryFn: () => api<{ tiers: { tier: number; name: string }[] }>("/api/v1/admin/system-settings"),
    staleTime: 60_000,
  });
  const tierList = useMemo(() => (settings?.tiers ?? []).filter((t) => t.tier > 0).sort((a, b) => a.tier - b.tier), [settings]);
  const nameOf = (t: number) => tierList.find((x) => x.tier === t)?.name ?? `Tier ${t}`;

  const summary = data?.summary;
  const pendingByTier = countsOf(summary?.pending_by_tier);
  const pendingAll = pendingByTier.reduce((a, [, n]) => a + n, 0);
  const decided = (summary?.approved_30d ?? 0) + (summary?.rejected_30d ?? 0);
  const rate = decided ? Math.round(((summary?.approved_30d ?? 0) / decided) * 100) : null;
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Trust" title="KYC" subtitle="Who's asking to move up a tier, what they sent, and how long they've waited." />

      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconKyc}
            title="Waiting for review"
            sub={summary.oldest_pending_at ? `The oldest has waited ${ago(summary.oldest_pending_at)}` : "The queue is clear"}
            value={pendingAll.toLocaleString()}
            unit={pendingAll === 1 ? "request" : "requests"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">By tier asked for</p>
            <SplitBar
              empty="Nothing waiting. Every request has been reviewed."
              parts={pendingByTier.map(([t, n]) => ({ key: String(t), label: `Tier ${t}`, value: n, color: tierColor(TIER_ON_DARK, t) }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile icon={IconCheckCircle} label="Approved" value={summary.approved_30d.toLocaleString()} hint="In the last 30 days" tone="brand" />
            <KpiTile icon={IconAlert} label="Rejected" value={summary.rejected_30d.toLocaleString()} hint="In the last 30 days" tone={summary.rejected_30d ? "danger" : "muted"} />
            <KpiTile icon={IconTrendUp} label="Approval rate" value={rate === null ? "—" : `${rate}%`} hint={decided ? `${decided.toLocaleString()} decided in 30 days` : "Nothing decided yet"} tone="gold" />
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by tier asked for">
            <FilterChip active={tier === ""} onClick={() => { setTier(""); reset(); }} label="Every tier" />
            {tierList.map((t) => (
              <FilterChip
                key={t.tier}
                active={tier === String(t.tier)}
                onClick={() => { setTier(String(t.tier)); reset(); }}
                label={t.name}
                dot={tierColor(TIER_DOT, t.tier)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                { value: "pending", label: "Waiting", count: summary?.by_status.pending, alert: true },
                { value: "approved", label: "Approved", count: summary?.by_status.approved },
                { value: "rejected", label: "Rejected", count: summary?.by_status.rejected },
                { value: "", label: "All", count: summary?.all },
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search name, email, phone or #id" label="Search KYC requests" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} request{data.pagination.total === 1 ? "" : "s"}
              {status === "pending" && data.pagination.total ? " · oldest first" : ""}
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
        ) : data.submissions.length === 0 ? (
          <EmptyState message={status === "pending" && !search && !tier ? "Nothing waiting. Every request has been reviewed." : "No KYC requests match your filters."} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Applicant</th>
                    <th className="px-3 py-3 font-semibold">Asking for</th>
                    <th className="px-3 py-3 font-semibold">Form</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Submitted</th>
                    <th className="w-24 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.submissions.map((s) => {
                    // Waiting: where they are now. Decided: the tier below what they asked for.
                    const from = s.status === "pending" && s.user?.tier !== undefined ? s.user.tier : Math.max(0, s.target_tier - 1);
                    return (
                      <tr key={s.id} onClick={() => router.push(`/kyc/${s.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={s.user?.name} seed={s.user?.id ?? s.id} />
                            <div className="min-w-0">
                              <p className="max-w-[210px] truncate font-bold text-ink group-hover:text-brand">{s.user?.name ?? "—"}</p>
                              <p className="max-w-[210px] truncate text-xs text-muted">
                                <span className="font-mono">#{s.id}</span> · {s.user?.phone || s.user?.email || ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold">
                            <span className="rounded-full bg-page px-2 py-0.5 text-muted">{from === 0 ? "Unverified" : `Tier ${from}`}</span>
                            <IconChevronRight className="h-3 w-3 text-muted" />
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white" style={{ background: tierColor(TIER_DOT, s.target_tier) }}>
                              <IconShield className="h-3 w-3" />
                              Tier {s.target_tier}
                            </span>
                          </span>
                          {tierExtra(s.tier_name ?? nameOf(s.target_tier)) ? (
                            <p className="mt-1 max-w-[260px] truncate text-xs font-semibold text-ink">{tierExtra(s.tier_name ?? nameOf(s.target_tier))}</p>
                          ) : null}
                          {s.needs ? <p className={cn("max-w-[260px] truncate text-[11px] text-muted", !tierExtra(s.tier_name) && "mt-1")}>{s.needs}</p> : null}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-page px-2.5 py-1 text-xs font-semibold text-ink">
                            <IconKyc className="h-3.5 w-3.5 text-brand" />
                            {FORM[s.type] ?? label(s.type)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          {s.status === "pending" ? (
                            <Waiting since={s.created_at} />
                          ) : (
                            <>
                              <StatusDot color={STATUS_DOT[s.status]}>{STATUS_WORD[s.status]}</StatusDot>
                              <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted">
                                {s.reviewed_at ? agoText(s.reviewed_at) : ""}
                                {s.status === "rejected" && s.review_note ? ` · ${s.review_note}` : ""}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs text-muted">{formatDate(s.created_at)}</td>
                        <td className="px-3 py-3.5 text-right">
                          {s.status === "pending" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-navy px-3.5 py-1.5 text-xs font-bold text-white transition-colors group-hover:bg-brand">
                              Review
                              <IconChevronRight className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <IconChevronRight className="ml-auto h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                          )}
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
