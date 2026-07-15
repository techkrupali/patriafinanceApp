"use client";

import Link from "next/link";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  bpsToPercent,
  formatDate,
  formatDateTime,
  loanCategoryLabel,
  naira,
} from "@/lib/format";
import type { LoanDetail, LoanDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { RecoverLoanModal } from "@/components/admin/recover-loan-modal";
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

export default function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"approve" | "default" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "loan", id],
    queryFn: () => api<LoanDetailData>(`/api/v1/admin/loans/${id}`),
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["admin", "loan", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "loans"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      api<{ loan: LoanDetail }>(`/api/v1/admin/loans/${id}/approve`, { method: "POST" }),
    onSuccess: () => {
      setConfirm(null);
      setActionError(null);
      setToast({ tone: "green", message: "Loan approved and disbursed." });
      refetch();
    },
    onError: (err: Error) => {
      setConfirm(null);
      setActionError(err.message);
    },
  });

  const defaultMutation = useMutation({
    mutationFn: () =>
      api<{ loan: LoanDetail }>(`/api/v1/admin/loans/${id}/default`, { method: "POST" }),
    onSuccess: () => {
      setConfirm(null);
      setActionError(null);
      setToast({ tone: "green", message: "Loan marked as defaulted." });
      refetch();
    },
    onError: (err: Error) => {
      setConfirm(null);
      setActionError(err.message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      api<{ loan: LoanDetail }>(`/api/v1/admin/loans/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      }),
    onSuccess: () => {
      setRejecting(false);
      setReason("");
      setActionError(null);
      setToast({ tone: "red", message: "Loan application rejected." });
      refetch();
    },
    onError: (err: Error) => {
      setRejecting(false);
      setActionError(err.message);
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Loan" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const loan = data?.loan;
  const status = loan?.status;
  const isPendingReview = status === "pending";
  const isDefaultable = status === "active" || status === "disbursed";
  // Once funds have actually left, the wallet is the disbursement target;
  // before that it's only the requested destination.
  const isDisbursed =
    status === "active" ||
    status === "repaid" ||
    status === "defaulted" ||
    !!loan?.disbursed_at;
  const isRecoverable = status === "active" || status === "defaulted";
  const busy =
    approveMutation.isPending || defaultMutation.isPending || rejectMutation.isPending;

  return (
    <>
      <PageHeader
        title={isPending ? "Loan" : loan!.reference}
        subtitle={isPending ? undefined : loanCategoryLabel(loan!.category)}
      >
        {!isPending && <StatusBadge status={loan!.status} />}
        {!isPending && isPendingReview && (
          <>
            <Button onClick={() => setConfirm("approve")} disabled={busy}>
              Approve &amp; disburse
            </Button>
            <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
              Reject
            </Button>
          </>
        )}
        {!isPending && isRecoverable && (
          <Button variant="outline" onClick={() => setRecovering(true)} disabled={busy}>
            Recover funds
          </Button>
        )}
        {!isPending && isDefaultable && (
          <Button variant="danger" onClick={() => setConfirm("default")} disabled={busy}>
            Mark defaulted
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
        {/* Loan summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Loan</CardTitle>
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
                <Field name="Principal">{naira(loan!.principal)}</Field>
                <Field name="Interest">{bpsToPercent(loan!.interest_bps)}</Field>
                <Field name="Fee">{naira(loan!.fee)}</Field>
                <Field name="Total repayable">{naira(loan!.total_repayable)}</Field>
                <Field name="Outstanding">{naira(loan!.outstanding)}</Field>
                <Field name="Penalty accrued">
                  <span className={loan!.penalty_accrued && Number(loan!.penalty_accrued) > 0 ? "text-danger" : undefined}>
                    {naira(loan!.penalty_accrued)}
                  </span>
                </Field>
                <Field name="Tenor">{loan!.tenor_days} days</Field>
                <Field name="Frequency">
                  <span className="capitalize">
                    {loan!.repayment_frequency.replace(/_/g, " ")}
                  </span>
                </Field>
                <Field name="Status">
                  <StatusBadge status={loan!.status} />
                </Field>
                <Field name="Disbursed">{formatDateTime(loan!.disbursed_at)}</Field>
                <Field name="Due">{formatDate(loan!.due_at)}</Field>
                <Field name={isDisbursed ? "Disbursed wallet" : "Requested wallet"}>
                  {loan!.disbursed_wallet_id ? (
                    <Link
                      href={`/wallets/${loan!.disbursed_wallet_id}`}
                      className="text-brand hover:underline"
                    >
                      #{loan!.disbursed_wallet_id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field name="Created">{formatDate(loan!.created_at)}</Field>
                {loan!.purpose ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Purpose">{loan!.purpose}</Field>
                  </div>
                ) : null}
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Repayment progress
                  </dt>
                  <dd className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">
                        {naira(
                          Number(loan!.total_repayable) - Number(loan!.outstanding),
                        )}{" "}
                        repaid
                      </span>
                      <span className="text-muted">{loan!.progress_pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-lavender/40">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{ width: `${Math.min(100, Math.max(0, loan!.progress_pct))}%` }}
                      />
                    </div>
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Borrower */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Borrower</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.user ? (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Name">
                  <Link
                    href={`/users/${data!.user.id}`}
                    className="text-brand hover:underline"
                  >
                    {data!.user.name}
                  </Link>
                </Field>
                <Field name="Email">
                  <span className="font-normal text-muted">{data!.user.email}</span>
                </Field>
                <Field name="KYC tier">
                  <Badge tone="blue">Tier {data!.user.kyc_tier}</Badge>
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted">Borrower unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Repayment schedule */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Repayment Schedule</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={5} cols={5} />
          ) : data!.repayments.length === 0 ? (
            <EmptyState message="No repayment schedule yet." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>#</TH>
                  <TH>Due date</TH>
                  <TH className="text-right">Amount due</TH>
                  <TH className="text-right">Amount paid</TH>
                  <TH>Status</TH>
                  <TH>Paid at</TH>
                </tr>
              </THead>
              <TBody>
                {data!.repayments.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs text-muted">{r.sequence}</TD>
                    <TD>{formatDate(r.due_date)}</TD>
                    <TD className="text-right font-semibold">{naira(r.amount_due)}</TD>
                    <TD className="text-right font-semibold">{naira(r.amount_paid)}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-muted">{formatDateTime(r.paid_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirm === "approve"}
        title="Approve & disburse this loan?"
        message="The principal will be disbursed to the borrower's wallet and repayments will begin accruing."
        confirmLabel="Approve & disburse"
        busy={approveMutation.isPending}
        onConfirm={() => approveMutation.mutate()}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "default"}
        danger
        title="Mark this loan as defaulted?"
        message="This flags the loan as defaulted. The outstanding balance remains recoverable but the loan is closed to further repayment scheduling."
        confirmLabel="Mark defaulted"
        busy={defaultMutation.isPending}
        onConfirm={() => defaultMutation.mutate()}
        onCancel={() => setConfirm(null)}
      />

      {rejecting ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reject loan"
          onClick={rejectMutation.isPending ? undefined : () => setRejecting(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-ink">Reject this loan?</h3>
            <p className="mt-1 text-sm text-muted">
              Share a reason for the borrower. This declines the application.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection..."
              aria-label="Reason for rejection"
              className="mt-4 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejecting(false)}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || reason.trim().length === 0}
              >
                {rejectMutation.isPending ? "Working..." : "Reject loan"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {recovering && loan ? (
        <RecoverLoanModal
          loanId={id}
          userId={data?.user?.id ?? null}
          reference={loan.reference}
          outstanding={loan.outstanding}
          onClose={() => setRecovering(false)}
          onSuccess={(msg) => {
            setRecovering(false);
            setToast({ tone: "green", message: msg });
            refetch();
            // Recovery debits the borrower's wallet — refresh balances too.
            queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
            // The debited wallet's own detail page caches a now-stale balance.
            if (loan.disbursed_wallet_id != null) {
              queryClient.invalidateQueries({
                queryKey: ["admin", "wallet", String(loan.disbursed_wallet_id)],
              });
            }
            if (data?.user?.id != null) {
              queryClient.invalidateQueries({
                queryKey: ["admin", "user", String(data.user.id)],
              });
            }
          }}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
