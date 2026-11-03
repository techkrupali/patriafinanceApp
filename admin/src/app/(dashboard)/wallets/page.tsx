"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, label, naira, walletStatusLabel } from "@/lib/format";
import type { WalletsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import {
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconEmergency,
  IconProjects,
  IconSearch,
  IconTransactions,
  IconTrendUp,
  IconUser,
  IconUsers,
  IconWallet,
} from "@/components/icons";

type IconT = (props: { className?: string }) => React.ReactNode;

/** Each wallet type's icon and colours (emerald, gold, info, and calm tints). */
const TYPE_STYLE: Record<string, { icon: IconT; tile: string; dot: string }> = {
  main: { icon: IconWallet, tile: "bg-brand text-white", dot: "#0B5D4B" },
  savings: { icon: IconTrendUp, tile: "bg-brand-soft text-brand", dot: "#1FA07A" },
  goal: { icon: IconCheckCircle, tile: "bg-[#E6F7EF] text-[#14725C]", dot: "#3DB98E" },
  spending: { icon: IconTransactions, tile: "bg-info-soft text-info", dot: "#1D5FA8" },
  shared: { icon: IconUsers, tile: "bg-[#EEF2FB] text-[#3B5BA5]", dot: "#6C8BD8" },
  joint: { icon: IconUsers, tile: "bg-[#F3EEFB] text-[#6B4BB0]", dot: "#9B7FDB" },
  child: { icon: IconUser, tile: "bg-gold-soft text-warn", dot: "#F2A93B" },
  project: { icon: IconProjects, tile: "bg-[#08392F] text-[#5FD3A5]", dot: "#08392F" },
  emergency: { icon: IconEmergency, tile: "bg-danger/10 text-danger", dot: "#B3311A" },
  giving: { icon: IconCheckCircle, tile: "bg-[#FDF1E2] text-[#B5651D]", dot: "#E08A3C" },
  ajo: { icon: IconUsers, tile: "bg-[#FFF6DB] text-[#8F6A00]", dot: "#D9B23A" },
};
const styleOf = (type: string) => TYPE_STYLE[type] ?? { icon: IconWallet, tile: "bg-page text-muted", dot: "#6F8A7E" };
/** On the emerald card the darkest greens would disappear; lift them. */
const onDark = (type: string) => ({ main: "#B9F0D8", project: "#5FD3A5", savings: "#3DD69A", goal: "#8FE0BF" } as Record<string, string>)[type] ?? styleOf(type).dot;

const ORDER = ["main", "savings", "goal", "spending", "shared", "joint", "child", "project", "emergency", "giving", "ajo"];

const STATUSES = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "frozen", label: "Paused" },
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Archived" },
] as const;

const STATUS_DOT: Record<string, string> = { active: "bg-brand", frozen: "bg-gold", suspended: "bg-danger", closed: "bg-line-strong" };

function initials(name?: string | null): string {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function SummaryTile({ icon: Icon, label: title, value, hint, tone }: { icon: IconT; label: string; value: string; hint: string; tone: "brand" | "gold" | "muted" }) {
  const tones = { brand: "bg-brand-soft text-brand", gold: "bg-gold-soft text-warn", muted: "bg-page text-muted" };
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line/80 bg-white p-3.5 shadow-card sm:rounded-[22px] sm:p-5">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl", tones[tone])}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <span className="min-h-3 flex-1" aria-hidden="true" />
      <p className="mt-3 text-xl font-extrabold leading-none tracking-tight tabular-nums text-ink sm:mt-4 sm:text-[28px]">{value}</p>
      <p className="mt-1.5 text-xs font-semibold leading-tight text-ink sm:text-sm">{title}</p>
      <p className="hidden text-xs text-muted sm:block">{hint}</p>
    </div>
  );
}

/** Every naira in wallets, and how it splits by type. */
function MoneyHero({ summary }: { summary: NonNullable<WalletsData["summary"]> }) {
  const types = Object.entries(summary.by_type)
    .map(([t, v]) => ({ t, v: Number(v.balance), n: v.count }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const total = Number(summary.total_balance);
  const [whole, kobo] = naira(total).replace("₦", "").split(".");
  return (
    <div
      className="relative overflow-hidden rounded-[22px] p-6 text-white shadow-[0_24px_60px_-30px_rgba(8,57,47,0.7)] sm:col-span-2 lg:col-span-2"
      style={{ background: "linear-gradient(140deg, #08392F 0%, #0B5D4B 60%, #12775F 100%)" }}
    >
      <svg viewBox="0 0 400 400" className="animate-ring pointer-events-none absolute -right-28 -top-32 h-80 w-80 opacity-60" aria-hidden="true">
        <circle cx="200" cy="200" r="150" fill="none" stroke="rgba(243,247,244,0.10)" strokeWidth="30" />
        <circle cx="200" cy="262" r="92" fill="none" stroke="#5FD3A5" strokeOpacity="0.35" strokeWidth="26" strokeDasharray="420 160" strokeLinecap="round" />
      </svg>
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
          <IconWallet className="h-5 w-5 text-[#5FD3A5]" />
        </span>
        <div>
          <p className="text-sm font-bold">Money in wallets</p>
          <p className="text-xs text-white/65">
            {summary.total.toLocaleString()} wallets · {summary.shared.toLocaleString()} shared with family
          </p>
        </div>
      </div>
      <p className="relative mt-5 flex items-baseline gap-1 font-extrabold tracking-tight">
        <span className="text-xl text-white/55">₦</span>
        <span className="text-[38px] leading-none tabular-nums">{whole}</span>
        <span className="text-lg text-white/55 tabular-nums">.{kobo}</span>
      </p>
      {types.length ? (
        <div className="relative mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
            {types.map((r) => (
              <div key={r.t} title={`${label(r.t)} · ${naira(r.v)}`} className="border-r border-[#0B5D4B]/60 last:border-0" style={{ width: `${(r.v / total) * 100}%`, background: onDark(r.t) }} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {types.slice(0, 5).map((r) => (
              <span key={r.t} className="flex items-center gap-1.5 text-xs text-white/75">
                <span className="h-2 w-2 rounded-full" style={{ background: onDark(r.t) }} />
                {label(r.t)} <span className="font-semibold text-white">{compactNaira(r.v)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function WalletsPage() {
  const router = useRouter();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"newest" | "balance">("newest");
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
    queryKey: ["admin", "wallets", { type, status, search, page, sort }],
    queryFn: () => api<WalletsData>(`/api/v1/admin/wallets${qs({ type, status, search, page, sort })}`),
    placeholderData: (prev) => prev,
  });
  const summary = data?.summary;
  const types = useMemo(
    () => ORDER.filter((t) => (summary?.by_type[t]?.count ?? 0) > 0).concat(Object.keys(summary?.by_type ?? {}).filter((t) => !ORDER.includes(t))),
    [summary],
  );
  const attention = (summary?.by_status.frozen ?? 0) + (summary?.by_status.suspended ?? 0);

  return (
    <div className="animate-rise">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Money</p>
          <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">
            Wallets<span className="text-gold">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Every wallet on Patriai: who owns it, who shares it and what it holds.</p>
        </div>
      </div>

      {/* Summary */}
      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <MoneyHero summary={summary} />
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <SummaryTile icon={IconCheckCircle} label="Active" value={summary.by_status.active.toLocaleString()} hint={`of ${summary.total.toLocaleString()} wallets`} tone="brand" />
            <SummaryTile icon={IconClock} label="Paused or suspended" value={attention.toLocaleString()} hint={attention ? "Spending is stopped" : "Nothing stopped"} tone={attention ? "gold" : "muted"} />
            <SummaryTile icon={IconWallet} label="Archived or closed" value={summary.by_status.closed.toLocaleString()} hint="Read only, history kept" tone="muted" />
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

      {/* Filters + list */}
      <div className="mt-5 overflow-hidden rounded-[22px] border border-line/80 bg-white shadow-card">
        <div className="space-y-4 border-b border-line px-5 py-5">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by type">
            <TypeChip active={type === ""} onClick={() => { setType(""); setPage(1); }} label="All types" count={summary?.total} />
            {types.map((t) => {
              const S = styleOf(t);
              return (
                <TypeChip
                  key={t}
                  active={type === t}
                  onClick={() => { setType(t); setPage(1); }}
                  label={label(t)}
                  count={summary?.by_type[t]?.count}
                  icon={<S.icon className="h-3.5 w-3.5" />}
                  dot={S.dot}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-page p-1" role="tablist" aria-label="Status">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="tab"
                  aria-selected={status === s.value}
                  onClick={() => { setStatus(s.value); setPage(1); }}
                  className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors", status === s.value ? "bg-navy text-white shadow-sm" : "text-muted hover:text-ink")}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="relative min-w-56 flex-1">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="h-10 w-full rounded-full border border-line bg-page pl-10 pr-4 text-sm text-ink transition-colors placeholder:text-muted/70 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
                placeholder="Search wallet, account no, owner or phone"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search wallets"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value as "newest" | "balance"); setPage(1); }}
              aria-label="Sort"
              className="h-10 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="balance">Biggest balance</option>
            </select>
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} wallet{data.pagination.total === 1 ? "" : "s"}
              {summary ? <> · <span className="font-semibold text-ink">{naira(summary.matching_balance)}</span> in them</> : null}
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
        ) : data.wallets.length === 0 ? (
          <EmptyState message="No wallets match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Wallet</th>
                    <th className="px-3 py-3 font-semibold">Owner</th>
                    <th className="px-3 py-3 font-semibold">Type</th>
                    <th className="px-3 py-3 font-semibold">Shared</th>
                    <th className="px-3 py-3 text-right font-semibold">Balance</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Created</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.wallets.map((w) => {
                    const S = styleOf(w.type);
                    const target = w.target_amount ? Number(w.target_amount) : 0;
                    const pct = target ? Math.min(100, Math.round((Number(w.balance) / target) * 100)) : null;
                    return (
                      <tr
                        key={w.id}
                        onClick={() => router.push(`/wallets/${w.id}`)}
                        className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", S.tile)}>
                              <S.icon className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[220px] truncate font-bold text-ink group-hover:text-brand">{w.name}</p>
                              <p className="truncate text-xs text-muted">
                                {w.virtual_account ? `${w.virtual_account}${w.virtual_account_bank ? ` · ${w.virtual_account_bank}` : ""}` : "No account number"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{initials(w.owner?.name)}</span>
                            <div className="min-w-0">
                              <p className="max-w-[160px] truncate font-semibold text-ink">{w.owner?.name ?? "—"}</p>
                              <p className="max-w-[160px] truncate text-xs text-muted">{w.owner_phone ?? w.owner?.email ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-page px-2.5 py-1 text-xs font-semibold text-ink">
                            <span className="h-2 w-2 rounded-full" style={{ background: S.dot }} />
                            {label(w.type)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-xs">
                          {w.members_count ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-ink">
                              <IconUsers className="h-3.5 w-3.5 text-brand" />+{w.members_count}
                            </span>
                          ) : (
                            <span className="text-muted">Just the owner</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <p className="font-extrabold tabular-nums text-ink">{naira(w.balance)}</p>
                          {pct !== null ? (
                            <div className="ml-auto mt-1.5 flex w-32 items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-page">
                                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(pct, 3)}%` }} />
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums text-muted">{pct}%</span>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink">
                            <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[w.status] ?? "bg-line-strong")} />
                            {walletStatusLabel(w.status, w.closed?.mode)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-xs text-muted">{formatDate(w.created_at)}</td>
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

function TypeChip({ active, onClick, label: text, count, icon, dot }: { active: boolean; onClick: () => void; label: string; count?: number; icon?: React.ReactNode; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all",
        active ? "border-navy bg-navy text-white shadow-sm" : "border-line bg-white text-ink hover:border-brand/40 hover:bg-rowhover",
      )}
    >
      {icon ? (
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", active ? "bg-white/15 text-[#5FD3A5]" : "")} style={active ? undefined : { color: dot }}>
          {icon}
        </span>
      ) : null}
      {text}
      {count !== undefined ? (
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums", active ? "bg-white/15 text-white" : "bg-page text-muted")}>{count}</span>
      ) : null}
    </button>
  );
}
