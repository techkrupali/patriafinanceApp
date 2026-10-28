"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, naira } from "@/lib/format";
import type { AdminOrganisation, OrganisationsData } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Toast, type ToastState } from "@/components/toast";
import { FormModal } from "@/components/admin/form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

const KINDS = ["church", "mosque", "charity", "school", "other"] as const;
const CAUSES = ["children", "food", "education", "health", "elderly", "faith"] as const;

type Draft = Omit<AdminOrganisation, "id" | "saved_by" | "owed" | "created_at"> & { id?: number };

const title = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

const EMPTY: Draft = {
  name: "",
  kind: "church",
  cause: null,
  area: "",
  state: "Lagos",
  about: "",
  account_name: "",
  account_number: "",
  bank_code: "",
  bank_name: "",
  verified: false,
  active: true,
};

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{name}</span>
      {children}
    </label>
  );
}

/**
 * Organisations people can give to (GIV-02) and pick for half of an early-break
 * fee (BRK-02). Patriai checks each one and its bank account before marking it
 * verified. Charities' share of early-break fees is owed until it's paid out.
 */
export default function OrganisationsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "organisations"],
    queryFn: () => api<OrganisationsData>("/api/v1/admin/organisations"),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "organisations"] });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? api(`/api/v1/admin/organisations/${d.id}`, { method: "PATCH", body: JSON.stringify(d) })
        : api("/api/v1/admin/organisations", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: (_, d) => {
      setDraft(null);
      setToast({ tone: "green", message: d.id ? "Organisation updated." : "Organisation added." });
      refresh();
    },
    onError: (e: Error) => setFormError(e.message),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<AdminOrganisation> }) => api(`/api/v1/admin/organisations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => refresh(),
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });
  const paid = useMutation({
    mutationFn: (id: number) => api<{ message?: string }>(`/api/v1/admin/organisations/${id}/donations/paid`, { method: "POST" }),
    onSuccess: () => {
      setToast({ tone: "green", message: "Marked paid." });
      refresh();
    },
    onError: (e: Error) => setToast({ tone: "red", message: e.message }),
  });

  const set = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <>
      <PageHeader
        title="Organisations"
        subtitle="Churches, mosques, charities and schools people can give to. Check each one and its account before marking it verified."
      >
        <Button
          onClick={() => {
            setFormError(null);
            setDraft({ ...EMPTY });
          }}
        >
          Add organisation
        </Button>
      </PageHeader>

      <Card>
        {isPending ? (
          <TableSkeleton rows={6} cols={6} />
        ) : isError ? (
          <ErrorState message={error.message} />
        ) : data.organisations.length === 0 ? (
          <EmptyState message="No organisations yet. Add the first one people can give to." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Kind</TH>
                <TH>Account</TH>
                <TH>Owed from fees</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {data.organisations.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted">
                      {[[o.area, o.state].filter(Boolean).join(", "), o.saved_by ? `saved by ${o.saved_by}` : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TD>
                  <TD>
                    <p>{title(o.kind)}</p>
                    {o.cause ? <p className="text-xs text-muted">{title(o.cause)}</p> : null}
                  </TD>
                  <TD>
                    <p className="font-mono text-xs">{o.account_number}</p>
                    <p className="text-xs text-muted">
                      {o.bank_name} · {o.account_name}
                    </p>
                  </TD>
                  <TD>
                    {parseFloat(o.owed) > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{naira(o.owed)}</span>
                        <Button size="sm" variant="outline" disabled={paid.isPending} onClick={() => paid.mutate(o.id)}>
                          Mark paid
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={o.verified ? "green" : "amber"}>{o.verified ? "Verified" : "Not verified"}</Badge>
                      {!o.active ? <Badge tone="gray">Hidden</Badge> : null}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: o.id, body: { verified: !o.verified } })}>
                        {o.verified ? "Unverify" : "Verify"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFormError(null);
                          setDraft({ ...o });
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {data && data.donations.length > 0 ? (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Early-break fees to charities</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <tr>
                    <TH>Receipt</TH>
                    <TH>Charity</TH>
                    <TH>From</TH>
                    <TH>Amount</TH>
                    <TH>Status</TH>
                    <TH>Date</TH>
                  </tr>
                </THead>
                <TBody>
                  {data.donations.map((d) => (
                    <TR key={d.id}>
                      <TD className="font-mono text-xs">{d.receipt_no}</TD>
                      <TD>{d.organisation ?? "—"}</TD>
                      <TD>{d.from ?? "—"}</TD>
                      <TD className="font-medium">{naira(d.amount)}</TD>
                      <TD>
                        <Badge tone={d.status === "paid" ? "green" : "amber"}>{d.status === "paid" ? "Paid" : "Owed"}</Badge>
                      </TD>
                      <TD className="text-muted">{formatDate(d.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {draft ? (
        <FormModal
          title={draft.id ? `Edit ${draft.name}` : "Add an organisation"}
          description="People see it when they search for who to give to. Mark it verified only after you have checked it and its account."
          error={formError}
          busy={save.isPending}
          submitLabel={draft.id ? "Save" : "Add"}
          submitDisabled={!draft.name.trim() || draft.account_number.length !== 10 || !draft.bank_code.trim() || !draft.bank_name.trim() || !draft.account_name.trim()}
          onSubmit={() => {
            setFormError(null);
            save.mutate({ ...draft, cause: draft.kind === "charity" ? draft.cause : null });
          }}
          onClose={() => setDraft(null)}
        >
          <Field name="Name">
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Grace Parish Church" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field name="Kind">
              <Select className="w-full" value={draft.kind} onChange={(e) => set({ kind: e.target.value as Draft["kind"] })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {title(k)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="Cause (charities)">
              <Select className="w-full" value={draft.cause ?? ""} disabled={draft.kind !== "charity"} onChange={(e) => set({ cause: e.target.value || null })}>
                <option value="">—</option>
                {CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {title(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="Area">
              <Input value={draft.area ?? ""} onChange={(e) => set({ area: e.target.value })} placeholder="Ikeja" />
            </Field>
            <Field name="State">
              <Input value={draft.state ?? ""} onChange={(e) => set({ state: e.target.value })} placeholder="Lagos" />
            </Field>
          </div>
          <Field name="About (optional)">
            <Input value={draft.about ?? ""} onChange={(e) => set({ about: e.target.value })} placeholder="A home for 38 children in Surulere" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field name="Account number">
              <Input value={draft.account_number} inputMode="numeric" maxLength={10} onChange={(e) => set({ account_number: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
            </Field>
            <Field name="Bank code">
              <Input value={draft.bank_code} onChange={(e) => set({ bank_code: e.target.value })} placeholder="058" />
            </Field>
            <Field name="Bank name">
              <Input value={draft.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder="GTBank" />
            </Field>
            <Field name="Account name">
              <Input value={draft.account_name} onChange={(e) => set({ account_name: e.target.value })} placeholder="GRACE PARISH CHURCH" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.verified} onChange={(e) => set({ verified: e.target.checked })} />
            Checked — show it as verified
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
            Show it to people (untick to hide it)
          </label>
        </FormModal>
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
