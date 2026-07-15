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
  currency: string;
  balance: string; // naira string
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
  type: "fund" | "withdrawal" | "transfer_in" | "transfer_out";
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
  wallet: { id: number; name: string };
  initiator: { name: string; email: string };
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

export interface UserDetailData {
  user: ApiUser;
  wallets: ApiWallet[];
  devices: {
    device_name: string | null;
    platform: string | null;
    last_active_at: string | null;
  }[];
  recent_transactions: ApiTransaction[];
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

export interface WalletGovernance {
  approval_enabled: boolean;
  approval_threshold: string | null; // naira string
  required_approvals: number;
  description: string | null;
  target_amount: string | null; // naira string
}

export interface WalletMember {
  name: string;
  email: string;
  role: string;
  can_approve: boolean;
}

export interface WalletDetailData {
  wallet: ApiWallet & { governance?: WalletGovernance };
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
  user: { name: string; email: string };
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
  user: { id: number; name: string; email: string; kyc_tier: number };
  repayments: LoanRepayment[];
}

export interface RunDueResult {
  loans_processed: number;
  loans_penalized: number;
  penalty_charged: string; // naira string
}
