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
  loan_disbursement: "Loan disbursement",
  loan_repayment: "Loan repayment",
  main: "Main",
  shared: "Shared",
  project: "Project",
  emergency: "Emergency",
  savings: "Savings",
  goal: "Goal",
  giving: "Giving",
  joint: "Joint",
  child: "Child",
  spending: "Spending",
  // Wallet roles
  owner: "Owner",
  co_owner: "Co-owner",
  admin: "Admin",
  contributor: "Contributor",
  viewer: "Viewer",
  vendor: "Vendor",
  active: "Active",
  invited: "Invited",
  removed: "Removed",
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

// Emergency wallet vocabulary (purposes, unlock routes, documents, recipient
// access) is kept separate from `label()` so generic words like "document"
// and "manual" keep their plain meaning elsewhere.
const EMERGENCY_LABELS: Record<string, string> = {
  // Purposes
  medical: "Medical",
  funeral: "Funeral",
  travel: "Travel",
  legal: "Legal",
  other: "Other",
  // Unlock routes (mirrors EmergencyService::VIA_LABELS)
  manual: "Owner's custom PIN",
  dual_approval: "Dual approval",
  document: "Verified document",
  high_balance: "High-balance override",
  national_crisis: "National-crisis override",
  // Uploaded documents
  death_certificate: "Death certificate",
  legal_notice: "Legal notice",
  // Beneficiary roles (by order) + access
  beneficiary: "Primary beneficiary",
  fallback: "Fallback beneficiary",
  immediate: "Immediate",
  delay_7d: "After 7 days",
};

export function emergencyLabel(value: string): string {
  return EMERGENCY_LABELS[value] ?? label(value);
}

/** Document requests read as their document type, e.g. "Death certificate". */
export function emergencyMethodLabel(method: string, documentType: string | null): string {
  if (method === "document") return documentType ? emergencyLabel(documentType) : "Document";
  return emergencyLabel(method);
}

/** "What brings you to Patriai?" answers, worded as the app shows them (ONB-09). */
export const ONBOARDING_PURPOSES: Record<string, string> = {
  household: "Run our household money together",
  school_goals: "Save for school fees and goals",
  project: "Fund a building or family project",
  ajo: "Run a contribution circle (ajo)",
  children: "Manage my children's money",
  vendor: "I'm a vendor or contractor",
};

export function purposeLabel(key: string): string {
  return ONBOARDING_PURPOSES[key] ?? label(key);
}

export function languageLabel(lang: string | null | undefined): string {
  return lang === "pcm" ? "Pidgin" : "English";
}

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Every day" / "Every Monday" / "Monthly on the 25th". */
export function scheduleLabel(r: { frequency: string; day_of_week: number | null; day_of_month: number | null }): string {
  if (r.frequency === "weekly") return `Every ${DAYS[r.day_of_week ?? 0] || "week"}`;
  if (r.frequency === "monthly") return `Monthly on day ${r.day_of_month ?? "?"}`;
  return "Every day";
}

/** How an approval is decided: "Any one approver" / "Everyone" / "Most approvers". */
export function approvalModeLabel(mode: string | null | undefined, required: number): string {
  if (mode === "any") return "Any one approver";
  if (mode === "all") return "Everyone who approves";
  if (mode === "majority") return "Most approvers";
  return `${required} approval${required === 1 ? "" : "s"}`;
}

/** 1 → "1st", 25 → "25th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
