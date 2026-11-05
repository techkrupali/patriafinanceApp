"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, naira } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AdminPlan, PlanFeatureRow, PlansData } from "@/lib/types";
import { ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { FormModal } from "@/components/admin/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile, PageTitle, PANEL } from "@/components/list-kit";
import { IconAlert, IconCheckCircle, IconClock, IconTrendUp, IconUsers } from "@/components/icons";

type Draft = {
  id: number;
  is_free: boolean;
  name: string;
  covers: string;
  monthly_price: string;
  yearly_price: string;
  trial_days: string;
  active: boolean;
  wallets: string;
  shared_wallets: string;
  rules: string;
};

const LIMITS: { key: "wallets" | "shared_wallets" | "rules"; label: string }[] = [
  { key: "wallets", label: "Wallets" },
  { key: "shared_wallets", label: "Shared wallets" },
  { key: "rules", label: "Rules" },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  trialing: { label: "Free trial", cls: "bg-info-soft text-info" },
  active: { label: "Paying", cls: "bg-brand-soft text-brand" },
  past_due: { label: "Payment failed", cls: "bg-danger/10 text-danger" },
  expired: { label: "Ended", cls: "bg-page text-muted" },
};

function Field({ name, hint, children }: { name: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{name}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

const limitText = (v: number | null) => (v === null ? "No limit" : v.toLocaleString());
const num = (v: string) => (v.trim() === "" ? null : Number(v));

/**
 * PLN-01…04 from the admin side. Each plan's prices, free trial and limits,
 * the "Free · Pro" rows people compare in the app, whether Free's limits hold,
 * and every family that pays. Everything here is what the app shows.
 */
export default function PlansPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const [rows, setRows] = useState<PlanFeatureRow[] | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => api<PlansData>("/api/v1/admin/plans"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
  // The comparison as saved, until it's edited here.
  const list = rows ?? data?.features ?? [];

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api(`/api/v1/admin/plans/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: d.name,
          covers: d.covers || null,
          ...(d.is_free ? {} : { monthly_price: d.monthly_price || "0", yearly_price: d.yearly_price || "0", trial_days: Number(d.trial_days || 0), active: d.active }),
          limits: { wallets: num(d.wallets), shared_wallets: num(d.shared_wallets), rules: num(d.rules) },
        }),
      }),
    onSuccess: () => {
      setDraft(null);
      setToast({ tone: "green", message: "Plan saved. The app shows it now." });
      refresh();
    },
    onError: (e: Error) => setFormError(e.message),
  });
  const saveRows = useMutation({
    mutationFn: (r: PlanFeatureRow[]) => api("/api/v1/admin/plans/features", { method: "PUT", body: JSON.stringify({ rows: r }) }),
    onSuccess: () => {
      setToast({ tone: "green", message: "Comparison saved. The app shows it now." });
      setRows(null);
      refresh();
    },
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });
  const enforce = useMutation({
    mutationFn: (on: boolean) => api("/api/v1/admin/plans/settings", { method: "PATCH", body: JSON.stringify({ enforce: on }) }),
    onSuccess: (_, on) => {
      setToast({ tone: "green", message: on ? "Free limits are on." : "Free limits are off." });
      refresh();
    },
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });

  const edit = (p: AdminPlan) => {
    setFormError(null);
    setDraft({
      id: p.id,
      is_free: p.is_free,
      name: p.name,
      covers: p.covers ?? "",
      monthly_price: String(Number(p.monthly_price)),
      yearly_price: String(Number(p.yearly_price)),
      trial_days: String(p.trial_days),
      active: p.active,
      wallets: p.limits.wallets?.toString() ?? "",
      shared_wallets: p.limits.shared_wallets?.toString() ?? "",
      rules: p.limits.rules?.toString() ?? "",
    });
  };
  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setRow = (i: number, p: Partial<PlanFeatureRow>) => setRows(list.map((row, j) => (j === i ? { ...row, ...p } : row)));
  const move = (i: number, by: number) => {
    const next = [...list];
    const [row] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, row);
    setRows(next);
  };
  const dirty = data && rows ? JSON.stringify(rows) !== JSON.stringify(data.features) : false;
  const s = data?.summary;
  const plans = data?.plans ?? [];

  if (isError) {
    return (
      <div className="rounded-[22px] border border-line bg-white">
        <ErrorState message={error.message} />
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Money" title="Plans" subtitle="Prices, the free trial, limits and what each plan gives. The app shows exactly this." />

      {s ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <KpiTile icon={IconUsers} label="Paying families" value={s.paying.toLocaleString()} hint={`${naira(s.paid_30d)} in the last 30 days`} tone="brand" />
          <KpiTile icon={IconClock} label="On a free trial" value={s.trials.toLocaleString()} hint="Pay when the trial ends" tone="info" />
          <KpiTile icon={IconTrendUp} label="Monthly revenue" value={naira(s.mrr)} hint="Yearly plans counted by the month" tone="muted" />
          <KpiTile icon={IconAlert} label="Payment failed" value={s.past_due.toLocaleString()} hint={`${s.cancelling} cancelling`} tone={s.past_due ? "danger" : "muted"} />
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-[22px]" />
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isPending
          ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[260px] rounded-[22px]" />)
          : plans.map((p) => (
              <div key={p.id} className={cn("flex flex-col rounded-[22px] border bg-white p-5 shadow-card", p.is_free ? "border-line/80" : "border-brand/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-extrabold text-ink">{p.name}</p>
                    <p className="text-xs text-muted">{p.is_free ? "Everyone starts here" : p.covers ? `Covers the ${p.covers}` : "One family per subscription"}</p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", p.active ? "bg-brand-soft text-brand" : "bg-gold-soft text-warn")}>
                    {p.active ? <IconCheckCircle className="h-3.5 w-3.5" /> : <IconClock className="h-3.5 w-3.5" />}
                    {p.active ? (p.is_free ? "Always on" : "On sale") : "Off — the app says coming soon"}
                  </span>
                </div>
                {p.is_free ? (
                  <p className="mt-4 text-[28px] font-extrabold tracking-tight text-ink">₦0</p>
                ) : (
                  <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
                    <div>
                      <p className="text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-ink">{naira(p.yearly_price)}</p>
                      <p className="mt-1 text-xs text-muted">a year{p.yearly_saves_months ? ` · ${p.yearly_saves_months} months free` : ""}</p>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold leading-none tabular-nums text-ink">{naira(p.monthly_price)}</p>
                      <p className="mt-1 text-xs text-muted">a month</p>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold leading-none tabular-nums text-ink">{p.trial_days ? `${p.trial_days} days` : "None"}</p>
                      <p className="mt-1 text-xs text-muted">free trial</p>
                    </div>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {LIMITS.map((l) => (
                    <div key={l.key} className="rounded-xl bg-page px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-muted">{l.label}</p>
                      <p className="text-sm font-bold text-ink">{limitText(p.limits[l.key])}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <p className="text-xs text-muted">{p.is_free ? "" : `${p.families} famil${p.families === 1 ? "y" : "ies"} on it now`}</p>
                  <Button size="sm" variant="outline" onClick={() => edit(p)}>
                    Edit
                  </Button>
                </div>
              </div>
            ))}
      </div>

      {data ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-line/80 bg-white p-5 shadow-card">
          <div className="max-w-2xl">
            <p className="text-[15px] font-bold text-ink">Hold families on Free to Free&apos;s limits</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {data.enforce
                ? "On: a family on Free can't make more wallets or rules than Free allows. They see “You've used your free rules” with See Pro."
                : "Off: Free's limits are only shown in the comparison. Nobody is stopped. Turn on when Pro is ready."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.enforce}
            aria-label="Hold families on Free to Free's limits"
            disabled={enforce.isPending}
            onClick={() => enforce.mutate(!data.enforce)}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", data.enforce ? "bg-brand" : "bg-line-strong/60")}
          >
            <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", data.enforce ? "left-6" : "left-1")} />
          </button>
        </div>
      ) : null}

      <div className={PANEL}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-ink">What each plan gives</h2>
            <p className="mt-0.5 text-[13px] text-muted">The rows people compare on “Plans” in the app, in this order</p>
          </div>
          <div className="flex gap-2">
            {dirty ? (
              <Button size="sm" variant="ghost" onClick={() => setRows(null)}>
                Undo changes
              </Button>
            ) : null}
            <Button size="sm" disabled={!dirty || saveRows.isPending || list.some((r) => !r.label.trim())} onClick={() => saveRows.mutate(list)}>
              Save comparison
            </Button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-5 py-2 font-semibold">Row</th>
                {plans.map((p) => (
                  <th key={p.slug} className="px-3 py-2 font-semibold">
                    {p.name}
                  </th>
                ))}
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className="border-t border-line/70">
                  <td className="px-5 py-2">
                    <Input aria-label={`Row ${i + 1} name`} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="Wallets" />
                  </td>
                  {plans.map((p) => (
                    <td key={p.slug} className="px-3 py-2">
                      <Input
                        aria-label={`${r.label || `Row ${i + 1}`} on ${p.name}`}
                        value={r.values[p.slug] ?? ""}
                        onChange={(e) => setRow(i, { values: { ...r.values, [p.slug]: e.target.value } })}
                        placeholder={p.is_free ? "Up to 3" : "Up to 20"}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-5 py-2 text-right">
                    <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Remove row" onClick={() => setRows(list.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4">
          <Button size="sm" variant="outline" onClick={() => setRows([...list, { label: "", values: {} }])}>
            + Add a row
          </Button>
        </div>
      </div>

      <div className={PANEL}>
        <div className="px-5 pt-5">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">Families on a paid plan</h2>
          <p className="mt-0.5 text-[13px] text-muted">Trials, payments and who&apos;s cancelling</p>
        </div>
        {data && data.subscriptions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Nobody has started a paid plan yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-5 py-3 font-semibold">Paid by</th>
                  <th className="px-3 py-3 font-semibold">Plan</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Price</th>
                  <th className="px-3 py-3 font-semibold">Next payment</th>
                  <th className="px-3 py-3 font-semibold">From</th>
                  <th className="px-3 py-3 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody>
                {(data?.subscriptions ?? []).map((sub) => {
                  const st = STATUS[sub.status] ?? STATUS.expired;
                  return (
                    <tr key={sub.id} className="border-t border-line/70">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-ink">{sub.user.name ?? "—"}</p>
                        <p className="text-xs text-muted">{`${sub.family} in the family`}</p>
                      </td>
                      <td className="px-3 py-3 text-ink">{`${sub.plan ?? "—"} · ${sub.interval}`}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", st.cls)}>{sub.cancelling && sub.status !== "expired" ? "Cancelling" : st.label}</span>
                        {sub.failure ? <p className="mt-1 max-w-[220px] text-xs text-danger">{sub.failure}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-right font-extrabold tabular-nums text-ink">{naira(sub.price)}</td>
                      <td className="px-3 py-3 text-xs text-ink">{sub.next_at ? formatDate(sub.next_at) : "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted">{sub.paid_from ?? "—"}</td>
                      <td className="px-3 py-3 text-xs text-muted">{formatDate(sub.started_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft ? (
        <FormModal
          title={`Edit ${draft.name || "plan"}`}
          description={draft.is_free ? "Free is always on. Its limits hold only when “Hold families on Free” is on." : "People see these prices in the app. Turn the plan on only when the prices are right."}
          error={formError}
          busy={save.isPending}
          submitLabel="Save"
          submitDisabled={!draft.name.trim() || [draft.wallets, draft.shared_wallets, draft.rules].some((v) => v.trim() !== "" && !/^\d+$/.test(v.trim()))}
          onSubmit={() => {
            setFormError(null);
            save.mutate(draft);
          }}
          onClose={() => setDraft(null)}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field name="Name">
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Pro" />
            </Field>
            <Field name="Who it covers" hint="Shown as “a year, whole family”">
              <Input value={draft.covers} onChange={(e) => set({ covers: e.target.value })} placeholder="whole family" />
            </Field>
          </div>
          {draft.is_free ? null : (
            <div className="grid grid-cols-3 gap-3">
              <Field name="Monthly price (₦)">
                <Input value={draft.monthly_price} inputMode="decimal" onChange={(e) => set({ monthly_price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="2500" />
              </Field>
              <Field name="Yearly price (₦)" hint={Number(draft.monthly_price) > 0 && Number(draft.yearly_price) > 0 ? `${Math.max(0, Math.round(12 - Number(draft.yearly_price) / Number(draft.monthly_price)))} months free` : undefined}>
                <Input value={draft.yearly_price} inputMode="decimal" onChange={(e) => set({ yearly_price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="25000" />
              </Field>
              <Field name="Free trial (days)" hint="0 for none">
                <Input value={draft.trial_days} inputMode="numeric" onChange={(e) => set({ trial_days: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="30" />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {LIMITS.map((l) => (
              <Field key={l.key} name={l.label} hint="Empty: no limit">
                <Input value={draft[l.key]} inputMode="numeric" onChange={(e) => set({ [l.key]: e.target.value.replace(/\D/g, "") } as Partial<Draft>)} placeholder="No limit" />
              </Field>
            ))}
          </div>
          {draft.is_free ? null : (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
              On sale — people can start it in the app
            </label>
          )}
        </FormModal>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
