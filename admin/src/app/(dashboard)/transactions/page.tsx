"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { label, naira } from "@/lib/format";
import type { ApiTransaction, TransactionsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconAlert, IconArrowDownLeft, IconArrowUpRight, IconChevronRight, IconClock, IconSearch, IconTrendDown, IconTrendUp } from "@/components/icons";

type IconT = (props: { className?: string }) => React.ReactNode;

const TYPES = [
  { value: "", label: "All types" },
  { value: "fund", label: "Fund" },
  { value: "funding", label: "Funding" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer_in", label: "Transfer in" },
  { value: "transfer_out", label: "Transfer out" },
  { value: "fee", label: "Fee" },
  { value: "refund", label: "Refund" },
  { value: "reversal", label: "Reversal" },
  { value: "admin_credit", label: "Admin credit" },
  { value: "admin_debit", label: "Admin debit" },
  { value: "loan_disbursement", label: "Loan disbursement" },
  { value: "loan_repayment", label: "Loan repayment" },
];

const PERIODS = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const STATUS = {
  successful: { label: "Successful", dot: "bg-brand", text: "text-brand" },
  pending: { label: "Pending", dot: "bg-gold", text: "text-warn" },
  failed: { label: "Failed", dot: "bg-danger", text: "text-danger" },
} as const;

/** "Today", "Yesterday", "Mon 2 Nov" — the day a row belongs to. */
function dayLabel(iso: string | null): string {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" });
  const now = new Date();
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(new Date(now.getTime() - 86400000))) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric", timeZone: "Africa/Lagos" });
}

function time(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }) : "";
}

function Kpi({ icon: Icon, title, value, short, hint, tone }: { icon: IconT; title: string; value: string; short?: string; hint: string; tone: "brand" | "gold" | "ink" | "danger" }) {
  const tones = { brand: "bg-brand-soft text-brand", gold: "bg-gold-soft text-warn", ink: "bg-page text-ink", danger: "bg-danger/10 text-danger" };
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line/80 bg-white p-4 shadow-card sm:rounded-[22px] sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className="text-sm font-semibold text-ink">{title}</p>
      </div>
      {/* Phones get "₦25.2M"; wider screens the full amount. */}
      <p className="mt-4 truncate text-2xl font-extrabold tracking-tight tabular-nums text-ink sm:text-[28px]">
        <span className={short ? "sm:hidden" : "hidden"}>{short}</span>
        <span className={short ? "hidden sm:inline" : ""}>{value}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

function Row({ t, onOpen }: { t: ApiTransaction; onOpen: () => void }) {
  const credit = t.direction === "credit";
  const st = STATUS[t.status] ?? STATUS.pending;
  return (
    <tr onClick={onOpen} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", t.status === "failed" ? "bg-danger/10 text-danger" : credit ? "bg-brand-soft text-brand" : "bg-gold-soft text-warn")}>
            {credit ? <IconArrowDownLeft className="h-[18px] w-[18px]" /> : <IconArrowUpRight className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0">
            <p className="max-w-[240px] truncate font-bold text-ink group-hover:text-brand">{t.description || label(t.type)}</p>
            <p className="truncate font-mono text-[11px] text-muted">{t.reference}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <p className="max-w-[180px] truncate font-semibold text-ink">{t.wallet?.owner ?? "—"}</p>
        <p className="max-w-[180px] truncate text-xs text-muted">{t.wallet?.name ?? `Wallet #${t.wallet_id}`}</p>
      </td>
      <td className="px-3 py-3.5">
        <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", credit ? "bg-brand-soft text-brand" : "bg-page text-ink")}>{label(t.type)}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right">
        <p className={cn("font-extrabold tabular-nums", t.status !== "successful" ? "text-muted" : credit ? "text-brand" : "text-ink")}>
          {credit ? "+" : "−"}
          {naira(t.amount)}
        </p>
        {Number(t.fee) > 0 ? <p className="text-[11px] text-muted">fee {naira(t.fee)}</p> : null}
      </td>
      <td className="px-3 py-3.5">
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold", st.text)}>
          <span className={cn("h-2 w-2 rounded-full", st.dot)} />
          {st.label}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-xs text-muted">{time(t.created_at)}</td>
      <td className="px-3 py-3.5">
        <IconChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </td>
    </tr>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [direction, setDirection] = useState("");
  const [period, setPeriod] = useState("");
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
    queryKey: ["admin", "transactions", { status, type, direction, period, search, page }],
    queryFn: () => api<TransactionsData>(`/api/v1/admin/transactions${qs({ status, type, direction, period, search, page })}`),
    placeholderData: (prev) => prev,
  });
  const s = data?.summary;
  const net = Number(s?.net ?? 0);
  const done = s ? s.by_status.successful + s.by_status.failed : 0;
  const rate = done ? Math.round((s!.by_status.successful / done) * 100) : null;
  const reset = (fn: () => void) => () => {
    fn();
    setPage(1);
  };

  return (
    <div className="animate-rise">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Money</p>
        <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">
          Transactions<span className="text-gold">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Every naira moving across Patriai: in, out, waiting and failed.</p>
      </div>

      {/* What the filters match */}
      {s ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <Kpi icon={IconTrendUp} title="Money in" value={naira(s.money_in)} short={compactNaira(Number(s.money_in))} hint="Successful credits" tone="brand" />
          <Kpi icon={IconTrendDown} title="Money out" value={naira(s.money_out)} short={compactNaira(Number(s.money_out))} hint="Successful debits" tone="gold" />
          <Kpi icon={net >= 0 ? IconArrowDownLeft : IconArrowUpRight} title="Net" value={`${net >= 0 ? "+" : "−"}${naira(Math.abs(net))}`} short={`${net >= 0 ? "+" : "−"}${compactNaira(Math.abs(net))}`} hint={Number(s.fees) > 0 ? `${naira(s.fees)} in fees` : "In minus out"} tone="ink" />
          <Kpi
            icon={s.by_status.failed ? IconAlert : IconClock}
            title="Success rate"
            value={rate === null ? "—" : `${rate}%`}
            hint={`${s.by_status.pending.toLocaleString()} pending · ${s.by_status.failed.toLocaleString()} failed`}
            tone={s.by_status.failed ? "danger" : "brand"}
          />
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-[22px]" />
          ))}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-[22px] border border-line/80 bg-white shadow-card">
        <div className="space-y-4 border-b border-line px-5 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-page p-1" role="tablist" aria-label="Status">
              {[{ value: "", label: "All", n: s?.all }, ...(["successful", "pending", "failed"] as const).map((k) => ({ value: k, label: STATUS[k].label, n: s?.by_status[k] }))].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="tab"
                  aria-selected={status === o.value}
                  onClick={reset(() => setStatus(o.value))}
                  className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors", status === o.value ? "bg-navy text-white shadow-sm" : "text-muted hover:text-ink")}
                >
                  {o.label}
                  {o.n !== undefined ? <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", status === o.value ? "bg-white/15" : "bg-white")}>{o.n.toLocaleString()}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-full bg-page p-1" role="tablist" aria-label="Direction">
              {[
                { value: "", label: "In and out" },
                { value: "credit", label: "In" },
                { value: "debit", label: "Out" },
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="tab"
                  aria-selected={direction === o.value}
                  onClick={reset(() => setDirection(o.value))}
                  className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors", direction === o.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={period === p.value}
                  onClick={reset(() => setPeriod(p.value))}
                  className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", period === p.value ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="h-10 w-full rounded-full border border-line bg-page pl-10 pr-4 text-sm text-ink transition-colors placeholder:text-muted/70 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
                placeholder="Search reference, description, wallet or owner"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search transactions"
              />
            </div>
            <select
              value={type}
              onChange={(e) => reset(() => setType(e.target.value))()}
              aria-label="Type"
              className="h-10 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} transaction{data.pagination.total === 1 ? "" : "s"}
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
        ) : data.transactions.length === 0 ? (
          <EmptyState message="No transactions match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Transaction</th>
                    <th className="px-3 py-3 font-semibold">Owner and wallet</th>
                    <th className="px-3 py-3 font-semibold">Type</th>
                    <th className="px-3 py-3 text-right font-semibold">Amount</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Time</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t, i) => {
                    const day = dayLabel(t.created_at);
                    const newDay = i === 0 || dayLabel(data.transactions[i - 1].created_at) !== day;
                    return (
                      <Fragment key={t.id}>
                        {newDay ? (
                          <tr>
                            <td colSpan={7} className="bg-page/70 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                              {day}
                            </td>
                          </tr>
                        ) : null}
                        <Row t={t} onOpen={() => router.push(`/transactions/${t.id}`)} />
                      </Fragment>
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
