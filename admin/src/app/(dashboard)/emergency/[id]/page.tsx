"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "@/lib/api";
import {
  emergencyLabel,
  emergencyMethodLabel,
  formatDateTime,
  naira,
} from "@/lib/format";
import type { EmergencyRequestDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { EmergencyDecisionModal } from "@/components/admin/emergency-decision-modal";
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

function Toggle({ on }: { on: boolean }) {
  return <Badge tone={on ? "green" : "gray"}>{on ? "On" : "Off"}</Badge>;
}

/**
 * The upload is private (Bearer-only), so it can't be a plain <img src>:
 * fetch it with the admin token, preview it from an object URL and revoke
 * that URL on unmount.
 */
function DocumentPreview({ requestId }: { requestId: string }) {
  const [doc, setDoc] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    apiBlob(`/api/v1/admin/emergency-requests/${requestId}/document`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setDoc({ url: objectUrl, type: blob.type });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requestId]);

  if (error) return <ErrorState message={error} />;
  if (!doc) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-3">
      {doc.type.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL of a private upload; nothing for next/image to optimise
        <img
          src={doc.url}
          alt="Uploaded document"
          className="mx-auto max-h-[36rem] rounded-lg border border-line"
        />
      ) : doc.type === "application/pdf" ? (
        <iframe
          src={doc.url}
          title="Uploaded document"
          className="h-[36rem] w-full rounded-lg border border-line"
        />
      ) : (
        <p className="text-sm text-muted">This file type can&apos;t be previewed here.</p>
      )}
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm font-semibold text-brand hover:underline"
      >
        Open document
      </a>
    </div>
  );
}

export default function EmergencyRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "emergency-requests", id],
    queryFn: () =>
      api<EmergencyRequestDetailData>(`/api/v1/admin/emergency-requests/${id}`),
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["admin", "emergency-requests", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "emergency-requests"] });
    if (data) {
      queryClient.invalidateQueries({
        queryKey: ["admin", "wallet", String(data.request.wallet_id)],
      });
    }
    queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Emergency request" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const request = data?.request;
  const wallet = request?.wallet;
  const rules = data?.rules;
  const isDocument = request?.method === "document";
  // Only document requests are Patriai's call; dual approvals are decided in-app.
  const canReview = isDocument && request?.status === "pending";

  return (
    <>
      <PageHeader
        title={isPending ? "Emergency request" : `#${request!.id}`}
        subtitle={
          isPending
            ? undefined
            : emergencyMethodLabel(request!.method, request!.document_type)
        }
      >
        {!isPending && <StatusBadge status={request!.status} />}
        {!isPending && canReview && (
          <>
            <Button onClick={() => setDecision("approve")}>Verify &amp; unlock</Button>
            <Button variant="danger" onClick={() => setDecision("reject")}>
              Reject
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Request summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                  <Field name="Method">
                    {emergencyMethodLabel(request!.method, request!.document_type)}
                  </Field>
                  <Field name="Status">
                    <StatusBadge status={request!.status} />
                  </Field>
                  <Field name="Requested by">
                    {request!.requested_by ? (
                      <>
                        <Link
                          href={`/users/${request!.requested_by.id}`}
                          className="text-brand hover:underline"
                        >
                          {request!.requested_by.name}
                        </Link>
                        {request!.requested_by.username ? (
                          <span className="block text-xs font-normal text-muted">
                            @{request!.requested_by.username}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field name="Submitted">{formatDateTime(request!.created_at)}</Field>
                  <Field name="Decided">{formatDateTime(request!.decided_at)}</Field>
                  {isDocument ? (
                    <Field name="Reviewed by">{request!.reviewed_by ?? "—"}</Field>
                  ) : (
                    <Field name="Approved by">{request!.approved_by?.name ?? "—"}</Field>
                  )}
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Requester note">
                      {request!.note ? (
                        <span className="whitespace-pre-wrap">{request!.note}</span>
                      ) : (
                        <span className="font-normal text-muted">No note added.</span>
                      )}
                    </Field>
                  </div>
                  {request!.review_note ? (
                    <div className="col-span-2 sm:col-span-3">
                      <Field name="Review note">{request!.review_note}</Field>
                    </div>
                  ) : null}
                </dl>
                {!isDocument ? (
                  <p className="mt-5 rounded-lg bg-lavender/30 px-3 py-2 text-xs text-muted">
                    Dual-approval requests are decided in the app by the wallet&apos;s
                    designated approver. Shown here for reference only.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        {/* Wallet + owner */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
            {!isPending && wallet ? (
              <Badge tone={wallet.locked ? "amber" : "green"}>
                {wallet.locked ? "Locked" : "Unlocked"}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : wallet ? (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Name">
                  <Link href={`/wallets/${wallet.id}`} className="text-brand hover:underline">
                    {wallet.name}
                  </Link>
                </Field>
                <Field name="Balance">{naira(wallet.balance)}</Field>
                <Field name="Owner">
                  {wallet.owner ? (
                    <>
                      <Link
                        href={`/users/${wallet.owner.id}`}
                        className="text-brand hover:underline"
                      >
                        {wallet.owner.name}
                      </Link>
                      <span className="block text-xs font-normal text-muted">
                        {wallet.owner.email}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted">Wallet unavailable.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Uploaded document */}
      {!isPending && isDocument ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Document</CardTitle>
              {request!.document_type ? (
                <Badge tone="blue">{emergencyLabel(request!.document_type)}</Badge>
              ) : null}
            </CardHeader>
            <CardContent>
              {request!.has_document ? (
                <DocumentPreview requestId={id} />
              ) : (
                <p className="text-sm text-muted">No document was uploaded with this request.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Unlock rules */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Unlock Rules</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : rules ? (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Dual approval">
                  <Toggle on={rules.dual_approval} />
                  {rules.approver ? (
                    <span className="block text-xs font-normal text-muted">
                      Approver: {rules.approver.name}
                    </span>
                  ) : null}
                </Field>
                <Field name="Verified document">
                  <Toggle on={rules.unlock_on_document} />
                  <span className="block text-xs font-normal text-muted">
                    Death certificate or legal notice, checked by Patriai
                  </span>
                </Field>
                <Field name="Owner's emergency PIN">
                  <Toggle on={rules.manual_unlock} />
                  {rules.unlock_reason ? (
                    <span className="block text-xs font-normal text-muted">
                      Reason: {rules.unlock_reason}
                    </span>
                  ) : null}
                </Field>
                <Field name="High-balance override">
                  <Toggle on={rules.override_high_balance} />
                  {rules.override_high_balance ? (
                    <span className="block text-xs font-normal text-muted">
                      Above {naira(rules.override_balance_threshold)}
                    </span>
                  ) : null}
                </Field>
                <Field name="National-crisis override">
                  <Toggle on={rules.override_national_crisis} />
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted">Rules unavailable.</p>
            )}
          </CardContent>
        </Card>

        {/* Recipients — who can withdraw once the wallet unlocks */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
            <span className="text-xs text-muted">Can withdraw once unlocked</span>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={5} />
          ) : data!.beneficiaries.length === 0 ? (
            <EmptyState message="No recipients on this wallet." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>#</TH>
                  <TH>Recipient</TH>
                  <TH>Role</TH>
                  <TH className="text-right">Withdrawal limit</TH>
                  <TH>Access</TH>
                  <TH className="text-right">Withdrawn</TH>
                </tr>
              </THead>
              <TBody>
                {data!.beneficiaries.map((b) => (
                  <TR
                    key={b.id}
                    clickable={b.user != null}
                    onClick={b.user ? () => router.push(`/users/${b.user!.id}`) : undefined}
                  >
                    <TD className="font-mono text-xs text-muted">{b.position}</TD>
                    <TD>
                      <p className="font-medium">{b.user?.name ?? "—"}</p>
                      <p className="text-xs text-muted">
                        {[b.user?.username ? `@${b.user.username}` : null, b.relationship]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </TD>
                    <TD>
                      <Badge tone={b.role === "beneficiary" ? "blue" : "gray"}>
                        {emergencyLabel(b.role)}
                      </Badge>
                    </TD>
                    <TD className="text-right font-semibold">
                      {b.withdrawal_limit != null ? naira(b.withdrawal_limit) : "No cap"}
                    </TD>
                    <TD>{emergencyLabel(b.access_type)}</TD>
                    <TD className="text-right text-muted">{naira(b.withdrawn)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {decision && request ? (
        <EmergencyDecisionModal
          decision={decision}
          requestId={id}
          walletName={wallet?.name}
          walletBalance={wallet?.balance}
          recipientCount={data!.beneficiaries.length}
          onClose={() => setDecision(null)}
          onSuccess={(msg) => {
            setToast({ tone: decision === "approve" ? "green" : "red", message: msg });
            setDecision(null);
            refetch();
          }}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
