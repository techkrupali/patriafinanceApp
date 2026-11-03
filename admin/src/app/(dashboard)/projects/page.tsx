"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { formatDate, naira } from "@/lib/format";
import type { ProjectStatus, ProjectsData } from "@/lib/types";
import { Pagination } from "@/components/pagination";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNaira } from "@/components/dashboard/flow-chart";
import { IconArrowUpRight, IconCheckCircle, IconChevronRight, IconClock, IconProjects } from "@/components/icons";
import { agoText, Avatar, HeroCard, KpiTile, PageTitle, PANEL, Progress, SearchBox, SplitBar, StatusDot, StatusTabs } from "@/components/list-kit";

const STATUS: Record<ProjectStatus, { word: string; dot: string; onDark: string }> = {
  active: { word: "Active", dot: "bg-brand", onDark: "#5FD3A5" },
  completed: { word: "Completed", dot: "bg-[#1FA07A]", onDark: "#B9F0D8" },
  cancelled: { word: "Cancelled", dot: "bg-line-strong", onDark: "rgba(243,247,244,0.35)" },
};
const STATUS_ORDER: ProjectStatus[] = ["active", "completed", "cancelled"];

type Tab = "" | ProjectStatus;

export default function ProjectsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("");
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

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["admin", "projects", { status, search, page }],
    queryFn: () => api<ProjectsData>(`/api/v1/admin/projects${qs({ status, search, page })}`),
    placeholderData: (prev) => prev,
  });
  const summary = data?.summary;
  const reset = () => setPage(1);

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Building" title="Projects" subtitle="Families building with a builder: money held in escrow and paid out milestone by milestone." />

      {summary ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <HeroCard
            icon={IconProjects}
            title="Held in escrow"
            sub={`${summary.by_status.active.toLocaleString()} active project${summary.by_status.active === 1 ? "" : "s"} · ${compactNaira(Number(summary.active_budget))} in budgets`}
            money={Number(summary.in_escrow)}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Every project, by stage</p>
            <SplitBar
              empty="No projects yet."
              parts={STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].word, value: summary.by_status[s] ?? 0, color: STATUS[s].onDark }))}
            />
          </HeroCard>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-5 lg:col-span-3">
            <KpiTile icon={IconArrowUpRight} label="Paid to builders" value={compactNaira(Number(summary.released))} hint="Milestones released" tone="brand" />
            <KpiTile icon={IconClock} label="Proof to check" value={summary.proof_waiting.toLocaleString()} hint={summary.proof_waiting ? "Families still to say yes" : "No proof waiting"} tone={summary.proof_waiting ? "gold" : "muted"} />
            <KpiTile icon={IconCheckCircle} label="Completed" value={summary.by_status.completed.toLocaleString()} hint="Every milestone paid" tone="muted" />
          </div>
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Skeleton className="h-[210px] rounded-[22px] lg:col-span-2" />
          <Skeleton className="h-[210px] rounded-[22px]" />
          <Skeleton className="h-[210px] rounded-[22px]" />
          <Skeleton className="h-[210px] rounded-[22px]" />
        </div>
      ) : null}

      <div className={PANEL}>
        <div className="space-y-4 border-b border-line px-5 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusTabs<Tab>
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); reset(); }}
              tabs={[{ value: "", label: "All", count: summary?.all }, ...STATUS_ORDER.map((s) => ({ value: s as Tab, label: STATUS[s].word, count: summary?.by_status[s] }))]}
            />
            <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search project, family or builder" label="Search projects" />
          </div>
          {data ? (
            <p className="text-xs text-muted">
              {data.pagination.total.toLocaleString()} project{data.pagination.total === 1 ? "" : "s"}
              {isFetching ? " · updating…" : ""}
            </p>
          ) : null}
        </div>

        {isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.projects.length === 0 ? (
          <EmptyState message="No projects match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-5 py-3 font-semibold">Project</th>
                    <th className="px-3 py-3 font-semibold">Family</th>
                    <th className="px-3 py-3 font-semibold">Builder</th>
                    <th className="px-3 py-3 text-right font-semibold">Budget</th>
                    <th className="w-52 px-3 py-3 font-semibold">Paid out</th>
                    <th className="px-3 py-3 text-right font-semibold">In escrow</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => {
                    const S = STATUS[p.status] ?? STATUS.active;
                    const budget = Number(p.budget);
                    const pct = budget ? (Number(p.released) / budget) * 100 : 0;
                    return (
                      <tr key={p.id} onClick={() => router.push(`/projects/${p.id}`)} className="group cursor-pointer border-t border-line/70 transition-colors hover:bg-rowhover">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#08392F] text-[#5FD3A5]">
                              <IconProjects className="h-[18px] w-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[220px] truncate font-bold text-ink group-hover:text-brand">{p.title}</p>
                              <p className="text-xs text-muted">
                                <span className="font-mono">#{p.id}</span> · started {agoText(p.created_at)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            <Avatar size="sm" name={p.owner?.name} seed={p.owner?.id} />
                            <p className="max-w-[130px] truncate font-semibold text-ink">{p.owner?.name ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          {p.vendor ? (
                            <div className="flex items-center gap-2">
                              <Avatar size="sm" name={p.vendor.name} seed={p.vendor.id} />
                              <p className="max-w-[130px] truncate font-semibold text-ink">{p.vendor.name}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">Not joined yet</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-extrabold tabular-nums text-ink">{naira(p.budget)}</td>
                        <td className="px-3 py-3.5">
                          <Progress pct={pct} />
                          <p className="mt-1 text-[11px] text-muted">
                            {(p.milestones_released ?? 0).toLocaleString()} of {p.milestones_count.toLocaleString()} milestones
                            {p.milestones_submitted ? <span className="font-semibold text-warn"> · {p.milestones_submitted} proof to check</span> : null}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <p className="whitespace-nowrap font-semibold tabular-nums text-ink">{naira(p.wallet_balance)}</p>
                          {Number(p.reserved) > 0 ? <p className="text-[11px] text-muted">{compactNaira(Number(p.reserved))} set aside</p> : null}
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusDot color={S.dot}>{S.word}</StatusDot>
                          <p className="mt-0.5 text-[11px] text-muted">{formatDate(p.created_at)}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <IconChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line">
              <Pagination meta={data.pagination} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
