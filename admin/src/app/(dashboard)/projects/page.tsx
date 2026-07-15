"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, naira } from "@/lib/format";
import type { ProjectsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function ProjectsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "projects", { status, page }],
    queryFn: () => api<ProjectsData>(`/api/v1/admin/projects${qs({ status, page })}`),
  });

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Vendor escrow projects and milestone releases"
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
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={9} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.projects.length === 0 ? (
          <EmptyState message="No projects match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Title</TH>
                  <TH>Owner</TH>
                  <TH>Vendor</TH>
                  <TH className="text-right">Budget</TH>
                  <TH className="text-right">Escrow balance</TH>
                  <TH className="text-right">Reserved</TH>
                  <TH className="text-right">Released</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Milestones</TH>
                  <TH>Created</TH>
                </tr>
              </THead>
              <TBody>
                {data.projects.map((p) => (
                  <TR
                    key={p.id}
                    clickable
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <TD className="font-medium">{p.title}</TD>
                    <TD>{p.owner?.name ?? "—"}</TD>
                    <TD>{p.vendor?.name ?? "—"}</TD>
                    <TD className="text-right font-semibold">{naira(p.budget)}</TD>
                    <TD className="text-right font-semibold">{naira(p.wallet_balance)}</TD>
                    <TD className="text-right">{naira(p.reserved)}</TD>
                    <TD className="text-right">{naira(p.released)}</TD>
                    <TD>
                      <StatusBadge status={p.status} />
                    </TD>
                    <TD className="text-right">{p.milestones_count.toLocaleString()}</TD>
                    <TD className="text-muted">{formatDate(p.created_at)}</TD>
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
