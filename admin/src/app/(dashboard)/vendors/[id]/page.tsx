"use client";

import Link from "next/link";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, label } from "@/lib/format";
import type { VendorCheck, VendorDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/states";
import { SecureFile } from "@/components/secure-file";
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

/** Which uploaded files belong to which check. */
const ITEM_FILES: Record<VendorCheck, string[]> = {
  owner: ["selfie"],
  id_document: ["id_front", "id_back"],
  cac: ["cac_certificate", "cac_status_report", "memorandum"],
  directors: [],
  address: ["address_proof", "office_photo"],
  bank: ["tin_certificate"],
};

/**
 * One business's verification (VON-09): each item with its files, approve it
 * or send it back with a note. When every item is approved the business is
 * verified and families can pay it.
 */
export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [sendBack, setSendBack] = useState<VendorCheck | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "vendor", id],
    queryFn: () => api<VendorDetailData>(`/api/v1/admin/vendors/${id}`),
  });

  const review = useMutation({
    mutationFn: (input: { item: VendorCheck; approve: boolean; note?: string }) =>
      api<{ vendor: { status: string } }>(`/api/v1/admin/vendors/${id}/review`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (res, input) => {
      setSendBack(null);
      setNote("");
      setToast({
        tone: input.approve ? "green" : "red",
        message: res.vendor.status === "verified" ? "Every item approved — the business is verified." : input.approve ? "Approved." : "Sent back to the business with your note.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "vendor", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "vendors"] });
    },
    onError: (err: Error) => setToast({ tone: "red", message: err.message }),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Vendor" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const v = data?.vendor;
  const canReview = v?.status === "submitted" || v?.status === "needs_changes";

  return (
    <>
      <PageHeader title={v?.business_name ?? "Vendor"} subtitle={v ? `${label(v.category)} · ${v.location ?? ""}` : undefined}>
        {v ? <StatusBadge status={v.status} /> : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data!.verification.items.map((it) => {
                  const files = data!.documents.filter((d) => ITEM_FILES[it.item].includes(d.item));
                  return (
                    <li key={it.item} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{it.label}</p>
                          <p className={it.status === "redo" ? "text-xs text-danger" : "text-xs text-muted"}>{it.note ?? it.sub}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={it.status === "pending" ? "pending" : it.status} />
                          {canReview && it.status !== "approved" ? (
                            <>
                              <Button size="sm" onClick={() => review.mutate({ item: it.item, approve: true })} disabled={review.isPending}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setSendBack(it.item)} disabled={review.isPending}>
                                Send back
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {it.item === "owner" ? (
                        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Field name="BVN">{v!.owner_bvn ?? "—"}</Field>
                          <Field name="NIN">{v!.owner_nin ?? "—"}</Field>
                          <Field name="Name in Patriai">{v!.owner?.name ?? "—"}</Field>
                          <Field name="Patriai tier">Tier {v!.owner?.kyc_tier ?? 0}</Field>
                        </dl>
                      ) : null}
                      {it.item === "id_document" ? <p className="mt-2 text-xs text-muted">Type: {v!.id_type ? label(v!.id_type) : "—"}</p> : null}
                      {it.item === "cac" ? <p className="mt-2 text-xs text-muted">RC / BN: {v!.rc_number ?? "—"}</p> : null}
                      {it.item === "address" ? <p className="mt-2 text-xs text-muted">{v!.address ?? "No address given"}</p> : null}
                      {it.item === "bank" ? (
                        <p className="mt-2 text-xs text-muted">
                          {v!.bank ? `${v!.bank.account_name ?? "—"} · ${v!.bank.account_number} · ${v!.bank.bank_name ?? ""}` : "No account yet"}
                          {v!.tin ? ` · TIN ${v!.tin}` : ""}
                        </p>
                      ) : null}
                      {it.item === "directors" ? (
                        <div className="mt-3 space-y-3">
                          {data!.directors.map((d) => (
                            <div key={d.id} className="rounded-lg border border-line p-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-ink">
                                    {d.name} {d.is_owner ? <span className="text-xs text-muted">(owner · checked under Owner identity)</span> : null}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {d.share_percent ? `${d.share_percent}% · ` : ""}
                                    {d.phone ?? ""} {d.bvn ? `· BVN ${d.bvn}` : ""}
                                  </p>
                                </div>
                                <StatusBadge status={d.status} />
                              </div>
                              {d.selfie_url ? (
                                <div className="mt-2">
                                  <SecureFile url={d.selfie_url} name={`${d.name} selfie`} />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {files.length ? (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {files.map((f) => (
                            <div key={f.id} className="space-y-1">
                              <SecureFile url={f.url} name={f.name} pdf={f.is_pdf} />
                              <p className="text-xs text-muted">{label(f.item)}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <dl className="grid grid-cols-1 gap-y-4">
                  <Field name="Owner">
                    {v!.owner ? (
                      <Link href={`/users/${v!.owner.id}`} className="text-brand hover:underline">
                        {v!.owner.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <span className="block text-xs font-normal text-muted">{v!.owner?.phone ?? ""}</span>
                  </Field>
                  <Field name="Areas">{v!.areas ?? "—"}</Field>
                  <Field name="Services">{v!.services.length ? v!.services.join(", ") : "—"}</Field>
                  <Field name="Team size">{v!.team_size ?? "—"}</Field>
                  <Field name="Record">
                    {data!.stats.projects} project{data!.stats.projects === 1 ? "" : "s"} · {data!.stats.milestones_paid} milestone{data!.stats.milestones_paid === 1 ? "" : "s"} paid · {data!.stats.open_disputes} open dispute{data!.stats.open_disputes === 1 ? "" : "s"}
                  </Field>
                  <Field name="Rating">{v!.rating ? `★ ${v!.rating} (${v!.reviews})` : "No reviews yet"}</Field>
                  <Field name="Sent for review">{formatDate(v!.submitted_at)}</Field>
                  <Field name="Verified">{v!.verified ? <Badge tone="green">Since {formatDate(v!.verified_at)}</Badge> : "Not yet"}</Field>
                </dl>
              )}
            </CardContent>
          </Card>
          {v?.bio ? (
            <Card>
              <CardHeader>
                <CardTitle>What families see</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-ink">{v.bio}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {sendBack ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send back"
          onClick={review.isPending ? undefined : () => setSendBack(null)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-ink">Send back: {data?.labels[sendBack]?.[0]}</h3>
            <p className="mt-1 text-sm text-muted">The business sees your note and uploads it again.</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="NEPA bill is over 3 months old"
              aria-label="Note for the business"
              className="mt-4 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSendBack(null)} disabled={review.isPending}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => review.mutate({ item: sendBack, approve: false, note: note.trim() })} disabled={review.isPending || !note.trim()}>
                {review.isPending ? "Working..." : "Send back"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
