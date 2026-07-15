"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDateTime, label, signedNaira } from "@/lib/format";
import type { TransactionsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { IconSearch } from "@/components/icons";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function TransactionsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "transactions", { status, type, search, page }],
    queryFn: () =>
      api<TransactionsData>(`/api/v1/admin/transactions${qs({ status, type, search, page })}`),
  });

  return (
    <>
      <PageHeader title="Transactions" subtitle="Every movement across all wallets" />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="relative min-w-56 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search reference..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search transactions"
            />
          </div>
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
            <option value="successful">Successful</option>
            <option value="failed">Failed</option>
          </Select>
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="fund">Fund</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="transfer_in">Transfer in</option>
            <option value="transfer_out">Transfer out</option>
            <option value="reversal">Reversal</option>
            <option value="admin_credit">Admin credit</option>
            <option value="admin_debit">Admin debit</option>
            <option value="loan_disbursement">Loan disbursement</option>
            <option value="loan_repayment">Loan repayment</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.transactions.length === 0 ? (
          <EmptyState message="No transactions match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Wallet / Owner</TH>
                  <TH>Type</TH>
                  <TH>Direction</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Date</TH>
                </tr>
              </THead>
              <TBody>
                {data.transactions.map((t) => (
                  <TR
                    key={t.id}
                    clickable
                    onClick={() => router.push(`/transactions/${t.id}`)}
                  >
                    <TD className="font-mono text-xs text-muted">{t.reference}</TD>
                    <TD>
                      <p className="font-medium">{t.wallet?.name ?? `#${t.wallet_id}`}</p>
                      <p className="text-xs text-muted">{t.wallet?.owner ?? ""}</p>
                    </TD>
                    <TD>{label(t.type)}</TD>
                    <TD>
                      <Badge tone={t.direction === "credit" ? "green" : "gray"}>
                        {t.direction === "credit" ? "Credit" : "Debit"}
                      </Badge>
                    </TD>
                    <TD
                      className={
                        "text-right font-semibold " +
                        (t.direction === "credit" ? "text-brand" : "text-danger")
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
            <Pagination meta={data.pagination} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
