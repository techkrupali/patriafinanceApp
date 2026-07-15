"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, formatDateTime, naira } from "@/lib/format";
import type { ProjectDetailData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/ui/badge";
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

function PartyPanel({
  title,
  party,
}: {
  title: string;
  party: { id: number; name: string; email: string } | null;
}) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {party ? (
          <dl className="grid grid-cols-1 gap-y-5">
            <Field name="Name">
              <Link href={`/users/${party.id}`} className="text-brand hover:underline">
                {party.name}
              </Link>
            </Field>
            <Field name="Email">
              <span className="font-normal text-muted">{party.email}</span>
            </Field>
          </dl>
        ) : (
          <p className="text-sm text-muted">Not assigned.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "project", id],
    queryFn: () => api<ProjectDetailData>(`/api/v1/admin/projects/${id}`),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Project" />
        <Card>
          <ErrorState message={error.message} />
        </Card>
      </>
    );
  }

  const project = data?.project;
  const progressPct =
    project && project.milestones_total > 0
      ? Math.round((project.milestones_released / project.milestones_total) * 100)
      : 0;

  return (
    <>
      <PageHeader
        title={isPending ? "Project" : project!.title}
        subtitle={isPending ? undefined : project!.owner?.name ?? undefined}
      >
        {!isPending && <StatusBadge status={project!.status} />}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Project summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Project</CardTitle>
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
                <Field name="Escrow balance">{naira(project!.wallet_balance)}</Field>
                <Field name="Budget">{naira(project!.budget)}</Field>
                <Field name="Reserved">{naira(project!.reserved)}</Field>
                <Field name="Available">{naira(project!.available)}</Field>
                <Field name="Released">{naira(project!.released)}</Field>
                <Field name="Status">
                  <StatusBadge status={project!.status} />
                </Field>
                <Field name="Escrow wallet">
                  {project!.wallet_id ? (
                    <Link
                      href={`/wallets/${project!.wallet_id}`}
                      className="text-brand hover:underline"
                    >
                      #{project!.wallet_id}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Field>
                <Field name="Created">{formatDate(project!.created_at)}</Field>
                {project!.description ? (
                  <div className="col-span-2 sm:col-span-3">
                    <Field name="Description">{project!.description}</Field>
                  </div>
                ) : null}
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Milestone progress
                  </dt>
                  <dd className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">
                        {project!.milestones_released} of {project!.milestones_total}{" "}
                        released
                      </span>
                      <span className="text-muted">{progressPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-lavender/40">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                      />
                    </div>
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* Owner + vendor */}
        <div className="grid grid-cols-1 gap-4 lg:col-span-1">
          {isPending ? (
            <Card>
              <CardHeader>
                <CardTitle>Parties</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <PartyPanel title="Owner" party={data!.owner} />
              <PartyPanel title="Vendor" party={data!.vendor} />
            </>
          )}
        </div>
      </div>

      {/* Milestones */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          {isPending ? (
            <TableSkeleton rows={5} cols={7} />
          ) : data!.milestones.length === 0 ? (
            <EmptyState message="No milestones yet." />
          ) : (
            <Table containerClassName="pb-2">
              <THead>
                <tr>
                  <TH>#</TH>
                  <TH>Title</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Proof</TH>
                  <TH>Submitted</TH>
                  <TH>Released</TH>
                  <TH>Reference</TH>
                </tr>
              </THead>
              <TBody>
                {data!.milestones.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-mono text-xs text-muted">{m.sequence}</TD>
                    <TD>
                      <p className="font-medium">{m.title}</p>
                      {m.description ? (
                        <p className="max-w-xs truncate text-xs text-muted">
                          {m.description}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="text-right font-semibold">{naira(m.amount)}</TD>
                    <TD>
                      <StatusBadge status={m.status} />
                    </TD>
                    <TD className="max-w-xs truncate text-muted">{m.proof ?? "—"}</TD>
                    <TD className="text-muted">{formatDateTime(m.submitted_at)}</TD>
                    <TD className="text-muted">{formatDateTime(m.released_at)}</TD>
                    <TD className="font-mono text-xs text-muted">
                      {m.released_transaction_reference ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
