"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDateTime, label } from "@/lib/format";
import type { SupportRequestsData } from "@/lib/types";
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

const PRIORITY_TONE: Record<string, "red" | "amber" | "gray"> = {
  high: "red",
  medium: "amber",
  low: "gray",
};

export default function SupportPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
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
    queryKey: ["admin", "support-requests", { status, category, priority, search, page }],
    queryFn: () =>
      api<SupportRequestsData>(
        `/api/v1/admin/support-requests${qs({ status, category, priority, search, page })}`,
      ),
  });

  return (
    <>
      <PageHeader title="Support" subtitle="Escalations raised by users through the assistant" />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="relative min-w-56 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search #id, subject, user or reference..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search support requests"
            />
          </div>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </Select>
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Filter by category">
            <option value="">All categories</option>
            <option value="transfer">Transfer</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="wallet">Wallet</option>
            <option value="account">Account</option>
            <option value="transaction">Transaction</option>
            <option value="other">Other</option>
          </Select>
          <Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} aria-label="Filter by priority">
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.support_requests.length === 0 ? (
          <EmptyState message="No support requests match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>#</TH>
                  <TH>User</TH>
                  <TH>Subject</TH>
                  <TH>Category</TH>
                  <TH>Priority</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </tr>
              </THead>
              <TBody>
                {data.support_requests.map((r) => (
                  <TR key={r.id} clickable onClick={() => router.push(`/support/${r.id}`)}>
                    <TD className="font-mono text-xs text-muted">#{r.id}</TD>
                    <TD>
                      <p className="font-medium">{r.user?.name ?? "—"}</p>
                      <p className="text-xs text-muted">{r.user?.email ?? ""}</p>
                    </TD>
                    <TD>
                      <p className="font-medium">{r.subject}</p>
                      <p className="max-w-md truncate text-xs text-muted">{r.description_preview}</p>
                    </TD>
                    <TD>{label(r.category)}</TD>
                    <TD>
                      <Badge tone={PRIORITY_TONE[r.priority] ?? "gray"}>{label(r.priority)}</Badge>
                    </TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-muted">{formatDateTime(r.created_at)}</TD>
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
