"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, kycTierLabel, label } from "@/lib/format";
import type { KycData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function KycPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "kyc", { status, page }],
    queryFn: () => api<KycData>(`/api/v1/admin/kyc${qs({ status, page })}`),
  });

  return (
    <>
      <PageHeader
        title="KYC"
        subtitle="Identity, address and source-of-funds verification review"
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
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.submissions.length === 0 ? (
          <EmptyState message="No KYC submissions match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Applicant</TH>
                  <TH>Verification</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Submitted</TH>
                </tr>
              </THead>
              <TBody>
                {data.submissions.map((s) => (
                  <TR
                    key={s.id}
                    clickable
                    onClick={() => router.push(`/kyc/${s.id}`)}
                  >
                    <TD className="font-mono text-xs text-muted">#{s.id}</TD>
                    <TD>
                      <p className="font-medium">{s.user?.name ?? "—"}</p>
                      <p className="text-xs text-muted">{s.user?.email ?? ""}</p>
                    </TD>
                    <TD>{kycTierLabel(s.target_tier)}</TD>
                    <TD>{label(s.type)}</TD>
                    <TD>
                      <StatusBadge status={s.status} />
                    </TD>
                    <TD className="text-muted">{formatDate(s.created_at)}</TD>
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
