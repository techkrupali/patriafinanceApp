/** "1500.5" | 1500.5 -> "₦1,500.50" */
export function naira(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return (
    "₦" +
    safe.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Signed, for transactions: credit -> "+₦1,500.00", debit -> "-₦1,500.00" */
export function signedNaira(value: string | number, direction: "credit" | "debit"): string {
  return (direction === "credit" ? "+" : "-") + naira(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

const LABELS: Record<string, string> = {
  fund: "Fund",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  main: "Main",
  shared: "Shared",
  project: "Project",
  active: "Active",
  suspended: "Suspended",
  frozen: "Frozen",
  closed: "Closed",
  pending: "Pending",
  successful: "Successful",
  failed: "Failed",
};

export function label(value: string): string {
  return LABELS[value] ?? value;
}
