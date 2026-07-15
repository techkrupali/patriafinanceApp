"use client";

import Link from "next/link";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  kycTierLabel,
  kycTierName,
  label,
  naira,
} from "@/lib/format";
import type { KycDetailData, KycPayload, KycSubmission } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

/** Renders the tier-specific submitted fields. */
function PayloadFields({ tier, payload }: { tier: number; payload: KycPayload }) {
  if (tier === 1) {
    return (
      <>
        <Field name="BVN">{payload.bvn ?? "—"}</Field>
        <Field name="NIN">{payload.nin ?? "—"}</Field>
        <Field name="ID type">{payload.id_type ? label(payload.id_type) : "—"}</Field>
        <Field name="ID number">{payload.id_number ?? "—"}</Field>
      </>
    );
  }
  if (tier === 2) {
    return (
      <>
        <Field name="Address">{payload.address ?? "—"}</Field>
        <Field name="City">{payload.city ?? "—"}</Field>
        <Field name="State">{payload.state ?? "—"}</Field>
      </>
    );
  }
  if (tier === 3) {
    return (
      <>
        <Field name="Source of funds">{payload.source_of_funds ?? "—"}</Field>
        {payload.business_name ? (
          <Field name="Business name">{payload.business_name}</Field>
        ) : (
          <Field name="Occupation">{payload.occupation ?? "—"}</Field>
        )}
        {payload.monthly_income != null && payload.monthly_income !== "" ? (
          <Field name="Monthly income">{naira(payload.monthly_income)}</Field>
        ) : null}
      </>
    );
  }
  return <p className="text-sm text-muted">No details submitted.</p>;
}

export default function KycDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "kyc", id],
    queryFn: () => api<KycDetailData>(`/api/v1/admin/kyc/${id}`),
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["admin", "kyc", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "kyc"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      api<{ submission: KycSubmission }>(`/api/v1/admin/kyc/${id}/approve`, {
        method: "POST",
      }),
    onSuccess: () => {
      setConfirmApprove(false);
      setToast({
        tone: "green",
        message: `Approved — ${data!.user.name} raised to Tier ${data!.submission.target_tier}.`,
      });
      refetch();
    },
    onError: (err: Error) => {
      setConfirmApprove(false);
      setToast({ tone: "red", message: err.message });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      api<{ submission: KycSubmission }>(`/api/v1/admin/kyc/${id}/reject`, {
        method: "POST",
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      setRejecting(false);
      setNote("");
      setToast({ tone: "red", message: "Submission rejected." });
      refetch();
    },
    onError: (err: Error) => {
      setRejecting(false);
      setToast({ tone: "red", message: err.message });
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="KYC submission" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const submission = data?.submission;
  const isPendingReview = submission?.status === "pending";
  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <>
      <PageHeader
        title={isPending ? "KYC submission" : `#${submission!.id}`}
        subtitle={isPending ? undefined : kycTierLabel(submission!.target_tier)}
      >
        {!isPending && <StatusBadge status={submission!.status} />}
        {!isPending && isPendingReview && (
          <>
            <Button onClick={() => setConfirmApprove(true)} disabled={busy}>
              Approve
            </Button>
            <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
              Reject
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Submission summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Submission</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                <Field name="Target tier">
                  <Badge tone="blue">Tier {submission!.target_tier}</Badge>
                </Field>
                <Field name="Verification">{kycTierName(submission!.target_tier)}</Field>
                <Field name="Type">{label(submission!.type)}</Field>
                <Field name="Status">
                  <StatusBadge status={submission!.status} />
                </Field>
                <Field name="Submitted">{formatDate(submission!.created_at)}</Field>
                <Field name="Reviewed">{formatDateTime(submission!.reviewed_at)}</Field>
                {submission!.review_note ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Review note">{submission!.review_note}</Field>
                  </div>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Applicant */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Applicant</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
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
                <Field name="Current tier">
                  <Badge tone="blue">Tier {data!.user.kyc_tier}</Badge>
                </Field>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submitted details */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Submitted details</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                <PayloadFields
                  tier={submission!.target_tier}
                  payload={submission!.payload}
                />
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmApprove}
        title="Approve this KYC submission?"
        message={
          submission
            ? `This raises ${data!.user.name} to Tier ${submission.target_tier}.`
            : ""
        }
        confirmLabel="Approve"
        busy={approveMutation.isPending}
        onConfirm={() => approveMutation.mutate()}
        onCancel={() => setConfirmApprove(false)}
      />

      {rejecting ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reject KYC submission"
          onClick={rejectMutation.isPending ? undefined : () => setRejecting(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-ink">Reject this submission?</h3>
            <p className="mt-1 text-sm text-muted">
              Optionally share a reason for the applicant. This declines the request.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (optional)..."
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
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? "Working..." : "Reject submission"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
