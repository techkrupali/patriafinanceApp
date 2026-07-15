"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime, label, naira, signedNaira } from "@/lib/format";
import type { ApiTransaction, TransactionDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { ReverseModal } from "@/components/admin/reverse-modal";
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

function prettyKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function CounterpartyBlock({
  counterparty,
}: {
  counterparty: ApiTransaction["counterparty"];
}) {
  if (counterparty == null || counterparty === "") {
    return <p className="text-sm text-muted">No counterparty recorded.</p>;
  }
  if (typeof counterparty === "string") {
    return <p className="text-sm font-medium text-ink">{counterparty}</p>;
  }
  const entries = Object.entries(counterparty).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No counterparty recorded.</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {entries.map(([k, v]) => (
        <Field key={k} name={prettyKey(k)}>
          <span className="break-words">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </Field>
      ))}
    </dl>
  );
}

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reversing, setReversing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "transaction", id],
    queryFn: () => api<TransactionDetailData>(`/api/v1/admin/transactions/${id}`),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Transaction" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const txn = data?.transaction;
  // A successful, non-reversal transaction that is no longer reversible has
  // already been reversed (backend clears `reversible` once meta.reversed is set).
  const reversed =
    !!txn &&
    txn.status === "successful" &&
    txn.type !== "reversal" &&
    !data!.reversible;

  return (
    <>
      <PageHeader
        title={isPending ? "Transaction" : txn!.reference}
        subtitle={isPending ? undefined : label(txn!.type)}
      >
        {!isPending && <StatusBadge status={txn!.status} />}
        {!isPending && data!.reversible && (
          <Button variant="danger" onClick={() => setReversing(true)}>
            Reverse transaction
          </Button>
        )}
      </PageHeader>

      {reversed ? (
        <p className="mb-4 rounded-lg bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger">
          This transaction has been reversed. A compensating entry is listed under Related.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Transaction */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transaction</CardTitle>
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
                <Field name="Reference">
                  <span className="font-mono text-xs">{txn!.reference}</span>
                </Field>
                <Field name="Type">{label(txn!.type)}</Field>
                <Field name="Direction">
                  <Badge tone={txn!.direction === "credit" ? "green" : "gray"}>
                    {txn!.direction === "credit" ? "Credit" : "Debit"}
                  </Badge>
                </Field>
                <Field name="Amount">
                  <span
                    className={
                      txn!.direction === "credit" ? "text-brand" : "text-danger"
                    }
                  >
                    {signedNaira(txn!.amount, txn!.direction)}
                  </span>
                </Field>
                <Field name="Fee">{naira(txn!.fee)}</Field>
                <Field name="Balance after">
                  {txn!.balance_after != null ? naira(txn!.balance_after) : "—"}
                </Field>
                <Field name="Status">
                  <StatusBadge status={txn!.status} />
                </Field>
                <Field name="Created">{formatDateTime(txn!.created_at)}</Field>
                {txn!.description ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Description">{txn!.description}</Field>
                  </div>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Wallet + initiator */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.wallet ? (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Wallet">
                  <Link
                    href={`/wallets/${data!.wallet.id}`}
                    className="text-brand hover:underline"
                  >
                    {data!.wallet.name}
                  </Link>
                  <span className="ml-2 align-middle">
                    <StatusBadge status={data!.wallet.status} />
                  </span>
                </Field>
                <Field name="Type">
                  <Badge tone="blue">{label(data!.wallet.type)}</Badge>
                </Field>
                {data!.wallet.owner ? (
                  <Field name="Owner">
                    <Link
                      href={`/users/${data!.wallet.owner.id}`}
                      className="text-brand hover:underline"
                    >
                      {data!.wallet.owner.name}
                    </Link>
                    <span className="block text-xs font-normal text-muted">
                      {data!.wallet.owner.email}
                    </span>
                  </Field>
                ) : null}
                <Field name="Initiated by">
                  {data!.initiator ? (
                    <>
                      <Link
                        href={`/users/${data!.initiator.id}`}
                        className="text-brand hover:underline"
                      >
                        {data!.initiator.name}
                      </Link>
                      <span className="block text-xs font-normal text-muted">
                        {data!.initiator.email}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">System</span>
                  )}
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted">Wallet unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Counterparty */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Counterparty</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <CounterpartyBlock counterparty={txn!.counterparty} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Related */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Related Transactions</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={2} cols={5} />
          ) : data!.related.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">
                No linked transactions (transfer pair or reversal).
              </p>
            </CardContent>
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
                {data!.related.map((t) => (
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
                        (t.direction === "credit" ? "text-brand" : "text-danger")
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

      {reversing && txn ? (
        <ReverseModal
          transactionId={id}
          reference={txn.reference}
          onClose={() => setReversing(false)}
          onSuccess={(msg) => {
            setReversing(false);
            setToast({ tone: "green", message: msg });
            queryClient.invalidateQueries({ queryKey: ["admin", "transaction", id] });
            queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
            // Refresh the affected wallet + its owner so balances don't show stale.
            const walletId = data?.wallet?.id;
            if (walletId != null) {
              queryClient.invalidateQueries({
                queryKey: ["admin", "wallet", String(walletId)],
              });
            }
            const ownerId = data?.wallet?.owner?.id;
            if (ownerId != null) {
              queryClient.invalidateQueries({
                queryKey: ["admin", "user", String(ownerId)],
              });
            }
          }}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
