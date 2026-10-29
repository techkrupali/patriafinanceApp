"use client";

import Link from "next/link";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, formatDeadline, naira } from "@/lib/format";
import type { DisputeDetail } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{name}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

const MILESTONE_OUTCOMES = [
  { value: "release_full", label: "Release in full", hint: "The builder is paid the milestone, less anything normally held back." },
  { value: "partial_refund", label: "Release less a refund", hint: "The refund stays in the family's project wallet; the rest is paid." },
  { value: "full_refund", label: "Refund in full", hint: "Nothing is paid; the milestone is cancelled and the money stays with the family." },
];
const PAYMENT_OUTCOMES = [
  { value: "resolved", label: "Resolved", hint: "The problem was put right." },
  { value: "rejected", label: "Not upheld", hint: "Nothing was wrong with the payment." },
];

const OUTCOMES: Record<string, string> = {
  fixed: "Fixed at no extra cost",
  partial_refund: "Paid less a refund",
  full_refund: "Refunded in full",
  released: "Paid in full",
  resolved: "Resolved",
};

function offerText(o: NonNullable<DisputeDetail["messages"][number]["offer"]>): string {
  if (o.type === "fix") return `Offered to fix it by ${formatDate(o.fix_by)}`;
  if (o.type === "partial_refund") return `Offered a ${naira(o.amount ?? "0")} refund`;
  return "Disagrees";
}

/** One dispute: both sides, the evidence, a note to them both, and Patriai's final decision (DSP-08/09). */
export default function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState("");
  const [refund, setRefund] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "dispute", id],
    queryFn: () => api<{ dispute: DisputeDetail }>(`/api/v1/admin/disputes/${id}`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "dispute", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "disputes"] });
  };

  const send = useMutation({
    mutationFn: () => api(`/api/v1/admin/disputes/${id}/messages`, { method: "POST", body: JSON.stringify({ body: message.trim() }) }),
    onSuccess: () => {
      setMessage("");
      setToast({ tone: "green", message: "Sent to both sides." });
      refresh();
    },
    onError: (err: Error) => setToast({ tone: "red", message: err.message }),
  });

  const decide = useMutation({
    mutationFn: () =>
      api(`/api/v1/admin/disputes/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ outcome, note: note.trim(), ...(outcome === "partial_refund" ? { refund } : {}) }),
      }),
    onSuccess: () => {
      setConfirm(false);
      setToast({ tone: "green", message: "Decision recorded. Both sides have been told." });
      refresh();
    },
    onError: (err: Error) => {
      setConfirm(false);
      setToast({ tone: "red", message: err.message });
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Dispute" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const d = data?.dispute;
  const active = d ? !["resolved", "rejected"].includes(d.status) : false;
  const outcomes = d?.kind === "milestone" ? MILESTONE_OUTCOMES : PAYMENT_OUTCOMES;
  const canDecide = outcome !== "" && note.trim().length > 0 && (outcome !== "partial_refund" || Number(refund) > 0);

  return (
    <>
      <PageHeader title={d?.subject ?? "Dispute"} subtitle={d ? `${d.number ?? `#${d.id}`} · opened ${formatDate(d.created_at)}` : undefined}>
        {d ? <StatusBadge status={d.status} /> : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>The dispute</CardTitle>
            </CardHeader>
            <CardContent>
              {isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                  <Field name="Raised by">
                    {d!.raised_by ? (
                      <Link href={`/users/${d!.raised_by.id}`} className="text-brand hover:underline">
                        {d!.raised_by.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field name="Against">
                    {d!.against ? (
                      d!.against.profile_id ? (
                        <Link href={`/vendors/${d!.against.profile_id}`} className="text-brand hover:underline">
                          {d!.against.name}
                        </Link>
                      ) : (
                        d!.against.name
                      )
                    ) : (
                      "A payment"
                    )}
                  </Field>
                  <Field name="On hold">{d!.amount_on_hold ? naira(d!.amount_on_hold) : "—"}</Field>
                  {d!.project ? (
                    <Field name="Project">
                      <Link href={`/projects/${d!.project.id}`} className="text-brand hover:underline">
                        {d!.project.title}
                      </Link>
                      {d!.milestone ? <span className="block text-xs font-normal text-muted">{d!.milestone.title} · {naira(d!.milestone.amount)}</span> : null}
                    </Field>
                  ) : (
                    <Field name="Reference">{d!.reference ?? "—"}</Field>
                  )}
                  <Field name="What's wrong">{d!.reason_label ?? "—"}</Field>
                  <Field name="They asked for">{d!.remedy_label ?? "—"}</Field>
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="What happened">
                      <span className="font-normal">{d!.description}</span>
                    </Field>
                  </div>
                  {d!.escalation_note ? (
                    <div className="col-span-2 sm:col-span-3">
                      <Field name="When they asked Patriai">
                        <span className="font-normal">{d!.escalation_note}</span>
                      </Field>
                    </div>
                  ) : null}
                  <Field name="Reply by">{formatDeadline(d!.reply_by)}</Field>
                  <Field name="Decision due">{formatDeadline(d!.decision_due)}</Field>
                  <Field name="Evidence until">{formatDeadline(d!.evidence_until)}</Field>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
            </CardHeader>
            <CardContent>
              {!d || d.files.length === 0 ? (
                <p className="text-sm text-muted">No files.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {d.files.map((f) => (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="space-y-1">
                      {f.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- uploaded evidence served by the API
                        <img src={f.url} alt={f.name} className="h-24 w-32 rounded-lg object-cover ring-1 ring-line" />
                      ) : (
                        <span className="flex h-24 w-32 items-center justify-center rounded-lg bg-lavender/50 text-xs font-semibold text-brand">{f.kind === "video" ? "Video" : "Document"}</span>
                      )}
                      <p className="text-xs text-muted">From the {f.from}</p>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent>
              {!d ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <ol className="space-y-3">
                  {d.messages.map((m) => (
                    <li key={m.id} className={m.kind === "system" ? "text-center text-xs text-muted" : "rounded-lg border border-line p-3"}>
                      {m.kind === "system" ? (
                        <>
                          {m.body} · {formatDateTime(m.created_at)}
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-muted">
                            {m.kind === "decision" ? "Patriai's decision" : m.from === "patriai" ? "Patriai" : `${m.name} (${m.from})`} · {formatDateTime(m.created_at)}
                          </p>
                          {m.offer ? (
                            <p className="mt-1 text-sm font-semibold text-ink">
                              {offerText(m.offer)} {m.offer.type !== "disagree" ? <StatusBadge status={m.offer.status} /> : null}
                            </p>
                          ) : null}
                          {m.body ? <p className="mt-1 text-sm text-ink">{m.body}</p> : null}
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {active ? (
                <div className="mt-4 flex gap-2">
                  <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write to both sides, e.g. when the inspector visits" aria-label="Message to both sides" className="flex-1" />
                  <Button onClick={() => send.mutate()} disabled={!message.trim() || send.isPending}>
                    {send.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{active ? "Decide" : "Outcome"}</CardTitle>
          </CardHeader>
          <CardContent>
            {!d ? (
              <Skeleton className="h-40 w-full" />
            ) : active ? (
              <div className="space-y-3">
                {outcomes.map((o) => (
                  <label key={o.value} className={`block cursor-pointer rounded-lg border p-3 ${outcome === o.value ? "border-brand bg-brand-soft" : "border-line"}`}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <input type="radio" name="outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} />
                      {o.label}
                    </span>
                    <span className="mt-1 block text-xs text-muted">{o.hint}</span>
                  </label>
                ))}
                {outcome === "partial_refund" ? (
                  <Input value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Refund in naira, less than ${d.milestone ? naira(d.milestone.amount) : "the milestone"}`} aria-label="Refund amount" />
                ) : null}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Why, in words both sides will read"
                  aria-label="Decision note"
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <Button className="w-full" onClick={() => setConfirm(true)} disabled={!canDecide || decide.isPending}>
                  Record decision
                </Button>
                <p className="text-xs text-muted">The decision is final for this dispute. Money moves straight away.</p>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-y-4">
                <Field name="Outcome">{d.status === "rejected" ? "Not upheld" : OUTCOMES[d.outcome ?? "resolved"] ?? "Resolved"}</Field>
                {d.released_amount && Number(d.released_amount) > 0 ? <Field name="Released to the builder">{naira(d.released_amount)}</Field> : null}
                {d.refund_amount && Number(d.refund_amount) > 0 ? <Field name="Refunded to the family">{naira(d.refund_amount)}</Field> : null}
                <Field name="Closed">{formatDateTime(d.resolved_at)}</Field>
                {d.resolution ? <Field name="Note">{d.resolution}</Field> : null}
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Record this decision?"
        message={outcomes.find((o) => o.value === outcome)?.hint ?? ""}
        confirmLabel="Record decision"
        busy={decide.isPending}
        onConfirm={() => decide.mutate()}
        onCancel={() => setConfirm(false)}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
