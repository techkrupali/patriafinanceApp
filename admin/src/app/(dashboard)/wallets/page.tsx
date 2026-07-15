"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, label, naira } from "@/lib/format";
import type { WalletsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { IconSearch } from "@/components/icons";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const TYPES = [
  { value: "", label: "All" },
  { value: "main", label: "Main" },
  { value: "shared", label: "Shared" },
  { value: "project", label: "Project" },
] as const;

export default function WalletsPage() {
  const router = useRouter();
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
    queryKey: ["admin", "wallets", { type, search, page }],
    queryFn: () => api<WalletsData>(`/api/v1/admin/wallets${qs({ type, search, page })}`),
  });

  return (
    <>
      <PageHeader title="Wallets" subtitle="All wallets across the platform" />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by type">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setType(t.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  type === t.value
                    ? "bg-navy text-white"
                    : "bg-lavender/50 text-navy hover:bg-lavender",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-56 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search virtual account number..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search wallets"
            />
          </div>
        </div>

        {isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.wallets.length === 0 ? (
          <EmptyState message="No wallets match your filters." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH>Owner</TH>
                  <TH>Virtual Account</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Created</TH>
                </tr>
              </THead>
              <TBody>
                {data.wallets.map((w) => (
                  <TR key={w.id} clickable onClick={() => router.push(`/wallets/${w.id}`)}>
                    <TD className="font-semibold">{w.name}</TD>
                    <TD>
                      <Badge tone="blue">{label(w.type)}</Badge>
                    </TD>
                    <TD>
                      <p className="font-medium">{w.owner?.name ?? "—"}</p>
                      <p className="text-xs text-muted">{w.owner?.email ?? ""}</p>
                    </TD>
                    <TD className="text-muted">
                      {w.virtual_account ?? "—"}
                      {w.virtual_account_bank ? ` · ${w.virtual_account_bank}` : ""}
                    </TD>
                    <TD>
                      <StatusBadge status={w.status} />
                    </TD>
                    <TD className="text-right font-semibold">{naira(w.balance)}</TD>
                    <TD className="text-muted">{formatDate(w.created_at)}</TD>
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
