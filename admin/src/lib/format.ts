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
  reversal: "Reversal",
  admin_credit: "Admin credit",
  admin_debit: "Admin debit",
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
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  executed: "Executed",
  cancelled: "Cancelled",
  // Loan + repayment statuses
  disbursed: "Disbursed",
  repaid: "Repaid",
  defaulted: "Defaulted",
  overdue: "Overdue",
  partial: "Partial",
  paid: "Paid",
  // Project + milestone statuses
  completed: "Completed",
  funded: "Funded",
  submitted: "Submitted",
  released: "Released",
  // KYC applicant types
  individual: "Individual",
  business: "Business",
};

export function label(value: string): string {
  return LABELS[value] ?? value;
}

// Loan category labels are kept separate from `label()` so their human
// wording (e.g. "School fees", "Family emergency") stays self-contained.
const LOAN_CATEGORIES: Record<string, string> = {
  rent: "Rent",
  mortgage: "Mortgage",
  car: "Car",
  school_fees: "School fees",
  family_emergency: "Family emergency",
  business: "Business",
  feeding: "Feeding",
  child_allowance: "Child allowance",
  short_term: "Short term",
};

export function loanCategoryLabel(category: string): string {
  return LOAN_CATEGORIES[category] ?? label(category);
}

// KYC target tiers map to a human verification name.
const KYC_TIER_NAMES: Record<number, string> = {
  1: "Identity",
  2: "Address",
  3: "Source of Funds",
};

/** e.g. 2 -> "Address". */
export function kycTierName(tier: number): string {
  return KYC_TIER_NAMES[tier] ?? `Tier ${tier}`;
}

/** e.g. 2 -> "Tier 2 · Address". */
export function kycTierLabel(tier: number): string {
  return `Tier ${tier} · ${kycTierName(tier)}`;
}

/** Basis points -> percentage string, e.g. 1500 -> "15%". */
export function bpsToPercent(bps: number): string {
  const pct = (bps ?? 0) / 100;
  return `${Number(pct.toFixed(2))}%`;
}

// Approval action labels are kept separate from `label()` so the shared
// transaction-type label for "withdrawal" ("Withdrawal") stays intact.
const APPROVAL_ACTIONS: Record<string, string> = {
  withdrawal: "Bank withdrawal",
  transfer_wallet: "Wallet transfer",
  transfer_user: "User transfer",
  transfer_bank: "Bank transfer",
};

export function approvalActionLabel(action: string): string {
  return APPROVAL_ACTIONS[action] ?? label(action);
}
