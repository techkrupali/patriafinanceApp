"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, label, naira, signedNaira } from "@/lib/format";
import type { ApiWallet, WalletDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { AdjustBalanceModal } from "@/components/admin/adjust-balance-modal";
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

export default function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "wallet", id],
    queryFn: () => api<WalletDetailData>(`/api/v1/admin/wallets/${id}`),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "wallet", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "frozen" | "closed") =>
      api<{ wallet: ApiWallet }>(`/api/v1/admin/wallets/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_res, status) => {
      setFreezing(false);
      setToast({
        tone: "green",
        message: status === "active" ? "Wallet unfrozen." : "Wallet frozen.",
      });
      invalidate();
    },
    onError: (err: Error) => {
      setFreezing(false);
      setToast({ tone: "red", message: err.message });
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Wallet" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const wallet = data?.wallet;
  const isFrozen = wallet?.status === "frozen";
  const isClosed = wallet?.status === "closed";
  const nextStatus: "active" | "frozen" = isFrozen ? "active" : "frozen";

  return (
    <>
      <PageHeader
        title={isPending ? "Wallet" : wallet!.name}
        subtitle={isPending ? undefined : wallet!.owner?.name ?? undefined}
      >
        {!isPending && <StatusBadge status={wallet!.status} />}
        {!isPending && !isClosed && (
          <>
            <Button variant="outline" onClick={() => setAdjusting(true)}>
              Adjust balance
            </Button>
            <Button
              variant={isFrozen ? "primary" : "danger"}
              onClick={() => setFreezing(true)}
              disabled={statusMutation.isPending}
            >
              {isFrozen ? "Unfreeze" : "Freeze"}
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                <Field name="Type">
                  <Badge tone="blue">{label(wallet!.type)}</Badge>
                </Field>
                <Field name="Balance">{naira(wallet!.balance)}</Field>
                <Field name="Currency">{wallet!.currency}</Field>
                <Field name="Owner">
                  <span className="font-medium text-ink">{wallet!.owner?.name ?? "—"}</span>
                  {wallet!.owner?.email ? (
                    <span className="block text-xs font-normal text-muted">
                      {wallet!.owner.email}
                    </span>
                  ) : null}
                </Field>
                <Field name="Virtual Account">
                  {wallet!.virtual_account ?? "—"}
                  {wallet!.virtual_account_bank ? (
                    <span className="block text-xs font-normal text-muted">
                      {wallet!.virtual_account_bank}
                    </span>
                  ) : null}
                </Field>
                <Field name="Created">{formatDate(wallet!.created_at)}</Field>
                {wallet!.description ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Description">{wallet!.description}</Field>
                  </div>
                ) : null}
                {wallet!.target_amount ? (
                  <Field name="Target">{naira(wallet!.target_amount)}</Field>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Approval config */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Approval Config</CardTitle>
            {!isPending && (
              <Badge tone={data!.approval.enabled ? "green" : "gray"}>
                {data!.approval.enabled ? "Enabled" : "Disabled"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.approval.enabled ? (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Threshold">
                  {data!.approval.threshold != null
                    ? naira(data!.approval.threshold)
                    : "—"}
                  <span className="block text-xs font-normal text-muted">
                    Transfers at or above this amount need sign-off
                  </span>
                </Field>
                <Field name="Required approvals">
                  {data!.approval.required_approvals}
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted">
                This wallet moves funds without multi-signature approval.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Members */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.members.length === 0 ? (
              <p className="text-sm text-muted">No members.</p>
            ) : (
              <ul className="space-y-4">
                {data!.members.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                      <p className="truncate text-xs text-muted">{m.email}</p>
                      <Badge tone="gray" className="mt-1.5 capitalize">
                        {m.role}
                      </Badge>
                    </div>
                    {m.can_approve ? (
                      <Badge tone="green">Can approve</Badge>
                    ) : (
                      <Badge tone="gray">View only</Badge>
                    )}
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
          ) : data!.recent_transactions.length === 0 ? (
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
                {data!.recent_transactions.map((t) => (
                  <TR
                    key={t.id}
                    clickable
                    onClick={() => router.push(`/transactions/${t.id}`)}
                  >
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

      {adjusting && wallet ? (
        <AdjustBalanceModal
          walletId={id}
          walletName={wallet.name}
          onClose={() => setAdjusting(false)}
          onSuccess={(msg) => {
            setAdjusting(false);
            setToast({ tone: "green", message: msg });
            invalidate();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={freezing}
        danger={!isFrozen}
        title={isFrozen ? "Unfreeze this wallet?" : "Freeze this wallet?"}
        message={
          isFrozen
            ? "The owner regains the ability to move funds in and out of this wallet."
            : "Debits and transfers will be blocked until the wallet is unfrozen. The owner is notified."
        }
        confirmLabel={isFrozen ? "Unfreeze" : "Freeze"}
        busy={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate(nextStatus)}
        onCancel={() => setFreezing(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
