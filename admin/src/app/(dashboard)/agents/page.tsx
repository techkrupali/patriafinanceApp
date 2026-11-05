"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AdminAgent, AgentsData } from "@/lib/types";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { FormModal } from "@/components/admin/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTile, PageTitle, PANEL, SearchBox, StatusTabs } from "@/components/list-kit";
import { IconAlert, IconBuilding, IconCheckCircle, IconMapPin, IconTransactions } from "@/components/icons";

type Draft = Omit<AdminAgent, "id" | "created_at" | "lat" | "lng"> & { id?: number; lat: string; lng: string };
type Status = "all" | "active" | "off";

const EMPTY: Draft = { name: "", address: "", area: "", city: "Lagos", state: "Lagos", lat: "", lng: "", hours: "", phone: "", cash_in: true, cash_out: false, active: true };

function Field({ name, hint, children }: { name: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{name}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}

const coord = (v: string) => (v.trim() === "" ? null : Number(v));

/**
 * ADD-06 the cash agents people see under "Cash at an agent", nearest first.
 * Each needs a city, and a map location (latitude, longitude) to be found by
 * distance; switch one off rather than deleting it.
 */
export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api<AgentsData>("/api/v1/admin/agents"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "agents"] });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = JSON.stringify({ ...d, lat: coord(d.lat), lng: coord(d.lng), id: undefined });
      return d.id ? api(`/api/v1/admin/agents/${d.id}`, { method: "PATCH", body }) : api("/api/v1/admin/agents", { method: "POST", body });
    },
    onSuccess: (_, d) => {
      setDraft(null);
      setToast({ tone: "green", message: d.id ? "Agent updated." : "Agent added." });
      refresh();
    },
    onError: (e: Error) => setFormError(e.message),
  });
  const toggle = useMutation({
    mutationFn: (a: AdminAgent) => api(`/api/v1/admin/agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) }),
    onSuccess: (_, a) => {
      setToast({ tone: "green", message: a.active ? `${a.name} is switched off.` : `${a.name} is back on.` });
      refresh();
    },
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const s = data?.summary;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.agents ?? [])
      .filter((a) => (status === "active" ? a.active : status === "off" ? !a.active : true))
      .filter((a) => !q || [a.name, a.area, a.city, a.state, a.address, a.phone].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [data, status, query]);

  const badCoords = draft ? [draft.lat, draft.lng].some((v) => v.trim() !== "" && Number.isNaN(Number(v))) || (draft.lat.trim() === "") !== (draft.lng.trim() === "") : false;

  return (
    <div className="animate-rise">
      <PageTitle eyebrow="Adding money" title="Cash agents" subtitle="Shops and POS points where people pay in cash. People see the nearest ones first.">
        <Button
          className="h-10 rounded-full px-5"
          onClick={() => {
            setFormError(null);
            setDraft({ ...EMPTY });
          }}
        >
          + Add agent
        </Button>
      </PageTitle>

      {s ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <KpiTile icon={IconMapPin} label="Agents people see" value={s.active.toLocaleString()} hint={`${s.off} switched off`} tone="brand" />
          <KpiTile icon={IconBuilding} label="Cities" value={s.cities.toLocaleString()} hint="With at least one agent" tone="info" />
          <KpiTile icon={IconTransactions} label="Pay out cash too" value={s.cash_out.toLocaleString()} hint="Cash in and out" tone="muted" />
          <KpiTile icon={IconAlert} label="No map location" value={s.no_location.toLocaleString()} hint={s.no_location ? "Not shown by distance" : "All on the map"} tone={s.no_location ? "gold" : "muted"} />
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-[22px]" />
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[22px] border border-line/80 bg-white p-4 shadow-card">
        <StatusTabs<Status>
          label="Status"
          value={status}
          onChange={setStatus}
          tabs={[
            { value: "all", label: "All", count: s?.all },
            { value: "active", label: "On", count: s?.active },
            { value: "off", label: "Switched off", count: s?.off },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="Search name, area, city or phone" label="Search agents" />
      </div>

      <div className={PANEL}>
        {isPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.agents.length === 0 ? (
          <EmptyState message="No agents yet. Add the first shop or POS point where people can pay in cash." />
        ) : shown.length === 0 ? (
          <EmptyState message="No agents match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-5 py-3 font-semibold">Agent</th>
                  <th className="px-3 py-3 font-semibold">Where</th>
                  <th className="px-3 py-3 font-semibold">Hours</th>
                  <th className="px-3 py-3 font-semibold">Cash</th>
                  <th className="px-3 py-3 font-semibold">Map</th>
                  <th className="px-3 py-3 font-semibold">Added</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className={cn("border-t border-line/70", !a.active && "opacity-60")}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                          <IconMapPin className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{a.name}</p>
                          <p className="truncate text-xs text-muted">{a.phone ?? "No phone"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-ink">{[a.area, a.city].filter(Boolean).join(", ")}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted">{a.address ?? a.state ?? ""}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink">{a.hours ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", a.cash_out ? "bg-brand-soft text-brand" : "bg-page text-muted")}>{a.cash_out ? "In and out" : "In only"}</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {a.lat !== null && a.lng !== null ? (
                        <a className="font-semibold text-brand hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`} target="_blank" rel="noreferrer">
                          {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                        </a>
                      ) : (
                        <span className="font-semibold text-warn">Missing</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{formatDate(a.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(a)}>
                          {a.active ? "Switch off" : "Switch on"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFormError(null);
                            setDraft({ ...a, lat: a.lat?.toString() ?? "", lng: a.lng?.toString() ?? "" });
                          }}
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft ? (
        <FormModal
          title={draft.id ? `Edit ${draft.name}` : "Add a cash agent"}
          description="People see agents nearest them first, so add the map location. Copy it from Google Maps: press and hold the spot, then copy the two numbers."
          error={formError}
          busy={save.isPending}
          submitLabel={draft.id ? "Save" : "Add"}
          submitDisabled={!draft.name.trim() || !draft.city.trim() || badCoords || (!draft.cash_in && !draft.cash_out)}
          onSubmit={() => {
            setFormError(null);
            save.mutate(draft);
          }}
          onClose={() => setDraft(null)}
        >
          <Field name="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mama Nkechi Stores" />
          </Field>
          <Field name="Address (optional)">
            <Input value={draft.address ?? ""} onChange={(e) => set({ address: e.target.value })} placeholder="12 Admiralty Way" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field name="Area">
              <Input value={draft.area ?? ""} onChange={(e) => set({ area: e.target.value })} placeholder="Lekki" />
            </Field>
            <Field name="City">
              <Input value={draft.city} onChange={(e) => set({ city: e.target.value })} placeholder="Lagos" />
            </Field>
            <Field name="State">
              <Input value={draft.state ?? ""} onChange={(e) => set({ state: e.target.value })} placeholder="Lagos" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field name="Latitude" hint={badCoords ? "Both numbers, like 6.4474 and 3.4723" : undefined}>
              <Input value={draft.lat} inputMode="decimal" onChange={(e) => set({ lat: e.target.value })} placeholder="6.4474" />
            </Field>
            <Field name="Longitude">
              <Input value={draft.lng} inputMode="decimal" onChange={(e) => set({ lng: e.target.value })} placeholder="3.4723" />
            </Field>
            <Field name="Hours">
              <Input value={draft.hours ?? ""} onChange={(e) => set({ hours: e.target.value })} placeholder="Open till 9 pm" />
            </Field>
            <Field name="Phone (optional)">
              <Input value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="0803 000 0000" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={draft.cash_in} onChange={(e) => set({ cash_in: e.target.checked })} />
              Takes cash in
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={draft.cash_out} onChange={(e) => set({ cash_out: e.target.checked })} />
              Pays cash out
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
              Show it to people
            </label>
          </div>
          {draft.id ? null : (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <IconCheckCircle className="h-3.5 w-3.5 text-brand" />
              Only add agents Patriai has checked.
            </p>
          )}
        </FormModal>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
