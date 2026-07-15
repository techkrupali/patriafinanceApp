"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, loanCategoryLabel, naira } from "@/lib/format";
import type { LoansData, RunDueResult } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function LoansPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "loans", { status, page }],
    queryFn: () => api<LoansData>(`/api/v1/admin/loans${qs({ status, page })}`),
  });

  const runDue = useMutation({
    mutationFn: () => api<RunDueResult>("/api/v1/admin/loans/run-due", { method: "POST" }),
    onSuccess: (res) => {
      setToast({
        tone: "green",
        message: `${res.loans_processed} loan${res.loans_processed === 1 ? "" : "s"} processed · ${res.loans_penalized} penalised · ${naira(res.penalty_charged)} charged`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "loans"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (err: Error) => setToast({ tone: "red", message: err.message }),
  });

  return (
    <>
      <PageHeader
        title="Loans"
        subtitle="Applications, disbursements and repayment tracking"
      >
        <Button
          variant="outline"
          onClick={() => runDue.mutate()}
          disabled={runDue.isPending}
        >
          {runDue.isPending ? "Running..." : "Run due repayments"}
        </Button>
      </PageHeader>

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
            <option value="disbursed">Disbursed</option>
            <option value="active">Active</option>
            <option value="repaid">Repaid</option>
            <option value="defaulted">Defaulted</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.loans.length === 0 ? (
          <EmptyState message="No loans match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Borrower</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Principal</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </tr>
              </THead>
              <TBody>
                {data.loans.map((l) => (
                  <TR
                    key={l.id}
                    clickable
                    onClick={() => router.push(`/loans/${l.id}`)}
                  >
                    <TD className="font-mono text-xs text-muted">{l.reference}</TD>
                    <TD>
                      <p className="font-medium">{l.user.name}</p>
                      <p className="text-xs text-muted">{l.user.email}</p>
                    </TD>
                    <TD>{loanCategoryLabel(l.category)}</TD>
                    <TD className="text-right font-semibold">{naira(l.principal)}</TD>
                    <TD className="text-right font-semibold">{naira(l.outstanding)}</TD>
                    <TD>
                      <StatusBadge status={l.status} />
                    </TD>
                    <TD className="text-muted">{formatDate(l.created_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.pagination} onPage={setPage} />
          </>
        )}
      </Card>

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
