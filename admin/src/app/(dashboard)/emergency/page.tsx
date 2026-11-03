"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { emergencyMethodLabel, formatDate, naira } from "@/lib/format";
import type { EmergencyRequestMethod, EmergencyRequestStatus, EmergencyRequestsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconAlert, IconArrowUpRight, IconBook, IconChevronRight, IconEmergency, IconLock, IconSliders, IconUsers } from "@/components/icons";
import { agoText, Avatar, FilterChip, HeroCard, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs, Yeses, type IconT } from "@/components/list-kit";

const METHOD: Record<EmergencyRequestMethod, { icon: IconT; tile: string; dot: string; chip: string }> = {
  document: { icon: IconBook, tile: "bg-info-soft text-info", dot: "#1D5FA8", chip: "Document" },
  dual_approval: { icon: IconUsers, tile: "bg-brand-soft text-brand", dot: "#0B5D4B", chip: "Keyholders' release" },
  fast_release: { icon: IconArrowUpRight, tile: "bg-gold-soft text-warn", dot: "#F2A93B", chip: "Fast release" },
  rule_change: { icon: IconSliders, tile: "bg-[#F3EEFB] text-[#6B4BB0]", dot: "#9B7FDB", chip: "Rule change" },
};
const METHODS = Object.keys(METHOD) as EmergencyRequestMethod[];

const STATUS: Record<EmergencyRequestStatus, { word: string; dot: string; onDark: string }> = {
  pending: { word: "Waiting", dot: "bg-gold", onDark: "#F2A93B" },
  flagged: { word: "Flagged", dot: "bg-[#E0702A]", onDark: "#F28B5B" },
  approved: { word: "Approved", dot: "bg-brand", onDark: "#5FD3A5" },
  released: { word: "Released", dot: "bg-[#1FA07A]", onDark: "#B9F0D8" },
  rejected: { word: "Rejected", dot: "bg-danger", onDark: "#E7836F" },
  cancelled: { word: "Cancelled", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.35)" },
  expired: { word: "Expired", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.22)" },
};
const STATUS_ORDER: EmergencyRequestStatus[] = ["pending", "flagged", "approved", "released", "rejected", "cancelled", "expired"];

type Tab = "" | EmergencyRequestStatus;

export default function EmergencyPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("pending");
  const [method, setMethod] = useState("");
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
    queryKey: ["admin", "emergency-requests", { status, method, search, page }],
    queryFn: () => api<EmergencyRequestsData>(`/api/v1/admin/emergency-requests${qs({ status, method, search, page })}`),
    placeholderData: (prev) => prev,
  });
  const summary = data?.summary;
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle
        eyebrow="Safety"
        title="Emergency"
        subtitle="Releases from emergency funds: check the documents, the keyholders' yeses and fast releases made with proof."
      />

      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconEmergency}
            title="Waiting for a decision"
            sub={summary.flagged_all ? `${summary.flagged_all.toLocaleString()} more flagged for a closer look` : "Nothing flagged"}
            value={summary.pending_all.toLocaleString()}
            unit={summary.pending_all === 1 ? "request" : "requests"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Every request, by outcome</p>
            <SplitBar
              empty="No emergency requests yet."
              parts={STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].word, value: summary.by_status[s] ?? 0, color: STATUS[s].onDark }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile
              icon={IconArrowUpRight}
              label="Fast releases"
              value={summary.fast_30d.toLocaleString()}
              hint={Number(summary.fast_30d_amount) ? `${compactNaira(Number(summary.fast_30d_amount))} in 30 days, with proof` : "None in the last 30 days"}
              tone="gold"
            />
            <KpiTile icon={IconAlert} label="Flagged" value={summary.flagged_all.toLocaleString()} hint={summary.flagged_all ? "Proof needs a second look" : "Nothing to check again"} tone={summary.flagged_all ? "danger" : "muted"} />
            <KpiTile icon={IconLock} label="Locked funds" value={summary.locked_wallets.toLocaleString()} hint="Emergency wallets locked" tone="brand" />
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
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by kind of release">
            <FilterChip active={method === ""} onClick={() => { setMethod(""); reset(); }} label="Every kind" />
            {METHODS.map((m) => {
              const M = METHOD[m];
              return (
                <FilterChip key={m} active={method === m} onClick={() => { setMethod(m); reset(); }} label={M.chip} icon={<M.icon className="h-3.5 w-3.5" />} dot={M.dot} />
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                ...STATUS_ORDER.map((s) => ({ value: s as Tab, label: STATUS[s].word, count: summary?.by_status[s], alert: s === "pending" || s === "flagged" })),
                { value: "" as Tab, label: "All", count: summary?.all },
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search wallet, owner or #id" label="Search emergency requests" />
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
        ) : data.requests.length === 0 ? (
          <EmptyState message={status === "pending" && !search && !method ? "Nothing waiting. Every emergency request has a decision." : "No emergency requests match your filters."} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Request</th>
                    <th className="px-3 py-3 font-semibold">Emergency wallet</th>
                    <th className="px-3 py-3 font-semibold">Asked by</th>
                    <th className="px-3 py-3 font-semibold">Funds</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Asked</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((r) => {
                    const M = METHOD[r.method] ?? METHOD.document;
                    const S = STATUS[r.status] ?? STATUS.pending;
                    return (
                      <tr key={r.id} onClick={() => router.push(`/emergency/${r.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", M.tile)}>
                              <M.icon className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[230px] truncate font-bold text-ink group-hover:text-brand">{emergencyMethodLabel(r.method, r.document_type)}</p>
                              {r.method === "fast_release" && r.amount ? (
                                <p className="max-w-[230px] truncate text-xs text-muted">
                                  <span className="font-semibold text-ink">{naira(r.amount)}</span> with proof{r.payee ? ` · to ${r.payee.account_name}` : ""}
                                </p>
                              ) : (r.method === "dual_approval" || r.method === "rule_change") && r.required_approvals ? (
                                <>
                                  {r.amount ? (
                                    <p className="max-w-[230px] truncate text-xs text-muted">
                                      <span className="font-semibold text-ink">{naira(r.amount)}</span> · {r.payee ? `to ${r.payee.account_name}` : "to their Main"}
                                    </p>
                                  ) : null}
                                  <Yeses got={r.approvals ?? 0} need={r.required_approvals} />
                                </>
                              ) : (
                                <p className="text-xs text-muted">
                                  <span className="font-mono">#{r.id}</span>
                                  {r.has_document ? " · document attached" : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="max-w-[190px] truncate font-semibold text-ink">{r.wallet?.name ?? "—"}</p>
                          <p className="max-w-[190px] truncate text-xs text-muted">{r.wallet?.owner?.name ?? ""}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          {r.requested_by || r.trusted_contact ? (
                            <div className="flex items-center gap-2.5">
                              <Avatar size="sm" name={r.requested_by?.name ?? r.trusted_contact?.name} seed={r.requested_by?.id ?? r.id} />
                              <div className="min-w-0">
                                <p className="max-w-[150px] truncate font-semibold text-ink">{r.requested_by?.name ?? r.trusted_contact?.name}</p>
                                <p className="max-w-[150px] truncate text-xs text-muted">
                                  {r.requested_by?.username ? `@${r.requested_by.username}` : r.trusted_contact ? "Trusted contact · SMS link" : ""}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          {r.wallet ? (
                            <>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                                  r.wallet.locked ? "bg-gold-soft text-warn" : "bg-brand-soft text-brand",
                                )}
                              >
                                <IconLock className="h-3.5 w-3.5" />
                                {r.wallet.locked ? "Locked" : "Open"}
                              </span>
                              <p className="mt-1 text-[11px] font-semibold tabular-nums text-muted">{compactNaira(Number(r.wallet.balance))} held</p>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
                          {r.reviewed_by && r.status !== "pending" ? <p className="mt-0.5 max-w-[140px] truncate text-[11px] text-muted">by {r.reviewed_by}</p> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <p className="text-xs font-semibold text-ink">{formatDate(r.created_at)}</p>
                          <p className="text-[11px] text-muted">{agoText(r.created_at)}</p>
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
