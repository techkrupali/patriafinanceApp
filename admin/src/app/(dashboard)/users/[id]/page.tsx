"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  approvalActionLabel,
  formatDate,
  formatDateTime,
  kycTierName,
  label,
  loanCategoryLabel,
  naira,
  signedNaira,
} from "@/lib/format";
import type { ApiUser, ApiWallet, UserDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { EditUserModal } from "@/components/admin/edit-user-modal";
import { SetTierModal } from "@/components/admin/set-tier-modal";
import { AdjustBalanceModal } from "@/components/admin/adjust-balance-modal";
import { BroadcastModal } from "@/components/admin/broadcast-modal";
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

function SummaryTile({
  label: tileLabel,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-line bg-page px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {tileLabel}
      </p>
      <p
        className={
          "mt-1 text-sm font-bold " +
          (accent === "green" ? "text-brand" : accent === "red" ? "text-danger" : "text-ink")
        }
      >
        {value}
      </p>
    </div>
  );
}

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settingTier, setSettingTier] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [adjustWallet, setAdjustWallet] = useState<ApiWallet | null>(null);
  const [freezeWallet, setFreezeWallet] = useState<ApiWallet | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api<UserDetailData>(`/api/v1/admin/users/${id}`),
  });

  const suspended = data?.user.status === "suspended";
  const nextStatus = suspended ? "active" : "suspended";

  function invalidateUser() {
    queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  function invalidateWithWallets() {
    invalidateUser();
    queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "transactions"] });
  }

  const statusMutation = useMutation({
    mutationFn: () =>
      api<{ user: ApiUser }>(`/api/v1/admin/users/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }),
    onSuccess: () => {
      setConfirming(false);
      setToast({
        tone: "green",
        message: suspended ? "Account activated." : "Account suspended.",
      });
      invalidateUser();
    },
    onError: (err: Error) => {
      setConfirming(false);
      setToast({ tone: "red", message: err.message });
    },
  });

  const walletStatusMutation = useMutation({
    mutationFn: (vars: { walletId: number; status: "active" | "frozen" }) =>
      api<{ wallet: ApiWallet }>(`/api/v1/admin/wallets/${vars.walletId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: (_res, vars) => {
      setFreezeWallet(null);
      setToast({
        tone: "green",
        message: vars.status === "active" ? "Wallet unfrozen." : "Wallet frozen.",
      });
      invalidateWithWallets();
    },
    onError: (err: Error) => {
      setFreezeWallet(null);
      setToast({ tone: "red", message: err.message });
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="User" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const user = data?.user;
  const freezeNext: "active" | "frozen" =
    freezeWallet?.status === "frozen" ? "active" : "frozen";

  return (
    <>
      <PageHeader
        title={isPending ? "User" : user!.full_name}
        subtitle={isPending ? undefined : user!.email}
      >
        {!isPending && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingTier(true)}>
              Set tier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMessaging(true)}>
              Message
            </Button>
            <Button
              variant={suspended ? "primary" : "danger"}
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={statusMutation.isPending}
            >
              {suspended ? "Activate" : "Suspend"}
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Profile */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            {!isPending && <StatusBadge status={user!.status} />}
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-3 gap-2">
                  <SummaryTile
                    label="Total in"
                    value={naira(data!.summary.total_in)}
                    accent="green"
                  />
                  <SummaryTile
                    label="Total out"
                    value={naira(data!.summary.total_out)}
                    accent="red"
                  />
                  <SummaryTile
                    label="Wallets"
                    value={String(data!.summary.wallet_count)}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Field name="Phone">{user!.phone}</Field>
                  <Field name="KYC Tier">
                    <Badge tone="blue">Tier {user!.kyc_tier}</Badge>
                  </Field>
                  <Field name="Email verified">
                    <Badge tone={user!.email_verified ? "green" : "gray"}>
                      {user!.email_verified ? "Verified" : "Unverified"}
                    </Badge>
                  </Field>
                  <Field name="Phone verified">
                    <Badge tone={user!.phone_verified ? "green" : "gray"}>
                      {user!.phone_verified ? "Verified" : "Unverified"}
                    </Badge>
                  </Field>
                  <Field name="PIN set">{user!.has_pin ? "Yes" : "No"}</Field>
                  <Field name="Joined">{formatDate(user!.created_at)}</Field>
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        {/* Wallets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Wallets</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={5} />
          ) : data!.wallets.length === 0 ? (
            <EmptyState message="No wallets." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Balance</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {data!.wallets.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-semibold">{w.name}</TD>
                    <TD>
                      <Badge tone="blue">{label(w.type)}</Badge>
                    </TD>
                    <TD>
                      <StatusBadge status={w.status} />
                    </TD>
                    <TD className="text-right font-semibold">{naira(w.balance)}</TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        {w.status !== "closed" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setAdjustWallet(w)}
                            >
                              Adjust
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setFreezeWallet(w)}
                              disabled={walletStatusMutation.isPending}
                            >
                              {w.status === "frozen" ? "Unfreeze" : "Freeze"}
                            </Button>
                          </>
                        )}
                        <Link
                          href={`/wallets/${w.id}`}
                          className="px-1.5 text-xs font-semibold text-brand hover:underline"
                        >
                          Open
                        </Link>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Loans + Projects */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Loans</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={4} />
          ) : data!.loans.length === 0 ? (
            <EmptyState message="No loans." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {data!.loans.map((l) => (
                  <TR
                    key={l.id}
                    clickable
                    onClick={() => router.push(`/loans/${l.id}`)}
                  >
                    <TD className="font-mono text-xs text-muted">{l.reference}</TD>
                    <TD>{loanCategoryLabel(l.category)}</TD>
                    <TD className="text-right font-semibold">{naira(l.outstanding)}</TD>
                    <TD>
                      <StatusBadge status={l.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={4} />
          ) : data!.projects.length === 0 ? (
            <EmptyState message="No projects." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Title</TH>
                  <TH>Role</TH>
                  <TH className="text-right">Escrow</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {data!.projects.map((p) => (
                  <TR
                    key={p.id}
                    clickable
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <TD className="font-semibold">{p.title}</TD>
                    <TD>
                      <Badge tone="gray" className="capitalize">
                        {p.role}
                      </Badge>
                    </TD>
                    <TD className="text-right font-semibold">{naira(p.reserved)}</TD>
                    <TD>
                      <StatusBadge status={p.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Approvals + KYC */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={3} />
          ) : data!.approvals.length === 0 ? (
            <EmptyState message="No approval requests." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Action</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {data!.approvals.map((a) => (
                  <TR
                    key={a.id}
                    clickable
                    onClick={() => router.push(`/approvals/${a.id}`)}
                  >
                    <TD>{approvalActionLabel(a.action)}</TD>
                    <TD className="text-right font-semibold">{naira(a.amount)}</TD>
                    <TD>
                      <StatusBadge status={a.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KYC Submissions</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={3} cols={3} />
          ) : data!.kyc_submissions.length === 0 ? (
            <EmptyState message="No KYC submissions." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>Tier</TH>
                  <TH>Status</TH>
                  <TH>Submitted</TH>
                </tr>
              </THead>
              <TBody>
                {data!.kyc_submissions.map((k) => (
                  <TR
                    key={k.id}
                    clickable
                    onClick={() => router.push(`/kyc/${k.id}`)}
                  >
                    <TD>
                      <Badge tone="blue">Tier {k.target_tier}</Badge>
                      <span className="ml-2 text-xs text-muted">
                        {kycTierName(k.target_tier)}
                      </span>
                    </TD>
                    <TD>
                      <StatusBadge status={k.status} />
                    </TD>
                    <TD className="text-muted">{formatDate(k.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {/* Devices + Recent transactions */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data!.devices.length === 0 ? (
              <p className="text-sm text-muted">No registered devices.</p>
            ) : (
              <ul className="space-y-4">
                {data!.devices.map((d, i) => (
                  <li key={i} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {d.device_name ?? "Unknown device"}
                      </p>
                      <p className="text-xs text-muted">
                        Last active {formatDateTime(d.last_active_at)}
                      </p>
                    </div>
                    {d.platform ? <Badge tone="gray">{d.platform}</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

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

      {/* ── Modals ─────────────────────────────────────────────── */}
      {editing && user ? (
        <EditUserModal
          userId={id}
          user={user}
          onClose={() => setEditing(false)}
          onSuccess={(msg) => {
            setEditing(false);
            setToast({ tone: "green", message: msg });
            invalidateUser();
          }}
        />
      ) : null}

      {settingTier && user ? (
        <SetTierModal
          userId={id}
          currentTier={user.kyc_tier}
          onClose={() => setSettingTier(false)}
          onSuccess={(msg) => {
            setSettingTier(false);
            setToast({ tone: "green", message: msg });
            invalidateUser();
            queryClient.invalidateQueries({ queryKey: ["admin", "kyc"] });
          }}
        />
      ) : null}

      {messaging && user ? (
        <BroadcastModal
          user={{ id: user.id, name: user.full_name }}
          onClose={() => setMessaging(false)}
          onSuccess={(msg) => {
            setMessaging(false);
            setToast({ tone: "green", message: msg });
          }}
        />
      ) : null}

      {adjustWallet ? (
        <AdjustBalanceModal
          walletId={adjustWallet.id}
          walletName={adjustWallet.name}
          onClose={() => setAdjustWallet(null)}
          onSuccess={(msg) => {
            setAdjustWallet(null);
            setToast({ tone: "green", message: msg });
            invalidateWithWallets();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirming}
        danger={!suspended}
        title={suspended ? "Activate this account?" : "Suspend this account?"}
        message={
          suspended
            ? "The user will regain access to their account and wallets."
            : "The user will be signed out everywhere and blocked from logging in until reactivated."
        }
        confirmLabel={suspended ? "Activate" : "Suspend"}
        busy={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate()}
        onCancel={() => setConfirming(false)}
      />

      <ConfirmDialog
        open={freezeWallet !== null}
        danger={freezeWallet?.status !== "frozen"}
        title={
          freezeWallet?.status === "frozen"
            ? "Unfreeze this wallet?"
            : "Freeze this wallet?"
        }
        message={
          freezeWallet?.status === "frozen"
            ? "The owner regains the ability to move funds in and out of this wallet."
            : "Debits and transfers will be blocked until the wallet is unfrozen. The owner is notified."
        }
        confirmLabel={freezeWallet?.status === "frozen" ? "Unfreeze" : "Freeze"}
        busy={walletStatusMutation.isPending}
        onConfirm={() =>
          freezeWallet &&
          walletStatusMutation.mutate({
            walletId: freezeWallet.id,
            status: freezeNext,
          })
        }
        onCancel={() => setFreezeWallet(null)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
