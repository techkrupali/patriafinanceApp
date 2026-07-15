"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { approvalActionLabel, formatDateTime, naira } from "@/lib/format";
import type { ApprovalsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function ApprovalsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "approvals", { status, page }],
    queryFn: () => api<ApprovalsData>(`/api/v1/admin/approvals${qs({ status, page })}`),
  });

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Multi-signature sign-off requests across shared wallets"
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
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="executed">Executed</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.approvals.length === 0 ? (
          <EmptyState message="No approval requests match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>ID</TH>
                  <TH>Wallet</TH>
                  <TH>Initiator</TH>
                  <TH>Action</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Approvals</TH>
                  <TH>Created</TH>
                </tr>
              </THead>
              <TBody>
                {data.approvals.map((a) => (
                  <TR
                    key={a.id}
                    clickable
                    onClick={() => router.push(`/approvals/${a.id}`)}
                  >
                    <TD className="font-mono text-xs text-muted">#{a.id}</TD>
                    <TD className="font-semibold">{a.wallet?.name ?? "—"}</TD>
                    <TD>
                      <p className="font-medium">{a.initiator.name}</p>
                      <p className="text-xs text-muted">{a.initiator.email}</p>
                    </TD>
                    <TD>{approvalActionLabel(a.action)}</TD>
                    <TD className="text-right font-semibold">{naira(a.amount)}</TD>
                    <TD>
                      <StatusBadge status={a.status} />
                    </TD>
                    <TD className="text-muted">
                      <span className="font-semibold text-ink">{a.approvals_count}</span>
                      {" / "}
                      {a.required_approvals}
                    </TD>
                    <TD className="text-muted">{formatDateTime(a.created_at)}</TD>
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
