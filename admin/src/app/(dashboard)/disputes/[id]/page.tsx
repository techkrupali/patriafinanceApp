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
  { value: "fix", label: "Fix it by a date", hint: "The builder redoes the work by the date. The money stays on hold until the family approves the fix." },
  { value: "partial_refund", label: "Release less a refund", hint: "The refund stays in the family's project wallet; the rest is paid." },
  { value: "full_refund", label: "Refund in full", hint: "Nothing is paid; the milestone is cancelled and the money stays with the family." },
  { value: "release_full", label: "Not upheld · pay in full", hint: "The builder is paid the milestone, less anything normally held back." },
];
const PAYMENT_OUTCOMES = [
  { value: "refund", label: "Refund", hint: "The amount goes back into the wallet the payment left, as a refund." },
  { value: "resolved", label: "Resolved", hint: "The problem was put right another way." },
  { value: "rejected", label: "Not upheld", hint: "Nothing was wrong with the payment." },
];

const OUTCOMES: Record<string, string> = {
  fixed: "Fixed at no extra cost",
  partial_refund: "Paid less a refund",
  full_refund: "Refunded in full",
  released: "Not upheld · paid in full",
  refunded: "Refunded",
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
  const [fixBy, setFixBy] = useState("");
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
        body: JSON.stringify({ outcome, note: note.trim(), ...(outcome === "partial_refund" || outcome === "refund" ? { refund } : {}), ...(outcome === "fix" ? { fix_by: fixBy } : {}) }),
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

  const take = useMutation({
    mutationFn: () => api(`/api/v1/admin/disputes/${id}/take`, { method: "POST" }),
    onSuccess: () => {
      setToast({ tone: "green", message: "The case is yours. Both sides see Patriai is reviewing it." });
      refresh();
    },
    onError: (err: Error) => setToast({ tone: "red", message: err.message }),
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
  const canDecide =
    outcome !== "" && note.trim().length > 0 && (!["partial_refund", "refund"].includes(outcome) || Number(refund) > 0) && (outcome !== "fix" || fixBy !== "");
  // Deciding before the builder answered or anyone asked Patriai: say so in the confirmation.
  const early = d?.kind === "milestone" && !["escalated", "under_review"].includes(d.status);
  const overdue = d && active && d.decision_due && new Date(d.decision_due) < new Date() && ["escalated", "under_review", "open"].includes(d.status);

  return (
    <>
      <PageHeader title={d?.subject ?? "Dispute"} subtitle={d ? `${d.number ?? `#${d.id}`} · opened ${formatDate(d.created_at)}` : undefined}>
        {d ? <StatusBadge status={d.status} /> : null}
        {d?.can?.take ? (
          <Button variant="outline" onClick={() => take.mutate()} disabled={take.isPending}>
            {take.isPending ? "Taking..." : d.officer ? `Taken by ${d.officer} · take over` : "Take case"}
          </Button>
        ) : null}
      </PageHeader>
      {overdue ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          The decision was due {formatDeadline(d!.decision_due)}. Decide now or write to both sides.
        </div>
      ) : null}

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
                  {Number(d!.amount_on_hold) > 0 ? (
                    <Field name="On hold">{naira(d!.amount_on_hold!)}</Field>
                  ) : d!.payment ? (
                    <Field name="Payment">
                      {naira(d!.payment.amount)}
                      <span className="block text-xs font-normal text-muted">{d!.payment.description ?? ""}</span>
                    </Field>
                  ) : (
                    <Field name="On hold">—</Field>
                  )}
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
                  {d!.fix_by ? <Field name="Fix by">{formatDate(d!.fix_by)}</Field> : null}
                  <Field name="Case officer">{d!.officer ?? "Not taken yet"}</Field>
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
                {outcome === "refund" ? (
                  <Input value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Refund in naira${d.payment ? `, up to ${naira(d.payment.amount)}` : ""}`} aria-label="Refund amount" />
                ) : null}
                {outcome === "fix" ? (
                  <Input type="date" value={fixBy} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setFixBy(e.target.value)} aria-label="Fix by" />
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
                <p className="text-xs text-muted">{outcome === "fix" ? "The money stays on hold until the family approves the fix." : "The decision is final for this dispute. Money moves straight away."}</p>
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-y-4">
                <Field name="Outcome">{d.status === "rejected" ? "Not upheld" : OUTCOMES[d.outcome ?? "resolved"] ?? "Resolved"}</Field>
                {d.released_amount && Number(d.released_amount) > 0 ? <Field name="Released to the builder">{naira(d.released_amount)}</Field> : null}
                {d.held_back && Number(d.held_back) > 0 ? <Field name="Held back as usual">{naira(d.held_back)}</Field> : null}
                {d.refund_amount && Number(d.refund_amount) > 0 ? <Field name={d.kind === "milestone" ? "Refunded to the family" : "Refunded to their wallet"}>{naira(d.refund_amount)}</Field> : null}
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
        message={`${outcomes.find((o) => o.value === outcome)?.hint ?? ""}${early ? " Neither side has asked Patriai to step in yet, so this decides before they've finished talking." : ""}`}
        confirmLabel="Record decision"
        busy={decide.isPending}
        onConfirm={() => decide.mutate()}
        onCancel={() => setConfirm(false)}
      />
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
