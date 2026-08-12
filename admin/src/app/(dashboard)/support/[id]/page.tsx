"use client";

import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDateTime, label } from "@/lib/format";
import type {
  SupportRequestDetailData,
  SupportRequestStatus,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PRIORITY_TONE: Record<string, "red" | "amber" | "gray"> = {
  high: "red",
  medium: "amber",
  low: "gray",
};

/** Forward-only next step, mirroring the backend transitions. */
const NEXT: Record<SupportRequestStatus, { to: SupportRequestStatus; label: string } | null> = {
  pending: { to: "in_review", label: "Start review" },
  in_review: { to: "resolved", label: "Mark resolved" },
  resolved: { to: "closed", label: "Close request" },
  closed: null,
};

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function SupportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<{ to: SupportRequestStatus; label: string } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "support-requests", id],
    queryFn: () => api<SupportRequestDetailData>(`/api/v1/admin/support-requests/${id}`),
  });

  const mutation = useMutation({
    mutationFn: (status: SupportRequestStatus) =>
      api<SupportRequestDetailData>(`/api/v1/admin/support-requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (res) => {
      setConfirm(null);
      setToast({ tone: "green", message: `Marked ${label(res.support_request.status)}.` });
      queryClient.invalidateQueries({ queryKey: ["admin", "support-requests", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "support-requests"] });
    },
    onError: (err: Error) => {
      setConfirm(null);
      setToast({ tone: "red", message: err.message });
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Support request" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const r = data?.support_request;
  const next = r ? NEXT[r.status] : null;

  return (
    <>
      <PageHeader
        title={isPending ? "Support request" : `#${r!.id}`}
        subtitle={isPending ? undefined : r!.subject}
      >
        {!isPending && <StatusBadge status={r!.status} />}
        {!isPending && next && (
          <Button onClick={() => setConfirm(next)} disabled={mutation.isPending}>
            {next.label}
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Issue</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-4">
                <Field name="Subject">{r!.subject}</Field>
                <Field name="Description">
                  <span className="whitespace-pre-wrap">{r!.description}</span>
                </Field>
                <Field name="Reference">{r!.reference ?? "—"}</Field>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-4">
                <Field name="User">
                  {r!.user ? (
                    <>
                      {r!.user.name}
                      <span className="block text-xs font-normal text-muted">{r!.user.email}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field name="Category">{label(r!.category)}</Field>
                <Field name="Priority">
                  <Badge tone={PRIORITY_TONE[r!.priority] ?? "gray"}>{label(r!.priority)}</Badge>
                </Field>
                <Field name="Status">
                  <StatusBadge status={r!.status} />
                </Field>
                <Field name="Created">{formatDateTime(r!.created_at)}</Field>
                <Field name="Last updated">{formatDateTime(r!.updated_at)}</Field>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.label ?? ""}
        message={
          r ? `Set support request #${r.id} to "${label(confirm?.to ?? "")}"? The user will be notified.` : ""
        }
        confirmLabel={confirm?.label ?? "Confirm"}
        busy={mutation.isPending}
        onConfirm={() => confirm && mutation.mutate(confirm.to)}
        onCancel={() => setConfirm(null)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
