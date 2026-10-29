"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime, label, naira } from "@/lib/format";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SecureFile } from "@/components/secure-file";
import type { ToastState } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface SecurityData {
  two_factor: { on: boolean; method: string | null };
  score: { done: number; total: number; label: string; checks: Record<string, boolean> };
  pin_changed_at: string | null;
  pin_locked_until: string | null;
  pin_reset_hold_until: string | null;
  frozen_at: string | null;
  closed_at: string | null;
  settings: Record<string, unknown>;
  limits: {
    tier: number;
    daily: string;
    left_today: string;
    sent_today: string;
    single: string;
    max_balance: string | null;
    main_balance: string;
    max_wallets: number;
    wallets: number;
  };
  devices: {
    id: number;
    name: string;
    platform: string | null;
    ip: string | null;
    trusted: boolean;
    trusted_at: string | null;
    send_after: string | null;
    last_active_at: string | null;
    selfie: boolean;
  }[];
  logins: { id: number; at: string; status: string; reason: string | null; device: string; ip: string | null; new_device: boolean }[];
}

type Action = { key: "unlock-pin" | "unfreeze" | "lift-holds"; title: string; message: string; confirm: string };

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/**
 * A person's protections (client sheet "Settings, log in, system states"):
 * PIN lock, holds after a new phone or a PIN reset, a frozen account, two-step,
 * today's limits, trusted devices with their selfies, and the login history.
 */
export function UserSecurity({ userId, onToast }: { userId: string; onToast: (t: ToastState) => void }) {
  const qc = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [selfie, setSelfie] = useState<number | "unfreeze" | null>(null);
  const { data, isPending, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "user", userId, "security"],
    queryFn: () => api<SecurityData>(`/api/v1/admin/users/${userId}/security`),
  });

  const run = useMutation({
    mutationFn: (path: string) => api(`/api/v1/admin/users/${userId}/${path}`, { method: "POST" }),
    onSuccess: (_r, path) => {
      setAction(null);
      onToast({ tone: "green", message: path.startsWith("devices") ? "Device logged out." : path === "unlock-pin" ? "PIN unlocked." : path === "unfreeze" ? "Account unfrozen." : "Holds lifted." });
      qc.invalidateQueries({ queryKey: ["admin", "user", userId] });
    },
    onError: (err: Error) => {
      setAction(null);
      onToast({ tone: "red", message: err.message });
    },
  });

  const s = data;
  const now = dataUpdatedAt; // when these holds were read
  const future = (iso: string | null) => Boolean(iso && new Date(iso).getTime() > now);
  // A logged-out phone's hold doesn't matter: signing in again starts a new one.
  const deviceHolds = s ? s.devices.filter((d) => d.trusted && future(d.send_after)) : [];
  const holds = s && (future(s.pin_reset_hold_until) || deviceHolds.length > 0);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          {s ? <Badge tone={s.frozen_at ? "red" : s.score.done >= 4 ? "green" : "amber"}>{s.frozen_at ? "Frozen" : `${s.score.label} · ${s.score.done}/${s.score.total}`}</Badge> : null}
        </CardHeader>
        <CardContent>
          {isPending || !s ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-y-4">
              <Field name="PIN">
                {s.pin_locked_until ? <Badge tone="red">Locked until {formatDateTime(s.pin_locked_until)}</Badge> : "Not locked"}
                <span className="block text-xs font-normal text-muted">Changed {s.pin_changed_at ? formatDateTime(s.pin_changed_at) : "— (since sign-up)"}</span>
              </Field>
              <Field name="Two-step">{s.two_factor.on ? label(s.two_factor.method ?? "") : "Off"}</Field>
              <Field name="Frozen by the person">
                {s.frozen_at ? formatDateTime(s.frozen_at) : "No"}
              </Field>
              <Field name="24-hour holds">
                {future(s.pin_reset_hold_until) ? `After PIN reset, until ${formatDateTime(s.pin_reset_hold_until)}` : null}
                {deviceHolds.map((d) => (
                  <span key={d.id} className="block">New device {d.name}, until {formatDateTime(d.send_after)}</span>
                ))}
                {!holds ? "None" : null}
              </Field>
              <Field name="App lock and privacy">
                <span className="block text-xs font-normal text-muted">
                  App lock after {Number(s.settings.lock_after ?? 1) === 0 ? "leaving the app" : `${s.settings.lock_after ?? 1} min`} · Steward reads transactions {s.settings.steward_reads_transactions === false ? "no" : "yes"} · Partner offers {s.settings.partner_offers ? "yes" : "no"}
                </span>
              </Field>
              <div className="flex flex-wrap gap-2 pt-1">
                {s.pin_locked_until ? (
                  <Button variant="outline" onClick={() => setAction({ key: "unlock-pin", title: "Unlock this PIN?", message: "Only after checking it's really them (a call to the phone on file). Their wrong-PIN count starts again.", confirm: "Unlock PIN" })}>
                    Unlock PIN
                  </Button>
                ) : null}
                {s.frozen_at ? (
                  <Button variant="primary" onClick={() => setAction({ key: "unfreeze", title: "Unfreeze this account?", message: "Only when the person can't take a selfie themselves and you've confirmed it's them. Payments and rules work again.", confirm: "Unfreeze" })}>
                    Unfreeze
                  </Button>
                ) : null}
                {holds ? (
                  <Button variant="outline" onClick={() => setAction({ key: "lift-holds", title: "Lift the 24-hour holds?", message: "New devices and a fresh PIN reset can send at once. Do this only after confirming it's them.", confirm: "Lift holds" })}>
                    Lift holds
                  </Button>
                ) : null}
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Limits today</CardTitle>
          {s ? <Badge tone="blue">Tier {s.limits.tier}</Badge> : null}
        </CardHeader>
        <CardContent>
          {isPending || !s ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <Field name="Send a day">{naira(s.limits.daily)}</Field>
              <Field name="Sent today">{naira(s.limits.sent_today)}</Field>
              <Field name="Left today">{naira(s.limits.left_today)}</Field>
              <Field name="One payment">{naira(s.limits.single)}</Field>
              <Field name="Hold up to">{s.limits.max_balance ? naira(s.limits.max_balance) : "No limit"}</Field>
              <Field name="Main has">{naira(s.limits.main_balance)}</Field>
              <Field name="Wallets">{s.limits.wallets} of {s.limits.max_wallets}</Field>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Devices</CardTitle>
          <span className="text-xs text-muted">New devices send after 24 hours</span>
        </CardHeader>
        {isPending || !s ? (
          <TableSkeleton rows={3} cols={5} />
        ) : s.devices.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">No devices yet.</p>
          </CardContent>
        ) : (
          <Table containerClassName="pb-2">
            <THead>
              <tr>
                <TH>Device</TH>
                <TH>Trusted</TH>
                <TH>Last active</TH>
                <TH>IP</TH>
                <TH>Selfie</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {s.devices.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <span className="font-medium text-ink">{d.name}</span>
                    <span className="block text-xs text-muted">{d.platform ?? "—"}{d.trusted && future(d.send_after) ? ` · sends from ${formatDateTime(d.send_after)}` : ""}</span>
                  </TD>
                  <TD>{d.trusted ? <Badge tone="green">Trusted</Badge> : <Badge tone="gray">Logged out</Badge>}</TD>
                  <TD className="text-muted">{formatDateTime(d.last_active_at)}</TD>
                  <TD className="font-mono text-xs text-muted">{d.ip ?? "—"}</TD>
                  <TD>
                    {d.selfie ? (
                      <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setSelfie(selfie === d.id ? null : d.id)}>
                        {selfie === d.id ? "Hide" : "View"}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                    {selfie === d.id ? <div className="mt-2"><SecureFile url={`/api/v1/admin/devices/${d.id}/selfie`} name="selfie" /></div> : null}
                  </TD>
                  <TD className="text-right">
                    {d.trusted ? (
                      <Button variant="outline" onClick={() => run.mutate(`devices/${d.id}/logout`)} disabled={run.isPending}>
                        Log out
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Login history</CardTitle>
          <span className="text-xs text-muted">Latest 50</span>
        </CardHeader>
        {isPending || !s ? (
          <TableSkeleton rows={4} cols={4} />
        ) : s.logins.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted">No sign-ins recorded yet.</p>
          </CardContent>
        ) : (
          <Table containerClassName="pb-2">
            <THead>
              <tr>
                <TH>When</TH>
                <TH>Result</TH>
                <TH>Device</TH>
                <TH>IP</TH>
              </tr>
            </THead>
            <TBody>
              {s.logins.map((l) => (
                <TR key={l.id}>
                  <TD className="text-muted">{formatDateTime(l.at)}</TD>
                  <TD>
                    <Badge tone={l.status === "ok" ? "green" : "red"}>{l.status === "ok" ? "OK" : label(l.status)}</Badge>
                    {l.reason ? <span className="ml-2 text-xs text-muted">{label(l.reason)}</span> : null}
                  </TD>
                  <TD>
                    {l.device}
                    {l.new_device ? <span className="ml-2 text-xs text-muted">new device</span> : null}
                  </TD>
                  <TD className="font-mono text-xs text-muted">{l.ip ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={action !== null}
        danger={false}
        title={action?.title ?? ""}
        message={action?.message ?? ""}
        confirmLabel={action?.confirm ?? ""}
        busy={run.isPending}
        onConfirm={() => action && run.mutate(action.key)}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}
