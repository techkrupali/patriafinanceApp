"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, naira } from "@/lib/format";
import type { UsersData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconCheckCircle, IconChevronRight, IconLock, IconShield, IconUser, IconUsers, IconWallet } from "@/components/icons";
import { agoText, Avatar, countsOf, tierExtra, FilterChip, HeroCard, KpiTile, PageTitle, PANEL, SearchBox, SplitBar, StatusDot, StatusTabs } from "@/components/list-kit";

/** Tier colours: on the dark hero (bar) and on white (chips). */
const TIER_ON_DARK = ["rgba(243,247,244,0.35)", "#B9F0D8", "#5FD3A5", "#F2A93B", "#9BB8F0", "#E3A0D8"];
const TIER_CHIP = [
  "bg-page text-muted",
  "bg-brand-soft text-brand",
  "bg-[#E6F7EF] text-[#14725C]",
  "bg-gold-soft text-warn",
  "bg-info-soft text-info",
  "bg-[#F3EEFB] text-[#6B4BB0]",
];
const TIER_DOT = ["#6F8A7E", "#0B5D4B", "#1FA07A", "#F2A93B", "#1D5FA8", "#9B7FDB"];
const pick = <T,>(list: T[], tier: number) => list[Math.min(tier, list.length - 1)];

type Status = "" | "active" | "suspended";
type Signup = "" | "phone" | "password";

export default function UsersPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [signup, setSignup] = useState<Signup>("");
  const [tier, setTier] = useState("");
  const [page, setPage] = useState(1);

  // Debounce free-text search so we don't hammer the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["admin", "users", { search, status, signup, tier, page }],
    queryFn: () => api<UsersData>(`/api/v1/admin/users${qs({ search, status, signup, tier, page })}`),
    placeholderData: (prev) => prev,
  });
  // The tier names admin set in Settings (the app shows the same).
  const { data: settings } = useQuery({
    queryKey: ["admin", "system-settings"],
    queryFn: () => api<{ tiers: { tier: number; name: string; needs: string }[] }>("/api/v1/admin/system-settings"),
    staleTime: 60_000,
  });
  const tierOf = useMemo(() => {
    const byLevel = new Map((settings?.tiers ?? []).map((t) => [t.tier, t]));
    return (t: number) => byLevel.get(t);
  }, [settings]);

  const summary = data?.summary;
  const tiers = countsOf(summary?.by_tier);
  const pct = (n: number) => (summary?.total ? Math.round((n / summary.total) * 100) : 0);
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="People" title="Users" subtitle="Every customer on Patriai: how they joined, how far they've verified and what they hold." />

      {/* Summary */}
      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconUsers}
            title="Customers"
            sub={summary.new_7d ? `+${summary.new_7d.toLocaleString()} joined in the last 7 days` : "No one new in the last 7 days"}
            value={summary.total.toLocaleString()}
            unit={summary.total === 1 ? "person" : "people"}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">By verification</p>
            <SplitBar
              empty="No customers yet."
              parts={tiers.map(([t, n]) => ({ key: String(t), label: t === 0 ? "Not verified" : `Tier ${t}`, value: n, color: pick(TIER_ON_DARK, t) }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile icon={IconCheckCircle} label="Active" value={summary.active.toLocaleString()} hint={`${pct(summary.active)}% of customers`} tone="brand" />
            <KpiTile icon={IconLock} label="Suspended" value={summary.suspended.toLocaleString()} hint={summary.suspended ? "Can't sign in or move money" : "No one suspended"} tone={summary.suspended ? "danger" : "muted"} />
            <KpiTile icon={IconShield} label="Verified" value={`${pct(summary.verified)}%`} hint={`${summary.verified.toLocaleString()} at Tier 1 or above`} tone="gold" />
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
      <div className={PANEL}>
        <div className="space-y-4 border-b border-line px-5 py-5">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by verification tier">
            <FilterChip active={tier === ""} onClick={() => { setTier(""); reset(); }} label="All tiers" count={summary?.total} />
            {tiers.map(([t, n]) => (
              <FilterChip
                key={t}
                active={tier === String(t)}
                onClick={() => { setTier(String(t)); reset(); }}
                label={t === 0 ? "Not verified" : tierOf(t)?.name ?? `Tier ${t}`}
                count={n}
                dot={pick(TIER_DOT, t)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Status>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[
                { value: "", label: "All", count: summary?.matching },
                { value: "active", label: "Active", count: summary?.by_status.active },
                { value: "suspended", label: "Suspended", count: summary?.by_status.suspended, alert: true },
              ]}
            />
            <StatusTabs<Signup>
              label="Sign-up"
              value={signup}
              onChange={(v) => { setSignup(v); reset(); }}
              tabs={[
                { value: "", label: "Any sign-up" },
                { value: "phone", label: "Phone + PIN" },
                { value: "password", label: "Email + password" },
              ]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search name, @username, email or phone" label="Search customers" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} customer{data.pagination.total === 1 ? "" : "s"}
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
        ) : data.users.length === 0 ? (
          <EmptyState message="No customers match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Contact</th>
                    <th className="px-3 py-3 font-semibold">Verification</th>
                    <th className="px-3 py-3 font-semibold">Sign-up</th>
                    <th className="px-3 py-3 text-right font-semibold">Wallets</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Joined</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} onClick={() => router.push(`/users/${u.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name} seed={u.id} />
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate font-bold text-ink group-hover:text-brand">{u.full_name}</p>
                            <p className="truncate text-xs text-muted">{u.username ? `@${u.username}` : `#${u.id}`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="whitespace-nowrap font-semibold tabular-nums text-ink">{u.phone || "—"}</p>
                        <p className="max-w-[200px] truncate text-xs text-muted">{u.email}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", pick(TIER_CHIP, u.kyc_tier))}>
                          {u.kyc_tier > 0 ? <IconShield className="h-3.5 w-3.5" /> : null}
                          {u.kyc_tier === 0 ? "Not verified" : `Tier ${u.kyc_tier}`}
                        </span>
                        {u.kyc_tier > 0 && tierOf(u.kyc_tier) ? (
                          <p className="mt-1 max-w-[170px] truncate text-[11px] text-muted">{tierExtra(tierOf(u.kyc_tier)?.name) || tierOf(u.kyc_tier)?.needs}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-ink">
                          {u.has_password ? <IconUser className="h-3.5 w-3.5 text-info" /> : <IconLock className="h-3.5 w-3.5 text-brand" />}
                          {u.has_password ? "Email + password" : "Phone + PIN"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <p className="font-extrabold tabular-nums text-ink">
                          <span className="lg:hidden">{compactNaira(Number(u.total_balance))}</span>
                          <span className="hidden lg:inline">{naira(u.total_balance)}</span>
                        </p>
                        <p className="inline-flex items-center gap-1 text-[11px] text-muted">
                          <IconWallet className="h-3 w-3" />
                          {(u.wallets_count ?? 0).toLocaleString()} wallet{u.wallets_count === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-3 py-3.5">
                        <StatusDot color={u.status === "active" ? "bg-brand" : "bg-danger"}>{u.status === "active" ? "Active" : "Suspended"}</StatusDot>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <p className="text-xs font-semibold text-ink">{formatDate(u.created_at)}</p>
                        <p className="text-[11px] text-muted">{agoText(u.created_at)}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <IconChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                      </td>
                    </tr>
                  ))}
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
