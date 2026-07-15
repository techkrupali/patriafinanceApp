// Shapes mirror patriai-api serializers (ApiController.php / AdminController.php).

export interface ApiUser {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  kyc_tier: number;
  role: "admin" | "user";
  status: "active" | "suspended";
  email_verified: boolean;
  phone_verified: boolean;
  has_pin: boolean;
  created_at: string | null;
}

export interface AdminListUser extends ApiUser {
  total_balance: string; // naira string e.g. "1500.00"
}

export interface ApiWallet {
  id: number;
  type: "main" | "shared" | "project";
  name: string;
  description: string | null;
  currency: string;
  balance: string; // naira string
  target_amount: string | null; // naira string
  approval_enabled: boolean;
  approval_threshold: string | null; // naira string
  required_approvals: number;
  virtual_account: string | null;
  virtual_account_bank: string | null;
  status: "active" | "frozen" | "closed";
  created_at: string | null;
  owner?: {
    id: number;
    name: string;
    email: string;
  };
}

export interface ApiTransaction {
  id: number;
  reference: string;
  wallet_id: number;
  type:
    | "fund"
    | "withdrawal"
    | "transfer_in"
    | "transfer_out"
    | "reversal"
    | "admin_credit"
    | "admin_debit"
    | "loan_disbursement"
    | "loan_repayment";
  direction: "credit" | "debit";
  amount: string; // naira string
  fee: string;
  balance_after: string | null;
  status: "pending" | "successful" | "failed";
  description: string | null;
  counterparty: Record<string, unknown> | string | null;
  created_at: string | null;
  wallet?: {
    id: number;
    name: string;
    type: string;
    owner: string;
  };
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface LoginData {
  user: ApiUser;
  token: string;
}

export interface StatsData {
  users: {
    total: number;
    active: number;
    new_7d: number;
  };
  wallets: {
    total: number;
    by_type: Record<string, number>;
    total_balance: string;
  };
  transactions: {
    total: number;
    volume_in_30d: string;
    volume_out_30d: string;
    pending: number;
    failed: number;
  };
  approvals: {
    pending: number;
  };
  loans: {
    active: number;
    pending: number;
    outstanding: string; // naira string
  };
  projects: {
    active: number;
    escrow: string; // naira string — total reserved across active projects
  };
  kyc: {
    pending: number;
  };
}

export type ApprovalAction =
  | "withdrawal"
  | "transfer_wallet"
  | "transfer_user"
  | "transfer_bank";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "failed"
  | "cancelled";

export interface ApiApproval {
  id: number;
  wallet: { id: number; name: string } | null;
  initiator: { name: string; email: string } | null;
  action: ApprovalAction;
  amount: string; // naira string
  fee: string; // naira string
  status: ApprovalStatus;
  approvals_count: number;
  required_approvals: number;
  created_at: string | null;
}

export interface UsersData {
  users: AdminListUser[];
  pagination: Pagination;
}

export interface UserDevice {
  device_name: string | null;
  platform: string | null;
  last_active_at: string | null;
}

/** Aggregate money movement for a user, from the enriched detail endpoint. */
export interface UserSummary {
  total_in: string; // naira string
  total_out: string; // naira string
  wallet_count: number;
}

/** A project the user is party to (serializeProject shape + their role). */
export interface UserProject extends ProjectDetail {
  role: "owner" | "vendor" | string;
}

/** KYC submission summary (serializeKycSubmission without payload). */
export type KycSubmissionSummary = Omit<KycSubmission, "payload">;

export interface UserDetailData {
  user: ApiUser;
  wallets: ApiWallet[];
  devices: UserDevice[];
  recent_transactions: ApiTransaction[];
  loans: LoanDetail[];
  projects: UserProject[];
  approvals: ApprovalRequestDetail[];
  kyc_submissions: KycSubmissionSummary[];
  summary: UserSummary;
}

export interface WalletsData {
  wallets: ApiWallet[];
  pagination: Pagination;
}

export interface TransactionsData {
  transactions: ApiTransaction[];
  pagination: Pagination;
}

export interface ApprovalsData {
  approvals: ApiApproval[];
  pagination: Pagination;
}

export interface WalletMember {
  name: string;
  email: string;
  role: string;
  can_approve: boolean;
}

export interface WalletDetailData {
  wallet: ApiWallet;
  members: WalletMember[];
  approval: {
    enabled: boolean;
    threshold: string | null; // naira string
    required_approvals: number;
  };
  recent_transactions: ApiTransaction[];
}

export type LoanStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disbursed"
  | "active"
  | "repaid"
  | "defaulted"
  | "cancelled";

export type LoanCategory =
  | "rent"
  | "mortgage"
  | "car"
  | "school_fees"
  | "family_emergency"
  | "business"
  | "feeding"
  | "child_allowance"
  | "short_term";

export type RepaymentStatus = "pending" | "partial" | "paid" | "overdue";

export interface LoanListItem {
  id: number;
  reference: string;
  user: { name: string; email: string } | null;
  category: LoanCategory;
  principal: string; // naira string
  total_repayable: string; // naira string
  outstanding: string; // naira string
  status: LoanStatus;
  created_at: string | null;
}

export interface LoansData {
  loans: LoanListItem[];
  pagination: Pagination;
}

export interface LoanRepayment {
  id: number;
  sequence: number;
  due_date: string | null;
  amount_due: string; // naira string
  amount_paid: string; // naira string
  status: RepaymentStatus;
  paid_at: string | null;
}

export interface LoanDetail {
  id: number;
  reference: string;
  category: LoanCategory;
  purpose: string | null;
  principal: string; // naira string
  interest_bps: number;
  fee: string; // naira string
  total_repayable: string; // naira string
  outstanding: string; // naira string
  penalty_accrued: string; // naira string
  tenor_days: number;
  repayment_frequency: string;
  status: LoanStatus;
  disbursed_wallet_id: number | null;
  disbursed_at: string | null;
  due_at: string | null;
  progress_pct: number;
  created_at: string | null;
}

export interface LoanDetailData {
  loan: LoanDetail;
  user: { id: number; name: string; email: string; kyc_tier: number } | null;
  repayments: LoanRepayment[];
}

export interface RunDueResult {
  loans_processed: number;
  loans_penalized: number;
  penalty_charged: string; // naira string
}

export type ProjectStatus = "active" | "completed" | "cancelled";

export type MilestoneStatus =
  | "funded"
  | "submitted"
  | "approved"
  | "released"
  | "rejected";

export interface ProjectListItem {
  id: number;
  title: string;
  owner: { name: string } | null;
  vendor: { name: string } | null;
  budget: string; // naira string
  wallet_balance: string; // naira string — escrow balance
  reserved: string; // naira string
  released: string; // naira string
  status: ProjectStatus;
  milestones_count: number;
  created_at: string | null;
}

export interface ProjectsData {
  projects: ProjectListItem[];
  pagination: Pagination;
}

export interface ProjectMilestone {
  id: number;
  sequence: number;
  title: string;
  description: string | null;
  amount: string; // naira string
  status: MilestoneStatus;
  proof: string | null;
  submitted_at: string | null;
  released_at: string | null;
  released_transaction_reference: string | null;
  created_at: string | null;
}

export interface ProjectDetail {
  id: number;
  title: string;
  description: string | null;
  wallet_id: number | null;
  wallet_balance: string; // naira string — escrow balance
  budget: string; // naira string
  reserved: string; // naira string
  available: string; // naira string
  released: string; // naira string
  status: ProjectStatus;
  vendor: { id: number; name: string } | null;
  owner: { id: number; name: string } | null;
  milestones_total: number;
  milestones_released: number;
  created_at: string | null;
}

export interface ProjectDetailData {
  project: ProjectDetail;
  owner: { id: number; name: string; email: string } | null;
  vendor: { id: number; name: string; email: string } | null;
  wallet: ApiWallet;
  milestones: ProjectMilestone[];
}

export type KycStatus = "pending" | "approved" | "rejected";

export interface KycListItem {
  id: number;
  user: { name: string; email: string } | null;
  target_tier: number;
  type: string;
  status: KycStatus;
  created_at: string | null;
}

export interface KycData {
  submissions: KycListItem[];
  pagination: Pagination;
}

/** Tier-specific fields captured on the mobile KYC form. */
export interface KycPayload {
  // tier 1 — identity
  bvn?: string;
  nin?: string;
  id_type?: string;
  id_number?: string;
  // tier 2 — address
  address?: string;
  city?: string;
  state?: string;
  // tier 3 — source of funds
  source_of_funds?: string;
  occupation?: string;
  business_name?: string;
  monthly_income?: string | number;
}

export interface KycSubmission {
  id: number;
  target_tier: number;
  type: string;
  status: KycStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  payload: KycPayload;
}

export interface KycDetailData {
  submission: KycSubmission;
  user: { id: number; name: string; email: string; kyc_tier: number } | null;
}

// ── Admin management: transaction detail ──────────────────────────────

export interface TransactionDetailData {
  transaction: ApiTransaction;
  wallet: {
    id: number;
    name: string;
    type: string;
    status: string;
    owner: { id: number; name: string; email: string } | null;
  } | null;
  initiator: { id: number; name: string; email: string } | null;
  related: ApiTransaction[];
  reversible: boolean;
}

// ── Admin management: approval detail (serializeApprovalRequest shape) ─

export interface ApprovalRequestDetail {
  id: number;
  wallet_id: number;
  wallet: { id: number; name: string; type: string } | null;
  initiator: { id: number; name: string } | null;
  action: ApprovalAction;
  amount: string; // naira string
  fee: string; // naira string
  description: string | null;
  status: ApprovalStatus;
  approvals_count: number;
  required_approvals: number;
  executed_transaction_reference: string | null;
  fail_reason: string | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface ApprovalResponseItem {
  approver: { name: string | null };
  decision: string; // "approve" | "reject"
  note: string | null;
  created_at: string | null;
}

export interface ApprovalDetailData {
  approval: ApprovalRequestDetail;
  responses: ApprovalResponseItem[];
}

// ── Admin management: mutation response payloads ──────────────────────

export interface AdjustWalletResult {
  transaction: ApiTransaction;
  wallet: ApiWallet;
}

export interface ReverseTransactionResult {
  original: ApiTransaction;
  reversal: ApiTransaction;
}

export interface BroadcastResult {
  sent: number;
}
