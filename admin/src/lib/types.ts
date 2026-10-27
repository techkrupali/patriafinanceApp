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
  username: string | null;
  /** False for phone sign-ups (phone + code + PIN); true for older email + password accounts. */
  has_password: boolean;
  /** 6 for phone sign-ups, 4 for older accounts until they change it. */
  pin_length: 4 | 6;
  language: "en" | "pcm";
  date_of_birth: string | null;
  /** Answers to "What brings you to Patriai?" at sign-up. */
  onboarding_purposes: string[];
  created_at: string | null;
}

export interface AdminListUser extends ApiUser {
  total_balance: string; // naira string e.g. "1500.00"
}

export type WalletType =
  | "main"
  | "shared"
  | "project"
  | "savings"
  | "goal"
  | "emergency"
  | "giving"
  | "joint"
  | "child"
  | "spending";

export interface ApiWallet {
  id: number;
  type: WalletType;
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
  target_date?: string | null;
  /** Chosen at creation: just the owner, or family adds money and sees everything. */
  mode?: "private" | "shared" | null;
  /** Who decides a spend: first yes, everyone, or more than half; null = fixed count. */
  approval_mode?: "any" | "all" | "majority" | null;
  lock_until_goal?: boolean;
  /** Locked right now: every spend needs everyone's yes until the target is reached. */
  goal_locked?: boolean;
  approval_expiry_hours?: number;
  /** Day of the month savers are reminded (1–28). */
  reminder_day?: number | null;
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
  signups: {
    /** Joined with phone + code + PIN. */
    phone: number;
    /** Older email + password accounts. */
    password: number;
    languages: { en: number; pcm: number };
    /** "What brings you to Patriai?" answer counts. */
    purposes: Record<string, number>;
    answered_purposes: number;
  };
  rules: { active: number; paused: number };
  invitations: { pending: number };
  system: {
    /** Termii key set: sign-up codes go out by SMS/WhatsApp. */
    sms_configured: boolean;
    /** Anthropic key set: Steward uses the AI assistant. */
    ai_configured: boolean;
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

/** A rule the user set to move money on its own (Rules tab). */
export interface UserAutomation {
  id: number;
  name: string;
  from_wallet: string | null;
  to_wallet: string | null;
  amount: string; // naira string
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_on: string | null;
}

/** A pending wallet invite the user sent or received. */
export interface UserInvitation {
  id: number;
  direction: "sent" | "received";
  wallet: string | null;
  invitee: string;
  inviter: string | null;
  role: string;
  created_at: string | null;
  expires_at: string | null;
}

export interface UserDetailData {
  user: ApiUser;
  automations: UserAutomation[];
  invitations: UserInvitation[];
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
  status: string;
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
  emergency: WalletEmergency | null; // null unless an emergency wallet
  /** Invited but not answered yet. */
  invitations: {
    id: number;
    invitee: string;
    role: string;
    inviter: string | null;
    created_at: string | null;
    expires_at: string | null;
  }[];
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

// ---- Support requests (backend-team escalations from the AI assistant) ----

export type SupportRequestStatus = "pending" | "in_review" | "resolved" | "closed";
export type SupportRequestPriority = "low" | "medium" | "high";
export type SupportRequestCategory =
  | "transfer"
  | "withdrawal"
  | "wallet"
  | "account"
  | "transaction"
  | "other";

export interface SupportRequestListItem {
  id: number;
  user: { id: number; name: string; email: string } | null;
  subject: string;
  category: SupportRequestCategory;
  description_preview: string;
  reference: string | null;
  priority: SupportRequestPriority;
  status: SupportRequestStatus;
  created_at: string;
  updated_at: string;
}

export interface SupportRequestDetail extends SupportRequestListItem {
  description: string;
}

export interface SupportRequestsData {
  support_requests: SupportRequestListItem[];
  pagination: Pagination;
}

export interface SupportRequestDetailData {
  support_request: SupportRequestDetail;
}

// ---- Emergency wallets (locked until an unlock rule fires) ----

export type EmergencyPurpose = "medical" | "funeral" | "travel" | "legal" | "other";
export type EmergencyUnlockVia =
  | "manual"
  | "dual_approval"
  | "document"
  | "high_balance"
  | "national_crisis";
export type EmergencyRequestMethod = "dual_approval" | "document";
export type EmergencyRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type EmergencyDocumentType = "death_certificate" | "legal_notice";

/** Compact user shape used across emergency payloads (EmergencyService::person). */
export interface EmergencyPerson {
  id: number;
  name: string;
  username: string | null;
  avatar_url: string | null;
}

/** Lock state on GET /admin/wallets/{id} for emergency wallets. */
export interface WalletEmergency {
  purpose: EmergencyPurpose;
  locked: boolean;
  unlocked_at: string | null;
  unlocked_via: EmergencyUnlockVia | null;
  override_national_crisis: boolean; // owner opted in to the admin override
}

export interface AdminEmergencyRequest {
  id: number;
  wallet_id: number;
  method: EmergencyRequestMethod;
  document_type: EmergencyDocumentType | null;
  has_document: boolean;
  note: string | null; // requester's note
  status: EmergencyRequestStatus;
  requested_by: EmergencyPerson | null;
  approved_by: EmergencyPerson | null; // dual-approval approver
  review_note: string | null;
  reviewed_by: string | null; // admin full name
  created_at: string | null;
  decided_at: string | null;
  wallet: {
    id: number;
    name: string;
    balance: string; // naira string
    owner: { id: number; name: string; email: string } | null;
    locked: boolean;
  } | null;
  // User-side flags from the shared serializer — not used by the admin UI.
  can_approve: boolean;
  can_reject: boolean;
  can_cancel: boolean;
}

export interface EmergencyRequestsData {
  requests: AdminEmergencyRequest[];
  pagination: Pagination;
}

export interface EmergencyRules {
  dual_approval: boolean;
  approver: EmergencyPerson | null;
  unlock_on_document: boolean;
  manual_unlock: boolean;
  unlock_reason: string | null;
  override_national_crisis: boolean;
  override_high_balance: boolean;
  override_balance_threshold: string; // naira string
}

export interface EmergencyBeneficiary {
  id: number;
  user: EmergencyPerson | null;
  position: number;
  relationship: string | null;
  role: "beneficiary" | "fallback";
  withdrawal_limit: string | null; // naira string, null = no cap
  access_type: "immediate" | "delay_7d";
  withdrawn: string; // naira string
}

export interface EmergencyRequestDetailData {
  request: AdminEmergencyRequest;
  rules: EmergencyRules | null;
  beneficiaries: EmergencyBeneficiary[];
}

/** POST /admin/wallets/{id}/emergency/crisis-unlock (EmergencyService::summary). */
export interface CrisisUnlockResult {
  emergency: Pick<WalletEmergency, "purpose" | "locked" | "unlocked_at" | "unlocked_via">;
}
