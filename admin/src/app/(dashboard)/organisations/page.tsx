"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, naira } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AdminOrganisation, OrganisationsData } from "@/lib/types";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { FormModal } from "@/components/admin/form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconBook, IconBuilding, IconCheckCircle, IconClock, IconHeart, IconSearch, IconUsers } from "@/components/icons";

const KINDS = ["church", "mosque", "charity", "school", "other"] as const;
const CAUSES = ["children", "food", "education", "health", "elderly", "faith"] as const;

type Draft = Omit<AdminOrganisation, "id" | "saved_by" | "owed" | "created_at"> & { id?: number };

const title = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

type IconT = (props: { className?: string }) => React.ReactNode;

/** Each kind's icon and tint. */
const KIND_STYLE: Record<string, { icon: IconT; tile: string; plural: string }> = {
  church: { icon: IconBuilding, tile: "bg-brand-soft text-brand", plural: "Churches" },
  mosque: { icon: IconBuilding, tile: "bg-[#E6F7EF] text-[#14725C]", plural: "Mosques" },
  charity: { icon: IconHeart, tile: "bg-gold-soft text-warn", plural: "Charities" },
  school: { icon: IconBook, tile: "bg-info-soft text-info", plural: "Schools" },
  other: { icon: IconUsers, tile: "bg-page text-muted", plural: "Other" },
};

function Kpi({ icon: Icon, title: name, value, short, hint, tone }: { icon: IconT; title: string; value: string; short?: string; hint: string; tone: "brand" | "gold" | "muted" }) {
  const tones = { brand: "bg-brand-soft text-brand", gold: "bg-gold-soft text-warn", muted: "bg-page text-muted" };
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line/80 bg-white p-4 shadow-card sm:rounded-[22px] sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className="text-sm font-semibold text-ink">{name}</p>
      </div>
      <p className="mt-4 truncate text-2xl font-extrabold tracking-tight tabular-nums text-ink sm:text-[28px]">
        <span className={short ? "sm:hidden" : "hidden"}>{short}</span>
        <span className={short ? "hidden sm:inline" : ""}>{value}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

const EMPTY: Draft = {
  name: "",
  kind: "church",
  cause: null,
  area: "",
  state: "Lagos",
  about: "",
  account_name: "",
  account_number: "",
  bank_code: "",
  bank_name: "",
  verified: false,
  active: true,
};

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{name}</span>
      {children}
    </label>
  );
}

/**
 * Organisations people can give to (GIV-02) and pick for half of an early-break
 * fee (BRK-02). Patriai checks each one and its bank account before marking it
 * verified. Charities' share of early-break fees is owed until it's paid out.
 */
export default function OrganisationsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "organisations"],
    queryFn: () => api<OrganisationsData>("/api/v1/admin/organisations"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "organisations"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? api(`/api/v1/admin/organisations/${d.id}`, { method: "PATCH", body: JSON.stringify(d) })
        : api("/api/v1/admin/organisations", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (_, d) => {
      setDraft(null);
      setToast({ tone: "green", message: d.id ? "Organisation updated." : "Organisation added." });
      refresh();
    },
    onError: (e: Error) => setFormError(e.message),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<AdminOrganisation> }) => api(`/api/v1/admin/organisations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => refresh(),
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });
  const paid = useMutation({
    mutationFn: (id: number) => api<{ message?: string }>(`/api/v1/admin/organisations/${id}/donations/paid`, { method: "POST" }),
    onSuccess: () => {
      setToast({ tone: "green", message: "Marked paid." });
      refresh();
    },
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const [kind, setKind] = useState<"" | (typeof KINDS)[number]>("");
  const [state, setState] = useState("");
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const all = data?.organisations ?? [];
    return {
      total: all.length,
      verified: all.filter((o) => o.verified).length,
      unverified: all.filter((o) => !o.verified).length,
      hidden: all.filter((o) => !o.active).length,
      owed: all.reduce((n, o) => n + (parseFloat(o.owed) || 0), 0),
    };
  }, [data]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.organisations ?? [])
      .filter((o) => !kind || o.kind === kind)
      .filter((o) => (state === "verified" ? o.verified : state === "unverified" ? !o.verified : state === "hidden" ? !o.active : true))
      .filter((o) => !q || [o.name, o.area, o.state, o.account_number, o.account_name, o.bank_name].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [data, kind, state, query]);

  return (
    <div className="animate-rise">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Giving</p>
          <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">
            Organisations<span className="text-gold">.</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Churches, mosques, charities and schools people can give to. Check each one and its account before marking it verified.</p>
        </div>
        <Button
          className="h-10 rounded-full px-5"
          onClick={() => {
            setFormError(null);
            setDraft({ ...EMPTY });
          }}
        >
          + Add organisation
        </Button>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <Kpi icon={IconBuilding} title="Organisations" value={stats.total.toLocaleString()} hint={`${stats.hidden} hidden from people`} tone="brand" />
          <Kpi icon={IconCheckCircle} title="Verified" value={stats.verified.toLocaleString()} hint={stats.total ? `${Math.round((stats.verified / stats.total) * 100)}% checked` : "None yet"} tone="brand" />
          <Kpi icon={IconClock} title="Waiting for a check" value={stats.unverified.toLocaleString()} hint={stats.unverified ? "Check them and their account" : "All checked"} tone={stats.unverified ? "gold" : "muted"} />
          <Kpi icon={IconHeart} title="Owed to charities" value={naira(stats.owed)} short={compactNaira(stats.owed)} hint="Half of early-break fees" tone={stats.owed > 0 ? "gold" : "muted"} />
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-[22px]" />
          ))}
        </div>
      ) : null}

      <div className="mt-5 rounded-[22px] border border-line/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Kind">
            {(["", ...KINDS] as const).map((k) => {
              const n = k ? (data?.organisations ?? []).filter((o) => o.kind === k).length : data?.organisations.length;
              const S = k ? KIND_STYLE[k] : null;
              const on = kind === k;
              return (
                <button
                  key={k || "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k)}
                  className={cn("inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all", on ? "border-navy bg-navy text-white shadow-sm" : "border-line bg-white text-ink hover:border-brand/40 hover:bg-rowhover")}
                >
                  {S ? <S.icon className={cn("h-3.5 w-3.5", on ? "text-[#5FD3A5]" : "text-brand")} /> : null}
                  {S ? S.plural : "All"}
                  {n !== undefined ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums", on ? "bg-white/15" : "bg-page text-muted")}>{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-page p-1" role="tablist" aria-label="Status">
            {[
              { value: "", label: "Any" },
              { value: "verified", label: "Verified" },
              { value: "unverified", label: "Not verified" },
              { value: "hidden", label: "Hidden" },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={state === o.value}
                onClick={() => setState(o.value)}
                className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors", state === o.value ? "bg-navy text-white shadow-sm" : "text-muted hover:text-ink")}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-56 flex-1">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="h-10 w-full rounded-full border border-line bg-page pl-10 pr-4 text-sm text-ink transition-colors placeholder:text-muted/70 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
              placeholder="Search name, area, state or account"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search organisations"
            />
          </div>
        </div>
      </div>

      <div className="mt-5">
        {isPending ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[260px] rounded-[22px]" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-[22px] border border-line bg-white">
            <ErrorState message={error.message} />
          </div>
        ) : data.organisations.length === 0 ? (
          <div className="rounded-[22px] border border-line bg-white">
            <EmptyState message="No organisations yet. Add the first one people can give to." />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-[22px] border border-line bg-white">
            <EmptyState message="No organisations match your filters." />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((o) => {
              const S = KIND_STYLE[o.kind] ?? KIND_STYLE.other;
              const owed = parseFloat(o.owed);
              return (
                <div key={o.id} className={cn("flex flex-col rounded-[22px] border bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover", o.active ? "border-line/80" : "border-dashed border-line-strong/50 opacity-80")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", S.tile)}>
                      <S.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-ink">{o.name}</p>
                      <p className="truncate text-xs text-muted">{[[o.area, o.state].filter(Boolean).join(", "), title(o.kind), o.cause ? title(o.cause) : null].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", o.verified ? "bg-brand-soft text-brand" : "bg-gold-soft text-warn")}>
                      {o.verified ? <IconCheckCircle className="h-3.5 w-3.5" /> : <IconClock className="h-3.5 w-3.5" />}
                      {o.verified ? "Verified" : "To check"}
                    </span>
                  </div>
                  {o.about ? <p className="mt-3 line-clamp-2 text-[13px] text-muted">{o.about}</p> : null}
                  <div className="mt-4 rounded-xl bg-page px-3.5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{o.bank_name}</p>
                    <p className="mt-0.5 font-mono text-[15px] font-bold tracking-wider text-ink">{o.account_number}</p>
                    <p className="truncate text-xs text-muted">{o.account_name}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <IconUsers className="h-3.5 w-3.5" />
                      {o.saved_by ? `Saved by ${o.saved_by}` : "Not saved yet"}
                    </span>
                    {!o.active ? <Badge tone="gray">Hidden</Badge> : null}
                    {o.created_at ? <span>Added {formatDate(o.created_at)}</span> : null}
                  </div>
                  {owed > 0 ? (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft px-3.5 py-2.5">
                      <div>
                        <p className="text-[11px] font-semibold text-warn">Owed from early-break fees</p>
                        <p className="text-sm font-extrabold tabular-nums text-ink">{naira(o.owed)}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={paid.isPending} onClick={() => paid.mutate(o.id)}>
                        Mark paid
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-auto flex justify-end gap-1.5 pt-4">
                    <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: o.id, body: { verified: !o.verified } })}>
                      {o.verified ? "Unverify" : "Mark verified"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFormError(null);
                        setDraft({ ...o });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data && data.donations.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-[22px] border border-line/80 bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="text-[17px] font-bold tracking-tight text-ink">Early-break fees to charities</h2>
              <p className="mt-0.5 text-[13px] text-muted">Half of each early-break fee goes to the charity the saver picked</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-5 py-3 font-semibold">Receipt</th>
                  <th className="px-3 py-3 font-semibold">Charity</th>
                  <th className="px-3 py-3 font-semibold">From</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.donations.map((d) => (
                  <tr key={d.id} className="border-t border-line/70">
                    <td className="px-5 py-3 font-mono text-xs text-muted">{d.receipt_no}</td>
                    <td className="px-3 py-3 font-semibold text-ink">{d.organisation ?? "—"}</td>
                    <td className="px-3 py-3 text-ink">{d.from ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-extrabold tabular-nums text-ink">{naira(d.amount)}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", d.status === "paid" ? "text-brand" : "text-warn")}>
                        <span className={cn("h-2 w-2 rounded-full", d.status === "paid" ? "bg-brand" : "bg-gold")} />
                        {d.status === "paid" ? "Paid" : "Owed"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{formatDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {draft ? (
        <FormModal
          title={draft.id ? `Edit ${draft.name}` : "Add an organisation"}
          description="People see it when they search for who to give to. Mark it verified only after you have checked it and its account."
          error={formError}
          busy={save.isPending}
          submitLabel={draft.id ? "Save" : "Add"}
          submitDisabled={!draft.name.trim() || draft.account_number.length !== 10 || !draft.bank_code.trim() || !draft.bank_name.trim() || !draft.account_name.trim()}
          onSubmit={() => {
            setFormError(null);
            save.mutate({ ...draft, cause: draft.kind === "charity" ? draft.cause : null });
          }}
          onClose={() => setDraft(null)}
        >
          <Field name="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Grace Parish Church" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field name="Kind">
              <Select className="w-full" value={draft.kind} onChange={(e) => set({ kind: e.target.value as Draft["kind"] })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {title(k)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="Cause (charities)">
              <Select className="w-full" value={draft.cause ?? ""} disabled={draft.kind !== "charity"} onChange={(e) => set({ cause: e.target.value || null })}>
                <option value="">—</option>
                {CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {title(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="Area">
              <Input value={draft.area ?? ""} onChange={(e) => set({ area: e.target.value })} placeholder="Ikeja" />
            </Field>
            <Field name="State">
              <Input value={draft.state ?? ""} onChange={(e) => set({ state: e.target.value })} placeholder="Lagos" />
            </Field>
          </div>
          <Field name="About (optional)">
            <Input value={draft.about ?? ""} onChange={(e) => set({ about: e.target.value })} placeholder="A home for 38 children in Surulere" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field name="Account number">
              <Input value={draft.account_number} inputMode="numeric" maxLength={10} onChange={(e) => set({ account_number: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
            </Field>
            <Field name="Bank code">
              <Input value={draft.bank_code} onChange={(e) => set({ bank_code: e.target.value })} placeholder="058" />
            </Field>
            <Field name="Bank name">
              <Input value={draft.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder="GTBank" />
            </Field>
            <Field name="Account name">
              <Input value={draft.account_name} onChange={(e) => set({ account_name: e.target.value })} placeholder="GRACE PARISH CHURCH" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.verified} onChange={(e) => set({ verified: e.target.checked })} />
            Checked — show it as verified
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
            Show it to people (untick to hide it)
          </label>
        </FormModal>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
