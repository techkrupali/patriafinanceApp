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
import { SecureFile } from "@/components/secure-file";
import { Skeleton } from "@/components/ui/skeleton";

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

const FILE_NAMES: Record<string, string> = { selfie: "Selfie", id_photo: "ID photo page", id_back: "ID signature page", proof: "Proof of address" };

/**
 * The tier's details (ME-23): Tier 1 the BVN; Tier 2 the NIN and a selfie;
 * Tier 3 an ID document and proof of address. Older submissions show what
 * they had (NIN/ID at Tier 1, address at Tier 2, source of funds at Tier 3).
 */
function PayloadFields({ id, tier, payload, files }: { id: string; tier: number; payload: KycPayload; files: string[] }) {
  const rows: [string, React.ReactNode][] = [];
  if (payload.bvn) rows.push(["BVN", payload.bvn]);
  if (payload.nin) rows.push(["NIN", payload.nin]);
  if (payload.id_type) rows.push(["ID type", label(payload.id_type)]);
  if (payload.id_number) rows.push(["ID number", payload.id_number]);
  if (payload.address) rows.push(["Address", payload.address]);
  if (payload.city) rows.push(["Area / city", payload.city]);
  if (payload.state) rows.push(["State", payload.state]);
  if (payload.source_of_funds) rows.push(["Source of funds", payload.source_of_funds]);
  if (payload.business_name) rows.push(["Business name", payload.business_name]);
  if (payload.occupation) rows.push(["Occupation", payload.occupation]);
  if (payload.monthly_income != null && payload.monthly_income !== "") rows.push(["Monthly income", naira(payload.monthly_income)]);
  if (!rows.length && !files.length) return <p className="text-sm text-muted">No details submitted for Tier {tier}.</p>;

  return (
    <>
      {rows.map(([name, value]) => (
        <Field key={name} name={name}>{value}</Field>
      ))}
      {files.map((key) => {
        const path = (payload as Record<string, unknown>)[key];
        return (
          <Field key={key} name={FILE_NAMES[key] ?? label(key)}>
            <SecureFile url={`/api/v1/admin/kyc/${id}/files/${key}`} name={FILE_NAMES[key] ?? key} pdf={typeof path === "string" && path.toLowerCase().endsWith(".pdf")} />
          </Field>
        );
      })}
    </>
  );
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
        message: `Approved — ${data!.user?.name ?? "applicant"} raised to Tier ${data!.submission.target_tier}.`,
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
                <Field name="Current tier">
                  <Badge tone="blue">Tier {data!.user.kyc_tier}</Badge>
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted">Applicant unavailable.</p>
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
                  id={id}
                  tier={submission!.target_tier}
                  payload={submission!.payload}
                  files={submission!.files ?? []}
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
            ? `This raises ${data!.user?.name ?? "the applicant"} to Tier ${submission.target_tier}.`
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
