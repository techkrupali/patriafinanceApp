"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  approvalModeLabel,
  emergencyLabel,
  formatDate,
  formatDateTime,
  label,
  missedPolicyLabel,
  naira,
  ordinal,
  signedNaira,
} from "@/lib/format";
import type { ApiWallet, WalletDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { AdjustBalanceModal } from "@/components/admin/adjust-balance-modal";
import { CrisisUnlockModal } from "@/components/admin/crisis-unlock-modal";
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

export default function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adjusting, setAdjusting] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [crisisUnlocking, setCrisisUnlocking] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "wallet", id],
    queryFn: () => api<WalletDetailData>(`/api/v1/admin/wallets/${id}`),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "wallet", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "emergency-requests"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "frozen" | "closed") =>
      api<{ wallet: ApiWallet }>(`/api/v1/admin/wallets/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_res, status) => {
      setFreezing(false);
      setToast({
        tone: "green",
        message: status === "active" ? "Wallet unfrozen." : "Wallet frozen.",
      });
      invalidate();
    },
    onError: (err: Error) => {
      setFreezing(false);
      setToast({ tone: "red", message: err.message });
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Wallet" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const wallet = data?.wallet;
  const isFrozen = wallet?.status === "frozen";
  const isClosed = wallet?.status === "closed";
  const nextStatus: "active" | "frozen" = isFrozen ? "active" : "frozen";
  const emergency = data?.emergency ?? null;

  return (
    <>
      <PageHeader
        title={isPending ? "Wallet" : wallet!.name}
        subtitle={isPending ? undefined : wallet!.owner?.name ?? undefined}
      >
        {!isPending && <StatusBadge status={wallet!.status} />}
        {!isPending && !isClosed && (
          <>
            <Button variant="outline" onClick={() => setAdjusting(true)}>
              Adjust balance
            </Button>
            <Button
              variant={isFrozen ? "primary" : "danger"}
              onClick={() => setFreezing(true)}
              disabled={statusMutation.isPending}
            >
              {isFrozen ? "Unfreeze" : "Freeze"}
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
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
                <Field name="Type">
                  <Badge tone="blue">{label(wallet!.type)}</Badge>
                </Field>
                <Field name="Balance">{naira(wallet!.balance)}</Field>
                <Field name="Currency">{wallet!.currency}</Field>
                <Field name="Owner">
                  <span className="font-medium text-ink">{wallet!.owner?.name ?? "—"}</span>
                  {wallet!.owner?.email ? (
                    <span className="block text-xs font-normal text-muted">
                      {wallet!.owner.email}
                    </span>
                  ) : null}
                </Field>
                <Field name="Virtual Account">
                  {wallet!.virtual_account ?? "—"}
                  {wallet!.virtual_account_bank ? (
                    <span className="block text-xs font-normal text-muted">
                      {wallet!.virtual_account_bank}
                    </span>
                  ) : null}
                </Field>
                <Field name="Created">{formatDate(wallet!.created_at)}</Field>
                {wallet!.description ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Description">{wallet!.description}</Field>
                  </div>
                ) : null}
                {wallet!.mode ? (
                  <Field name="Who it's for">
                    <Badge tone={wallet!.mode === "shared" ? "green" : "gray"}>
                      {wallet!.mode === "shared" ? "Shared" : "Private"}
                    </Badge>
                  </Field>
                ) : null}
                {wallet!.target_amount ? (
                  <Field name="Target">
                    {naira(wallet!.target_amount)}
                    {wallet!.target_date ? (
                      <span className="block text-xs font-normal text-muted">
                        by {formatDate(wallet!.target_date)}
                      </span>
                    ) : null}
                  </Field>
                ) : null}
                {wallet!.reminder_day ? (
                  <Field name="Save reminder">Monthly, on the {ordinal(wallet!.reminder_day)}</Field>
                ) : null}
                {wallet!.lock ? (
                  <Field name="Lock">
                    <Badge tone={wallet!.lock.locked ? "amber" : "green"}>
                      {wallet!.lock.locked ? "Locked" : "Open"}
                    </Badge>
                    <span className="mt-1 block text-xs font-normal text-muted">
                      {wallet!.lock.mode === "date" ? `Until ${formatDate(wallet!.lock.until)}` : "Until the target is reached"}
                      {" · "}
                      {!wallet!.lock.early_break ? "no early break" : wallet!.lock.approval ? "early break needs everyone's yes" : "early break allowed"}
                    </span>
                  </Field>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Approval config */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Approval Config</CardTitle>
            {!isPending && (
              <Badge tone={data!.approval.enabled ? "green" : "gray"}>
                {data!.approval.enabled ? "Enabled" : "Disabled"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.approval.enabled ? (
              <dl className="grid grid-cols-1 gap-y-5">
                <Field name="Threshold">
                  {data!.approval.threshold != null
                    ? naira(data!.approval.threshold)
                    : "—"}
                  <span className="block text-xs font-normal text-muted">
                    Transfers at or above this amount need sign-off
                  </span>
                </Field>
                <Field name="Who decides">
                  {approvalModeLabel(wallet!.approval_mode, data!.approval.required_approvals)}
                </Field>
                <Field name="Requests expire after">
                  {wallet!.approval_expiry_hours ?? 48} hours
                </Field>
                {wallet!.lock_until_goal ? (
                  <Field name="Lock until goal is reached">
                    <Badge tone={wallet!.goal_locked ? "amber" : "green"}>
                      {wallet!.goal_locked ? "Locked" : "Goal reached"}
                    </Badge>
                    <span className="mt-1 block text-xs font-normal text-muted">
                      Until the target is reached, every payment needs everyone&apos;s yes
                    </span>
                  </Field>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted">
                {emergency
                  ? "Released by its keyholders — see Emergency Rules below."
                  : wallet!.joint
                    ? "Each partner spends alone up to their limits; above them the other partner approves — see Joint below."
                    : wallet!.lock
                      ? "No approval rule. Its lock (above) decides when money can leave."
                      : "This wallet moves funds without multi-signature approval."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Emergency rules — emergency wallets only */}
      {emergency ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Emergency Rules</CardTitle>
              {emergency.locked && emergency.override_national_crisis ? (
                <Button variant="danger" size="sm" onClick={() => setCrisisUnlocking(true)}>
                  National-crisis override
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="For">{(emergency.purposes ?? [emergency.purpose]).map(emergencyLabel).join(", ")}</Field>
                <Field name="Release">
                  {emergency.keyholders && emergency.keyholders.length > 1
                    ? `${emergency.required_keyholders} of ${emergency.keyholders.length} keyholders`
                    : "Owner only"}
                  {emergency.keyholders?.length ? (
                    <span className="block text-xs font-normal text-muted">{emergency.keyholders.join(", ")}</span>
                  ) : null}
                  {emergency.pay_directly ? (
                    <span className="block text-xs font-normal text-muted">Paid to the hospital directly</span>
                  ) : null}
                </Field>
                <Field name="Fast release">
                  {emergency.fast_release_limit
                    ? `Up to ${naira(emergency.fast_release_limit)}, every ${emergency.fast_release_every_days} days`
                    : "Off"}
                </Field>
                <Field name="Trusted contacts">
                  {emergency.trusted_contacts?.length ? emergency.trusted_contacts.join(", ") : "None"}
                  <span className="block text-xs font-normal text-muted">SMS link, no app</span>
                </Field>
                <Field name="Beneficiaries">
                  {emergency.beneficiaries?.length ? emergency.beneficiaries.join(" → ") : "None"}
                  <span className="block text-xs font-normal text-muted">
                    {[emergency.manual_unlock ? "custom PIN unlock" : null, emergency.unlock_on_document ? "death unlock" : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                </Field>
                <Field name="Lock">
                  <Badge tone={emergency.locked ? "amber" : "green"}>
                    {emergency.locked ? "Locked" : "Unlocked"}
                  </Badge>
                </Field>
                {emergency.locked ? (
                  <Field name="National-crisis override">
                    {emergency.override_national_crisis ? "Allowed by owner" : "Not allowed"}
                  </Field>
                ) : (
                  <>
                    <Field name="Unlocked via">
                      {emergency.unlocked_via ? emergencyLabel(emergency.unlocked_via) : "—"}
                    </Field>
                    <Field name="Unlocked">{formatDateTime(emergency.unlocked_at)}</Field>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Savings plan — savings and goal wallets */}
      {!isPending && data!.savings_plan ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Savings Plan</CardTitle>
              <Badge tone={data!.savings_plan.auto_save ? "green" : "gray"}>
                {data!.savings_plan.auto_save ? "Auto-save on" : "By hand"}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="How money comes in">{data!.savings_plan.label}</Field>
                <Field name="If a save is missed">{missedPolicyLabel(data!.savings_plan.missed_policy)}</Field>
                <Field name="Others told of misses">{data!.savings_plan.notify_others_on_miss ? "Yes" : "No"}</Field>
                <Field name="Savers set their own amount">{data!.savings_plan.allow_contributor_edit ? "Yes" : "No"}</Field>
                {data!.early_break ? (
                  <Field name="Early break">
                    {data!.early_break.fee_percent}% fee
                    <span className="block text-xs font-normal text-muted">
                      {data!.early_break.charity ? `Half to ${data!.early_break.charity}` : "All a Patriai fee"}
                    </span>
                  </Field>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Budget — spending wallets (SPD/WAL-09) */}
      {!isPending && data!.budget ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget</CardTitle>
              <Badge tone={data!.budget.over_limit === "stop" ? "red" : "amber"}>
                {data!.budget.over_limit === "stop" ? "Stops over a limit" : "Owner approves over a limit"}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="Budget">
                  {naira(data!.budget.amount)} {data!.budget.period === "one_off" ? "in total" : `a ${data!.budget.period === "weekly" ? "week" : "month"}`}
                  <span className="block text-xs font-normal text-muted">This period from {formatDate(data!.budget.period_start)}</span>
                </Field>
                <Field name="Spent so far">{naira(data!.budget.spent)}</Field>
                <Field name="Funding">
                  {data!.budget.funding === "topup" ? "Topped up from Main" : data!.budget.funding === "split" ? "Split between members" : "Added by hand"}
                </Field>
                <Field name="Leftover">
                  {data!.budget.leftover.mode === "wallet" ? `Moves to ${data!.budget.leftover.wallet_name ?? "a wallet"}` : data!.budget.leftover.mode === "main" ? "Back to Main" : "Stays"}
                </Field>
              </dl>
              <div className="mt-5 space-y-3">
                {data!.budget.categories.map((c) => {
                  const pct = Math.min(100, (parseFloat(c.spent) / Math.max(1, parseFloat(c.limit))) * 100);
                  return (
                    <div key={c.id}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-ink">{c.name}</span>
                        <span className="text-muted">
                          {naira(c.spent)} of {naira(c.limit)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-line">
                        <div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-gold" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {data!.budget.spenders.some((p) => p.categories || p.daily_limit) ? (
                <p className="mt-4 text-xs text-muted">
                  {data!.budget.spenders
                    .filter((p) => p.categories || p.daily_limit)
                    .map((p) => `${p.name}: ${p.categories ? `${p.categories.join(", ")} only` : "all categories"}${p.daily_limit ? `, ${naira(p.daily_limit)} a day` : ""}`)
                    .join(" · ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Goal — goal wallets (GLW-01…05) */}
      {!isPending && data!.wallet.goal ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Goal</CardTitle>
              {data!.wallet.goal.link ? <Badge tone="green">Contribution link on</Badge> : null}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="Kind">{(data!.wallet.goal.kind[0].toUpperCase() + data!.wallet.goal.kind.slice(1)).replace(/_/g, " ")}</Field>
                <Field name="For">{data!.wallet.goal.for ?? "—"}</Field>
                <Field name="Reminders">
                  {data!.wallet.goal.reminders
                    ? [data!.wallet.goal.reminders.before_save ? "2 days before each save" : null, data!.wallet.goal.reminders.nudge ? "Nudge if behind" : null].filter(Boolean).join(" · ") || "Off"
                    : "Off"}
                </Field>
                <Field name="Pays directly">
                  {data!.wallet.goal.payout ? (
                    <>
                      {data!.wallet.goal.payout.to ?? "—"}
                      <span className="block text-xs font-normal text-muted">
                        {data!.wallet.goal.payout.paid_at ? `Paid ${formatDate(data!.wallet.goal.payout.paid_at)}` : `On ${formatDate(data!.wallet.goal.payout.run_on)}`}
                      </span>
                    </>
                  ) : (
                    "No"
                  )}
                </Field>
                {data!.wallet.goal.lines.length ? (
                  <div className="col-span-2 sm:col-span-4">
                    <Field name="What it covers">{data!.wallet.goal.lines.map((l) => `${l.name} ${naira(l.amount)}`).join(" · ")}</Field>
                  </div>
                ) : null}
                {data!.wallet.goal.link ? (
                  <div className="col-span-2 sm:col-span-4">
                    <Field name="Link">
                      <a href={data!.wallet.goal.link} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                        {data!.wallet.goal.link}
                      </a>
                    </Field>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Joint — joint wallets (JNT-01…05) */}
      {!isPending && data!.wallet.joint ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Joint</CardTitle>
              <Badge tone={data!.wallet.joint.state === "open" ? "green" : data!.wallet.joint.state === "waiting" ? "amber" : "gray"}>
                {data!.wallet.joint.state === "waiting" ? "Waiting for partner" : data!.wallet.joint.state === "leaving" ? "Notice given" : data!.wallet.joint.state === "open" ? "Open" : "Closed"}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="Partner">{data!.wallet.joint.partner?.name ?? "Not accepted yet"}</Field>
                <Field name="Contributions">
                  {naira(data!.wallet.joint.contribution.mine)} + {naira(data!.wallet.joint.contribution.partner)}
                  <span className="block text-xs font-normal text-muted">
                    {data!.wallet.joint.contribution.mode} · day {data!.wallet.joint.contribution.day} · if short: {data!.wallet.joint.short === "retry" ? "retry in 2 days" : "wait"}
                  </span>
                </Field>
                <Field name="Spend alone">
                  {naira(data!.wallet.joint.limits.per_payment)} a payment
                  <span className="block text-xs font-normal text-muted">{naira(data!.wallet.joint.limits.per_day)} a day · expires {data!.wallet.joint.expiry_hours}h</span>
                </Field>
                <Field name="Always both">
                  {[data!.wallet.joint.always.new_account ? "New accounts" : null, data!.wallet.joint.always.personal ? "Personal wallets" : null, data!.wallet.joint.always.rules ? "Rule changes" : null].filter(Boolean).join(", ") || "—"}
                </Field>
                <Field name="Notifications">
                  {[data!.wallet.joint.notify.weekly ? "Weekly summary" : null, data!.wallet.joint.notify.statement ? "Monthly statement" : null, data!.wallet.joint.notify.big_payment ? `Over ${naira(data!.wallet.joint.notify.big_amount)}` : null].filter(Boolean).join(" · ") || "Every payment only"}
                </Field>
                <Field name="If one leaves">
                  {data!.wallet.joint.leave.split === "contributed" ? "Split by what each put in" : data!.wallet.joint.leave.split === "equal" ? "Split equally" : "Decide together"}
                  <span className="block text-xs font-normal text-muted">{data!.wallet.joint.leave.notice_days} days&apos; notice</span>
                </Field>
                {data!.wallet.joint.proposal ? <Field name="Change waiting">{data!.wallet.joint.proposal.summary}</Field> : null}
                {data!.wallet.joint.leaving ? <Field name="Leaving">Ends {formatDate(data!.wallet.joint.leaving.ends_on)}</Field> : null}
                {data!.wallet.joint.closing ? <Field name="Closing">Waiting for the second PIN</Field> : null}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Child — child wallets (CHW-01…07) */}
      {!isPending && data!.wallet.child ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Child</CardTitle>
              <Badge tone={data!.wallet.child.phone.linked ? "green" : "gray"}>
                {data!.wallet.child.phone.mode === "managed" ? "Managed by parent" : data!.wallet.child.phone.linked ? "Phone linked" : "Phone not linked"}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="Child">
                  {data!.wallet.child.first_name} {data!.wallet.child.last_name ?? ""}
                  <span className="block text-xs font-normal text-muted">Age {data!.wallet.child.age_band.replace("_", " to ").replace("under to ", "under ")}</span>
                </Field>
                <Field name="Pocket money">
                  {naira(data!.wallet.child.allowance.amount)} {data!.wallet.child.allowance.frequency === "biweekly" ? "every 2 weeks" : data!.wallet.child.allowance.frequency}
                  <span className="block text-xs font-normal text-muted">
                    From {formatDate(data!.wallet.child.allowance.starts_on)}
                    {data!.wallet.child.allowance.pause_holidays ? " · paused in school holidays" : ""}
                  </span>
                </Field>
                <Field name="Spending">
                  {naira(data!.wallet.child.controls.daily_limit)} a day
                  <span className="block text-xs font-normal text-muted">
                    {[data!.wallet.child.controls.shops ? "shops" : null, data!.wallet.child.controls.friends ? "friends" : null, data!.wallet.child.controls.online ? "online" : null, data!.wallet.child.controls.cash ? "cash" : null].filter(Boolean).join(", ") || "Nothing on"}
                  </span>
                </Field>
                <Field name="Requests">
                  {Number(data!.wallet.child.requests.auto_limit) > 0 ? `Auto up to ${naira(data!.wallet.child.requests.auto_limit)}` : "All to parents"}
                  <span className="block text-xs font-normal text-muted">
                    {data!.wallet.child.requests.auto_per_week} a week · {data!.wallet.child.requests.approvers === "all" ? "both parents" : "either parent"}
                    {data!.wallet.child.requests.reason_required ? " · reason needed" : ""}
                  </span>
                </Field>
                <Field name="Goal">
                  {data!.wallet.child.goal ? (
                    <>
                      <Link href={`/wallets/${data!.wallet.child.goal.wallet_id}`} className="text-brand hover:underline">
                        {data!.wallet.child.goal.name}
                      </Link>
                      <span className="block text-xs font-normal text-muted">
                        {naira(data!.wallet.child.goal.saved)} of {naira(data!.wallet.child.goal.target)} · saves {data!.wallet.child.goal.save_percent}%, match {data!.wallet.child.goal.match_percent}%
                      </span>
                    </>
                  ) : (
                    "None"
                  )}
                </Field>
                <Field name="Co-parent">
                  {data!.wallet.child.coparent
                    ? [data!.wallet.child.coparent.approve ? "Approves" : null, data!.wallet.child.coparent.change ? "Changes limits" : null, data!.wallet.child.coparent.see ? "Sees payments" : null].filter(Boolean).join(", ")
                    : "None"}
                </Field>
                <Field name="Gifts from relatives">{data!.wallet.child.gifts ? "Allowed" : "Off"}</Field>
                {data!.wallet.child.phone.code ? <Field name="Link code">{data!.wallet.child.phone.code}</Field> : null}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Giving — giving wallets (GIV/WAL-18) */}
      {!isPending && data!.giving ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Giving</CardTitle>
              {data!.giving.settings.anonymous ? <Badge tone="gray">Gives anonymously</Badge> : null}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Field name="Set aside">{naira(data!.giving.set_aside)}</Field>
                <Field name="Given this year">{naira(data!.giving.given_this_year)}</Field>
                <Field name="Set aside by">
                  {data!.giving.set_aside_rules.length ? data!.giving.set_aside_rules.map((r) => r.name).join(" · ") : "By hand"}
                </Field>
                <Field name="Recipients">{data!.giving.recipients.map((r) => r.name).join(", ") || "None"}</Field>
                <Field name="Ask before paying">{data!.giving.settings.ask_first ? "Yes" : "No"}</Field>
                <Field name="Receipts · statement">
                  {data!.giving.settings.receipts ? "Receipts" : "No receipts"} · {data!.giving.settings.yearly_statement ? "Yearly statement" : "No statement"}
                </Field>
                {data!.giving.pledge ? (
                  <Field name="Pledge">
                    {data!.giving.pledge.name}
                    <span className="block text-xs font-normal text-muted">
                      {naira(data!.giving.pledge.paid)} of {naira(data!.giving.pledge.total)}
                    </span>
                  </Field>
                ) : null}
              </dl>
              {data!.giving.schedules.length ? (
                <Table containerClassName="mt-5">
                  <THead>
                    <tr>
                      <TH>Giving date</TH>
                      <TH>To</TH>
                      <TH>When</TH>
                      <TH>Amount</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data!.giving.schedules.map((s) => (
                      <TR key={s.id}>
                        <TD className="font-medium">{s.label}</TD>
                        <TD>{s.to}</TD>
                        <TD className="text-muted">{s.when}</TD>
                        <TD>{naira(s.amount)}</TD>
                        <TD>
                          <Badge tone={s.enabled ? "green" : "gray"}>{s.enabled ? (s.ask_first ? "Asks first" : "Automatic") : "Paused or done"}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : null}
              {data!.giving.recent.length ? (
                <p className="mt-4 text-xs text-muted">
                  Recently:{" "}
                  {data!.giving.recent.map((p) => `${naira(p.amount)} to ${p.to} (${p.status}${p.receipt_no ? `, ${p.receipt_no}` : ""})`).join(" · ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Members */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.members.length === 0 ? (
              <p className="text-sm text-muted">No members.</p>
            ) : (
              <ul className="space-y-4">
                {data!.members.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                      <p className="truncate text-xs text-muted">{m.email}</p>
                      <Badge tone="gray" className="mt-1.5">
                        {label(m.role)}
                      </Badge>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {/* Owners and co-owners approve by their role; others only when allowed. */}
                      {m.can_approve || ["owner", "co_owner", "admin"].includes(m.role) ? (
                        <Badge tone="green">Approver</Badge>
                      ) : null}
                      {m.status !== "active" ? <Badge tone="amber">{label(m.status)}</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!isPending && data!.invitations.length > 0 ? (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Invited, not answered yet
                </p>
                <ul className="mt-3 space-y-3">
                  {data!.invitations.map((inv) => (
                    <li key={inv.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{inv.invitee}</p>
                        <p className="truncate text-xs text-muted">
                          By {inv.inviter ?? "—"} · expires {formatDate(inv.expires_at)}
                        </p>
                      </div>
                      <Badge tone="amber">{label(inv.role)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={5} cols={5} />
          ) : data!.recent_transactions.length === 0 ? (
            <EmptyState message="No transactions yet." />
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
                {data!.recent_transactions.map((t) => (
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
                        (t.direction === "credit" ? "text-brand" : "text-ink")
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

      {adjusting && wallet ? (
        <AdjustBalanceModal
          walletId={id}
          walletName={wallet.name}
          onClose={() => setAdjusting(false)}
          onSuccess={(msg) => {
            setAdjusting(false);
            setToast({ tone: "green", message: msg });
            invalidate();
          }}
        />
      ) : null}

      {crisisUnlocking && wallet ? (
        <CrisisUnlockModal
          walletId={id}
          walletName={wallet.name}
          onClose={() => setCrisisUnlocking(false)}
          onSuccess={(msg) => {
            setCrisisUnlocking(false);
            setToast({ tone: "green", message: msg });
            invalidate();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={freezing}
        danger={!isFrozen}
        title={isFrozen ? "Unfreeze this wallet?" : "Freeze this wallet?"}
        message={
          isFrozen
            ? "The owner regains the ability to move funds in and out of this wallet."
            : "Debits and transfers will be blocked until the wallet is unfrozen. The owner is notified."
        }
        confirmLabel={isFrozen ? "Unfreeze" : "Freeze"}
        busy={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate(nextStatus)}
        onCancel={() => setFreezing(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
