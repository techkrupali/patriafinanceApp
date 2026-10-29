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
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface Tier {
  tier: number;
  daily: number;
  single: number;
  max_balance: number | null;
  max_wallets: number;
  shared_wallets: boolean;
  needs: string;
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
 * support phone the app shows on Help; the verification tiers' limits (ME-23),
 * which are set in code and shown here for reference.
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

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Verification tiers</CardTitle>
          <span className="text-xs text-muted">Set in code (CBN tiered KYC); new accounts start on Tier 1 limits</span>
        </CardHeader>
        {(
          <Table containerClassName="pb-2">
            <THead>
              <tr>
                <TH>Tier</TH>
                <TH>Needs</TH>
                <TH className="text-right">Send a day</TH>
                <TH className="text-right">One payment</TH>
                <TH className="text-right">Hold up to</TH>
                <TH>Wallets</TH>
              </tr>
            </THead>
            <TBody>
              {data.tiers.map((t) => (
                <TR key={t.tier}>
                  <TD className="font-semibold">Tier {t.tier}</TD>
                  <TD>{t.needs}</TD>
                  <TD className="text-right">{naira(t.daily / 100)}</TD>
                  <TD className="text-right">{naira(t.single / 100)}</TD>
                  <TD className="text-right">{t.max_balance ? naira(t.max_balance / 100) : "No limit"}</TD>
                  <TD>
                    {t.max_wallets}
                    {t.shared_wallets ? " · shared" : ""}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

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
