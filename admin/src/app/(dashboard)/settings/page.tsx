"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { naira } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/** A verification tier from kyc_tiers (kobo; null = no limit). The app reads the same. */
interface Tier {
  tier: number;
  name: string;
  needs: string;
  description: string | null;
  daily: number | null;
  single: number | null;
  max_balance: number | null;
  max_wallets: number;
  shared_wallets: boolean;
  loan_cap: number;
  users: number;
  pending: number;
  /** Tiers 1–3 have their own steps in the app and can't be removed. */
  base: boolean;
  updated_at: string | null;
}

interface SystemSettings {
  min_app_version: string;
  latest_app_version: string;
  maintenance: { on: boolean; until: string | null; message: string | null };
  support_phone: string | null;
  tiers: Tier[];
}

/**
 * Platform switches (SYS-02 Update required, SYS-03 Maintenance) and the
 * support phone the app shows on Help; and the verification tiers (ME-23):
 * change a tier's limits or add a new tier, and the app shows it.
 */
export default function SettingsPage() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const { data, isPending, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "system-settings"],
    queryFn: () => api<SystemSettings>("/api/v1/admin/system-settings"),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Settings" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Maintenance, app version, support phone and limits" />
      {isPending || !data ? <Skeleton className="h-48 w-full" /> : <SettingsForm key={dataUpdatedAt} data={data} onToast={setToast} />}
      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}

function SettingsForm({ data, onToast }: { data: SystemSettings; onToast: (t: ToastState) => void }) {
  const qc = useQueryClient();
  const [minVersion, setMinVersion] = useState(data.min_app_version);
  const [latest, setLatest] = useState(data.latest_app_version);
  const [phone, setPhone] = useState(data.support_phone ?? "");
  const [until, setUntil] = useState(data.maintenance.until ?? "");
  const [message, setMessage] = useState(data.maintenance.message ?? "");
  const [confirmMaintenance, setConfirmMaintenance] = useState<boolean | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<SystemSettings>("/api/v1/admin/system-settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      setConfirmMaintenance(null);
      onToast({ tone: "green", message: "Saved." });
      qc.invalidateQueries({ queryKey: ["admin", "system-settings"] });
    },
    onError: (err: Error) => {
      setConfirmMaintenance(null);
      onToast({ tone: "red", message: err.message });
    },
  });
  const on = data.maintenance.on;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Maintenance</CardTitle>
            <Badge tone={on ? "amber" : "green"}>{on ? "On" : "Off"}</Badge>
          </CardHeader>
          <CardContent>
            {(
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  While on, sending, withdrawals and approvals stop with &ldquo;We&apos;re upgrading Patriai&rdquo;. Money still comes in, and the app opens on the maintenance screen.
                </p>
                <label className="block text-sm font-medium text-ink">
                  Back by
                  <Input className="mt-1" value={until} onChange={(e) => setUntil(e.target.value)} placeholder="2:00 am" />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Note (optional)
                  <Input className="mt-1" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Upgrading the payments system" />
                </label>
                <Button variant={on ? "primary" : "danger"} onClick={() => setConfirmMaintenance(!on)}>
                  {on ? "Turn maintenance off" : "Turn maintenance on"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>App version and support</CardTitle>
          </CardHeader>
          <CardContent>
            {(
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({ min_app_version: minVersion, latest_app_version: latest, support_phone: phone.trim() || null });
                }}
              >
                <label className="block text-sm font-medium text-ink">
                  Minimum app version
                  <Input className="mt-1" value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="1.0.0" />
                  <span className="mt-1 block text-xs text-muted">Older apps show &ldquo;Time to update&rdquo; and can&apos;t go further.</span>
                </label>
                <label className="block text-sm font-medium text-ink">
                  Latest app version
                  <Input className="mt-1" value={latest} onChange={(e) => setLatest(e.target.value)} placeholder="1.0.0" />
                </label>
                <label className="block text-sm font-medium text-ink">
                  Support phone
                  <Input className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 700 000 0000" />
                  <span className="mt-1 block text-xs text-muted">Shown on Help as &ldquo;Call us · 8 am to 8 pm&rdquo;.</span>
                </label>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Tiers tiers={data.tiers} onToast={onToast} />

      <ConfirmDialog
        open={confirmMaintenance !== null}
        danger={confirmMaintenance === true}
        title={confirmMaintenance ? "Turn maintenance on?" : "Turn maintenance off?"}
        message={confirmMaintenance ? "Everyone's sending, withdrawals and approvals stop until you turn it off. Money still comes in." : "Sending, withdrawals and approvals work again."}
        confirmLabel={confirmMaintenance ? "Turn on" : "Turn off"}
        busy={save.isPending}
        onConfirm={() => save.mutate({ maintenance: { on: Boolean(confirmMaintenance), until: until.trim() || null, message: message.trim() || null } })}
        onCancel={() => setConfirmMaintenance(null)}
      />
    </>
  );
}

/** "₦50,000" or "No limit". */
function limit(kobo: number | null): string {
  return kobo === null ? "No limit" : naira(kobo / 100);
}

/** Settings → Verification tiers: the app's limits, what each tier asks for, and adding one. */
function Tiers({ tiers, onToast }: { tiers: Tier[]; onToast: (t: ToastState) => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Tier | "new" | null>(null);
  const [removing, setRemoving] = useState<Tier | null>(null);
  const top = tiers[tiers.length - 1];
  const done = (message: string) => {
    onToast({ tone: "green", message });
    qc.invalidateQueries({ queryKey: ["admin", "system-settings"] });
  };
  const remove = useMutation({
    mutationFn: (level: number) => api<{ tiers: Tier[] }>(`/api/v1/admin/tiers/${level}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      done("Tier removed.");
    },
    onError: (err: Error) => {
      setRemoving(null);
      onToast({ tone: "red", message: err.message });
    },
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <div>
          <CardTitle>Verification tiers</CardTitle>
          <p className="mt-0.5 text-xs text-muted">What each tier can send and hold. Changes show in the app straight away.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add a tier
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.tier} className="flex flex-col rounded-2xl border border-line bg-white p-4 transition-shadow hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-extrabold text-brand">{t.tier}</span>
                    <p className="truncate text-[15px] font-bold text-ink">{t.name}</p>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">Needs: {t.needs}</p>
                </div>
                <Badge tone={t.base ? "gray" : "blue"}>{t.base ? "Built in" : "Added"}</Badge>
              </div>
              {t.description ? <p className="mt-2 text-xs text-muted">{t.description}</p> : null}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-page p-3 text-xs">
                <div>
                  <dt className="text-muted">Send a day</dt>
                  <dd className="font-bold tabular-nums text-ink">{limit(t.daily)}</dd>
                </div>
                <div>
                  <dt className="text-muted">One payment</dt>
                  <dd className="font-bold tabular-nums text-ink">{limit(t.single)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Hold up to</dt>
                  <dd className="font-bold tabular-nums text-ink">{limit(t.max_balance)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Wallets</dt>
                  <dd className="font-bold text-ink">
                    {t.max_wallets}
                    {t.shared_wallets ? " · shared" : ""}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted">Loans up to</dt>
                  <dd className="font-bold tabular-nums text-ink">{t.loan_cap ? naira(t.loan_cap / 100) : "No loans"}</dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {t.users.toLocaleString()} customer{t.users === 1 ? "" : "s"}
                  {t.pending ? ` · ${t.pending} asking` : ""}
                </span>
                <div className="flex gap-1.5">
                  {!t.base && t.tier === top?.tier ? (
                    <Button size="sm" variant="ghost" className="!text-danger hover:!bg-danger/10" onClick={() => setRemoving(t)}>
                      Remove
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Tiers 1 to 3 have their own steps in the app (BVN; NIN and a selfie; ID and address). A tier you add is asked for in the app with a note and documents, and lands in the KYC queue for your team to check. New accounts start on Tier 1&apos;s limits.
        </p>
      </CardContent>

      {editing ? (
        <TierDialog
          tier={editing === "new" ? null : editing}
          next={(top?.tier ?? 3) + 1}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            done(m);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        danger
        title={removing ? `Remove ${removing.name}?` : ""}
        message="It disappears from the app. Nobody is on it and nobody is asking for it."
        confirmLabel="Remove"
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.tier)}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

/** Add or edit one tier. Money in naira; empty = no limit. */
function TierDialog({ tier, next, onClose, onSaved }: { tier: Tier | null; next: number; onClose: () => void; onSaved: (message: string) => void }) {
  const kn = (k: number | null | undefined) => (k === null || k === undefined ? "" : String(k / 100));
  const [name, setName] = useState(tier?.name ?? `Tier ${next}`);
  const [needs, setNeeds] = useState(tier?.needs ?? "");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [daily, setDaily] = useState(kn(tier?.daily ?? null));
  const [single, setSingle] = useState(kn(tier?.single ?? null));
  const [balance, setBalance] = useState(kn(tier?.max_balance ?? null));
  const [wallets, setWallets] = useState(String(tier?.max_wallets ?? 20));
  const [shared, setShared] = useState(tier?.shared_wallets ?? true);
  const [loan, setLoan] = useState(kn(tier?.loan_cap ?? 0));
  const [error, setError] = useState<string | null>(null);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9.]/g, "")));

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ tiers: Tier[] }>(tier ? `/api/v1/admin/tiers/${tier.tier}` : "/api/v1/admin/tiers", { method: tier ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => onSaved(tier ? `${name} saved.` : `${name} added. It shows in the app now.`),
    onError: (err: Error) => setError(err.message),
  });

  const money = (labelText: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="block text-sm font-medium text-ink">
      {labelText}
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">₦</span>
        <Input className="pl-7" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder="No limit" />
      </div>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-label={tier ? `Edit ${tier.name}` : "Add a tier"} onClick={save.isPending ? undefined : onClose}>
      <form
        className="animate-pop max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (needs.trim().length < 3) return setError("Say what a person needs for this tier.");
          save.mutate({
            name: name.trim(),
            needs: needs.trim(),
            description: description.trim() || null,
            daily: num(daily),
            single: num(single),
            max_balance: num(balance),
            max_wallets: Number(wallets) || 1,
            shared_wallets: shared,
            loan_cap: num(loan) ?? 0,
          });
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-base font-extrabold text-brand">{tier?.tier ?? next}</span>
          <div>
            <h3 className="text-base font-bold text-ink">{tier ? `Edit ${tier.name}` : `Add Tier ${next}`}</h3>
            <p className="text-xs text-muted">{tier ? "The app shows the new limits straight away." : "It sits above the highest tier. People ask for it in the app."}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={`Tier ${next}`} />
          </label>
          <label className="block text-sm font-medium text-ink">
            What they need
            <Input className="mt-1" value={needs} onChange={(e) => setNeeds(e.target.value)} maxLength={200} placeholder="CAC certificate and a director's ID" />
          </label>
          <label className="block text-sm font-medium text-ink sm:col-span-2">
            Line in the app (optional)
            <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="For family businesses that move big money." />
          </label>
          {money("Send a day", daily, setDaily, "Empty means no limit")}
          {money("One payment", single, setSingle, "Up to the daily limit")}
          {money("Hold up to (Main)", balance, setBalance, "Empty means no limit")}
          {money("Loans up to", loan, setLoan, "0 means no loans")}
          <label className="block text-sm font-medium text-ink">
            Wallets
            <Input className="mt-1" inputMode="numeric" value={wallets} onChange={(e) => setWallets(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[#0B5D4B]" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Shared family wallets
          </label>
        </div>

        {error ? <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : tier ? "Save tier" : "Add tier"}
          </Button>
        </div>
      </form>
    </div>
  );
}
