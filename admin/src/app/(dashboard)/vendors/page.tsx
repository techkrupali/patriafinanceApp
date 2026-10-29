"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, label } from "@/lib/format";
import type { VendorsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

/** Businesses families pay by milestone; the ones waiting for a check come first. */
export default function VendorsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "vendors", { status, q, page }],
    queryFn: () => api<VendorsData>(`/api/v1/admin/vendors${qs({ status, q, page })}`),
  });

  const waiting = (data?.counts.submitted ?? 0) + (data?.counts.needs_changes ?? 0);

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle={data ? `${data.counts.submitted ?? 0} waiting for a check · ${data.counts.verified ?? 0} verified` : "Business verification"}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search business name"
            aria-label="Search business name"
            className="w-64"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="submitted">Waiting for a check</option>
            <option value="needs_changes">Sent back</option>
            <option value="verified">Verified</option>
            <option value="draft">Not submitted</option>
          </Select>
          {waiting > 0 ? <span className="text-sm text-muted">{waiting} need attention</span> : null}
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.vendors.length === 0 ? (
          <EmptyState message="No businesses match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Business</TH>
                  <TH>Owner</TH>
                  <TH>Trade</TH>
                  <TH>Checks</TH>
                  <TH>Status</TH>
                  <TH>Sent</TH>
                </tr>
              </THead>
              <TBody>
                {data.vendors.map((v) => {
                  const checks = v.checks ? Object.values(v.checks) : [];
                  const approved = checks.filter((c) => c.status === "approved").length;
                  return (
                    <TR key={v.id} clickable onClick={() => router.push(`/vendors/${v.id}`)}>
                      <TD>
                        <p className="font-medium">{v.business_name}</p>
                        <p className="text-xs text-muted">{v.location ?? ""}</p>
                      </TD>
                      <TD>{v.owner_name ?? "—"}</TD>
                      <TD>{label(v.category)}</TD>
                      <TD className="text-muted">{checks.length ? `${approved} of ${checks.length} approved` : "—"}</TD>
                      <TD>
                        <StatusBadge status={v.status} />
                      </TD>
                      <TD className="text-muted">{formatDate(v.submitted_at)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination meta={data.pagination} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
