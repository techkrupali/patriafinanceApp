"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { emergencyMethodLabel, formatDate } from "@/lib/format";
import type { EmergencyRequestsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function EmergencyPage() {
  const router = useRouter();
  const [status, setStatus] = useState("pending");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "emergency-requests", { status, method, page }],
    queryFn: () =>
      api<EmergencyRequestsData>(
        `/api/v1/admin/emergency-requests${qs({ status, method, page })}`,
      ),
  });

  return (
    <>
      <PageHeader
        title="Emergency"
        subtitle="Unlock requests on emergency wallets — verify uploaded death certificates and legal notices"
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
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by method"
          >
            <option value="">All methods</option>
            <option value="document">Document</option>
            <option value="dual_approval">Dual approval</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.requests.length === 0 ? (
          <EmptyState message="No emergency requests match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Wallet</TH>
                  <TH>Method</TH>
                  <TH>Requested by</TH>
                  <TH>Lock</TH>
                  <TH>Status</TH>
                  <TH>Submitted</TH>
                </tr>
              </THead>
              <TBody>
                {data.requests.map((r) => (
                  <TR
                    key={r.id}
                    clickable
                    onClick={() => router.push(`/emergency/${r.id}`)}
                  >
                    <TD className="font-mono text-xs text-muted">#{r.id}</TD>
                    <TD>
                      <p className="font-medium">{r.wallet?.name ?? "—"}</p>
                      <p className="text-xs text-muted">{r.wallet?.owner?.name ?? ""}</p>
                    </TD>
                    <TD>{emergencyMethodLabel(r.method, r.document_type)}</TD>
                    <TD>
                      <p className="font-medium">{r.requested_by?.name ?? "—"}</p>
                      {r.requested_by?.username ? (
                        <p className="text-xs text-muted">@{r.requested_by.username}</p>
                      ) : null}
                    </TD>
                    <TD>
                      {r.wallet ? (
                        <Badge tone={r.wallet.locked ? "amber" : "green"}>
                          {r.wallet.locked ? "Locked" : "Unlocked"}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-muted">{formatDate(r.created_at)}</TD>
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
