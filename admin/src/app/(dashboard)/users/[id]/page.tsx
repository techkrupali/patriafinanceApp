"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, label, naira, signedNaira } from "@/lib/format";
import type { ApiUser, UserDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api<UserDetailData>(`/api/v1/admin/users/${id}`),
  });

  const suspended = data?.user.status === "suspended";
  const nextStatus = suspended ? "active" : "suspended";

  const statusMutation = useMutation({
    mutationFn: () =>
      api<{ user: ApiUser }>(`/api/v1/admin/users/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }),
    onSuccess: () => {
      setConfirming(false);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (err: Error) => {
      setConfirming(false);
      setActionError(err.message);
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="User" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isPending ? "User" : data.user.full_name}
        subtitle={isPending ? undefined : data.user.email}
      >
        {!isPending && (
          <Button
            variant={suspended ? "primary" : "danger"}
            onClick={() => setConfirming(true)}
            disabled={statusMutation.isPending}
          >
            {suspended ? "Activate account" : "Suspend account"}
          </Button>
        )}
      </PageHeader>

      {actionError ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Profile */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            {!isPending && <StatusBadge status={data.user.status} />}
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                <Field name="Phone">{data.user.phone}</Field>
                <Field name="KYC Tier">
                  <Badge tone="blue">Tier {data.user.kyc_tier}</Badge>
                </Field>
                <Field name="Email verified">
                  <Badge tone={data.user.email_verified ? "green" : "gray"}>
                    {data.user.email_verified ? "Verified" : "Unverified"}
                  </Badge>
                </Field>
                <Field name="Phone verified">
                  <Badge tone={data.user.phone_verified ? "green" : "gray"}>
                    {data.user.phone_verified ? "Verified" : "Unverified"}
                  </Badge>
                </Field>
                <Field name="PIN set">{data.user.has_pin ? "Yes" : "No"}</Field>
                <Field name="Joined">{formatDate(data.user.created_at)}</Field>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Wallets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Wallets</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={5} />
          ) : data.wallets.length === 0 ? (
            <EmptyState message="No wallets." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Virtual Account</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                {data.wallets.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-semibold">{w.name}</TD>
                    <TD>
                      <Badge tone="blue">{label(w.type)}</Badge>
                    </TD>
                    <TD className="text-muted">
                      {w.virtual_account ?? "—"}
                      {w.virtual_account_bank ? ` · ${w.virtual_account_bank}` : ""}
                    </TD>
                    <TD>
                      <StatusBadge status={w.status} />
                    </TD>
                    <TD className="text-right font-semibold">{naira(w.balance)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Devices */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data.devices.length === 0 ? (
              <p className="text-sm text-muted">No registered devices.</p>
            ) : (
              <ul className="space-y-4">
                {data.devices.map((d, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {d.device_name ?? "Unknown device"}
                      </p>
                      <p className="text-xs text-muted">
                        Last active {formatDateTime(d.last_active_at)}
                      </p>
                    </div>
                    {d.platform ? <Badge tone="gray">{d.platform}</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={5} cols={5} />
          ) : data.recent_transactions.length === 0 ? (
            <EmptyState message="No transactions yet." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Date</TH>
                </tr>
              </THead>
              <TBody>
                {data.recent_transactions.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-mono text-xs text-muted">{t.reference}</TD>
                    <TD>{label(t.type)}</TD>
                    <TD
                      className={
                        "text-right font-semibold " +
                        (t.direction === "credit" ? "text-brand" : "text-ink")
                      }
                    >
                      {signedNaira(t.amount, t.direction)}
                    </TD>
                    <TD>
                      <StatusBadge status={t.status} />
                    </TD>
                    <TD className="text-muted">{formatDateTime(t.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        danger={!suspended}
        title={suspended ? "Activate this account?" : "Suspend this account?"}
        message={
          suspended
            ? "The user will regain access to their account and wallets."
            : "The user will be signed out everywhere and blocked from logging in until reactivated."
        }
        confirmLabel={suspended ? "Activate" : "Suspend"}
        busy={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
