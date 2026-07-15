"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { approvalActionLabel, formatDateTime, naira } from "@/lib/format";
import type { ApprovalDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "approval", id],
    queryFn: () => api<ApprovalDetailData>(`/api/v1/admin/approvals/${id}`),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Approval" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const approval = data?.approval;

  return (
    <>
      <PageHeader
        title={isPending ? "Approval" : `Approval #${approval!.id}`}
        subtitle={isPending ? undefined : approvalActionLabel(approval!.action)}
      >
        {!isPending && <StatusBadge status={approval!.status} />}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Request</CardTitle>
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
                <Field name="Action">{approvalActionLabel(approval!.action)}</Field>
                <Field name="Amount">{naira(approval!.amount)}</Field>
                <Field name="Fee">{naira(approval!.fee)}</Field>
                <Field name="Status">
                  <StatusBadge status={approval!.status} />
                </Field>
                <Field name="Approvals">
                  <span className="font-semibold text-ink">
                    {approval!.approvals_count}
                  </span>
                  <span className="text-muted"> / {approval!.required_approvals}</span>
                </Field>
                <Field name="Expires">{formatDateTime(approval!.expires_at)}</Field>
                <Field name="Created">{formatDateTime(approval!.created_at)}</Field>
                {approval!.executed_transaction_reference ? (
                  <Field name="Executed txn">
                    <span className="font-mono text-xs">
                      {approval!.executed_transaction_reference}
                    </span>
                  </Field>
                ) : null}
                {approval!.description ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Description">{approval!.description}</Field>
                  </div>
                ) : null}
                {approval!.fail_reason ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Failure reason">
                      <span className="text-danger">{approval!.fail_reason}</span>
                    </Field>
                  </div>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Wallet + initiator */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Context</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Wallet">
                  {approval!.wallet ? (
                    <Link
                      href={`/wallets/${approval!.wallet.id}`}
                      className="text-brand hover:underline"
                    >
                      {approval!.wallet.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field name="Initiator">
                  {approval!.initiator ? (
                    <Link
                      href={`/users/${approval!.initiator.id}`}
                      className="text-brand hover:underline"
                    >
                      {approval!.initiator.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Field>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Responses timeline */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Responses</CardTitle>
          </CardHeader>
          {isPending ? (
            <CardContent>
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </CardContent>
          ) : data!.responses.length === 0 ? (
            <EmptyState message="No sign-off responses yet." />
          ) : (
            <CardContent>
              <ul className="space-y-4">
                {data!.responses.map((r, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {r.approver.name ?? "Unknown approver"}
                      </p>
                      {r.note ? (
                        <p className="mt-0.5 text-sm text-muted">{r.note}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTime(r.created_at)}
                      </p>
                    </div>
                    <Badge tone={r.decision === "approve" ? "green" : "red"}>
                      {r.decision === "approve" ? "Approved" : "Rejected"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>
    </>
  );
}
