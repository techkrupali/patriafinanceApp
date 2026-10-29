"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, formatDeadline, naira } from "@/lib/format";
import type { DisputesData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/** Disputes; the ones Patriai was asked to decide come first, by their decision date. */
export default function DisputesPage() {
  const router = useRouter();
  const [status, setStatus] = useState("active");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "disputes", { status, kind, page }],
    queryFn: () => api<DisputesData>(`/api/v1/admin/disputes${qs({ status, kind, page })}`),
  });

  return (
    <>
      <PageHeader
        title="Disputes"
        subtitle={data ? `${data.counts.escalated ?? 0} waiting for a decision · ${data.counts.open ?? 0} waiting for the builder` : "Patriai's decisions"}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="active">Not closed</option>
            <option value="escalated">Waiting for Patriai</option>
            <option value="open">Waiting for the builder</option>
            <option value="responded">Builder replied</option>
            <option value="fixing">Being fixed</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Not upheld</option>
            <option value="">All</option>
          </Select>
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by kind"
          >
            <option value="">Milestones and payments</option>
            <option value="milestone">Project milestones</option>
            <option value="payment_made">Payments made</option>
            <option value="payment_received">Payments received</option>
          </Select>
        </div>
        {isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.disputes.length === 0 ? (
          <EmptyState message="No disputes match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Dispute</TH>
                  <TH>Raised by</TH>
                  <TH>Against</TH>
                  <TH className="text-right">On hold</TH>
                  <TH>Status</TH>
                  <TH>Decide by</TH>
                </tr>
              </THead>
              <TBody>
                {data.disputes.map((d) => (
                  <TR key={d.id} clickable onClick={() => router.push(`/disputes/${d.id}`)}>
                    <TD>
                      <p className="font-medium">{d.subject}</p>
                      <p className="font-mono text-xs text-muted">
                        {d.number ?? `#${d.id}`}
                        {d.project ? ` · ${d.project.title}` : ""}
                      </p>
                    </TD>
                    <TD>{d.raised_by_name ?? "—"}</TD>
                    <TD>{d.against ?? "Patriai"}</TD>
                    <TD className="text-right">{d.amount_on_hold ? naira(d.amount_on_hold) : "—"}</TD>
                    <TD>
                      <StatusBadge status={d.status} />
                      <p className="mt-1 text-xs text-muted">{d.status_label}</p>
                    </TD>
                    <TD className="text-muted">{d.status === "escalated" ? formatDeadline(d.decision_due) : d.status === "open" ? `Reply by ${formatDeadline(d.reply_by)}` : formatDate(d.resolved_at ?? d.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.pagination} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
