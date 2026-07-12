"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, naira } from "@/lib/format";
import type { UsersData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { IconSearch } from "@/components/icons";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export default function UsersPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  // Debounce free-text search so we don't hammer the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "users", { search, status, page }],
    queryFn: () => api<UsersData>(`/api/v1/admin/users${qs({ search, status, page })}`),
  });

  return (
    <>
      <PageHeader title="Users" subtitle="Search, review and manage customer accounts" />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="relative min-w-56 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search name, email or phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search users"
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
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={7} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.users.length === 0 ? (
          <EmptyState message="No users match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>KYC Tier</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total Balance</TH>
                  <TH>Joined</TH>
                </tr>
              </THead>
              <TBody>
                {data.users.map((u) => (
                  <TR key={u.id} clickable onClick={() => router.push(`/users/${u.id}`)}>
                    <TD className="font-semibold">{u.full_name}</TD>
                    <TD className="text-muted">{u.email}</TD>
                    <TD className="text-muted">{u.phone}</TD>
                    <TD>
                      <Badge tone="blue">Tier {u.kyc_tier}</Badge>
                    </TD>
                    <TD>
                      <StatusBadge status={u.status} />
                    </TD>
                    <TD className="text-right font-semibold">{naira(u.total_balance)}</TD>
                    <TD className="text-muted">{formatDate(u.created_at)}</TD>
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
