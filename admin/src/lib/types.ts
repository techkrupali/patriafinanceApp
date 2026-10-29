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
  /** SAV-05: locked until a date or the target; `locked` while it holds. */
  lock?: { mode: "date" | "target"; until: string | null; early_break: boolean; approval: boolean; locked: boolean } | null;
  /** GLW-01…05. */
  goal?: {
    kind: string;
    for: string | null;
    lines: { name: string; amount: string }[];
    link: string | null;
    reminders: { before_save: boolean; nudge: boolean } | null;
    payout: { to: string | null; run_on: string; paid_at: string | null } | null;
  } | null;
  /** JNT-01…05. */
  joint?: {
    state: "waiting" | "open" | "leaving" | "closed";
    partner: { id: number; name: string } | null;
    contribution: { mode: "equal" | "income" | "fixed"; day: number; mine: string; partner: string };
    short: "retry" | "skip";
    limits: { per_payment: string; per_day: string };
    expiry_hours: number;
    always: { new_account: boolean; personal: boolean; rules: boolean };
    notify: { weekly: boolean; statement: boolean; big_payment: boolean; big_amount: string };
    leave: { split: "contributed" | "equal" | "decide"; notice_days: number };
    leaving: { by: number; at: string; ends_on: string } | null;
    closing: { by: number; at: string } | null;
    proposal: { by: number; summary: string } | null;
  } | null;
  /** CHW-01…07. */
  child?: {
    first_name: string;
    last_name: string | null;
    age_band: string;
    allowance: { amount: string; frequency: "weekly" | "biweekly" | "monthly"; starts_on: string; pause_holidays: boolean; notify: boolean };
    controls: { daily_limit: string; shops: boolean; friends: boolean; online: boolean; cash: boolean };
    requests: { auto_limit: string; auto_per_week: number; reason_required: boolean; approvers: "any" | "all" };
    goal: { wallet_id: number; name: string; target: string; saved: string; save_percent: number; match_percent: number } | null;
    phone: { mode: "own" | "managed"; linked: boolean; code: string | null; expires_at: string | null };
    coparent: { approve: boolean; change: boolean; see: boolean } | null;
    gifts: boolean;
  } | null;
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
  /** Savings and goal wallets: how everyone saves (SAV-02/03/06). */
  savings_plan?: {
    label: string;
    schedule: boolean;
    salary_percent: number | null;
    roundup_to: string | null;
    missed_policy: "retry" | "partial" | "skip";
    notify_others_on_miss: boolean;
    auto_save: boolean;
    allow_contributor_edit: boolean;
  } | null;
  /** Invited but not answered yet. */
  invitations: {
    id: number;
    invitee: string;
    role: string;
    inviter: string | null;
    created_at: string | null;
    expires_at: string | null;
  }[];
  /** Spending wallets (SPD/WAL-09): the budget this period. */
  budget?: WalletBudget | null;
  /** Giving wallets (GIV/WAL-18). */
  giving?: WalletGiving | null;
  /** Locked savings that allow an early break (SAV-05): the fee and the charity. */
  early_break?: { fee_percent: number; charity: string | null } | null;
}

export interface WalletBudget {
  amount: string; // naira string
  period: "weekly" | "monthly" | "one_off";
  start_day: number;
  period_start: string;
  next_period_start: string | null;
  leftover: { mode: "keep" | "main" | "wallet"; wallet_id: number | null; wallet_name: string | null };
  funding: "topup" | "split" | "manual";
  alerts: { half: boolean; eighty: boolean; category_out: boolean; weekly: boolean };
  over_limit: "approve" | "stop";
  spent: string;
  categories: { id: number; name: string; limit: string; spent: string }[];
  spenders: { user_id: number; name: string | null; role: string; can_spend: boolean; categories: string[] | null; daily_limit: string | null }[];
  viewers: string[];
}

export interface WalletGiving {
  kind: string | null;
  settings: { ask_first?: boolean; thanksgiving_reminder?: boolean; receipts?: boolean; yearly_statement?: boolean; anonymous?: boolean };
  set_aside: string;
  given_this_year: string;
  set_aside_rules: { id: number; name: string; trigger: string; percent: number | null; amount: string; from: string | null; enabled: boolean }[];
  coming_up: { schedule_id: number; date: string; label: string; amount: string; to: string; when: string }[];
  schedules: { id: number; label: string; amount: string; to: string; when: string; enabled: boolean; ask_first: boolean }[];
  awaiting: { id: number; label: string | null; amount: string; to: string | null; date: string }[];
  recent: { id: number; label: string | null; amount: string; to: string | null; status: string; receipt_no: string | null; note: string | null; date: string }[];
  pledge: { name: string; total: string; paid: string; due_date: string | null; to: string | null } | null;
  recipients: { name: string }[];
}

/** GET /admin/organisations */
export interface AdminOrganisation {
  id: number;
  name: string;
  kind: "church" | "mosque" | "charity" | "school" | "other";
  cause: string | null;
  area: string | null;
  state: string | null;
  about: string | null;
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  verified: boolean;
  active: boolean;
  saved_by: number | null;
  owed: string; // naira string, from early-break fees
  created_at: string | null;
}

export interface CharityDonationRow {
  id: number;
  organisation: string | null;
  from: string | null;
  amount: string;
  receipt_no: string;
  status: "pending" | "paid";
  created_at: string | null;
  paid_at: string | null;
}

export interface OrganisationsData {
  organisations: AdminOrganisation[];
  donations: CharityDonationRow[];
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
  | "planned"
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
  /** PRW-03 when the work starts (due_date is when it ends). */
  starts_on?: string | null;
  /** PRW-06 held back from the payment until after handover. */
  retention?: string;
  retention_due_at?: string | null;
  retention_released_at?: string | null;
  /** An open dispute holding this milestone's payment. */
  dispute?: { id: number; number: string | null; status: string } | null;
  submitted_by?: string | null;
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
  /** The builder's business (name), its owner (person) and whether Patriai verified it. */
  vendor: { id: number; name: string; person?: string; profile_id?: number | null; verified?: boolean } | null;
  /** INV-V1…V5: invited, changes_proposed, accepted, declined. */
  vendor_status?: string | null;
  vendor_declined?: { name: string; reason: string; message?: string } | null;
  owner: { id: number; name: string } | null;
  milestones_total: number;
  milestones_released: number;
  /** PRW-01…06: what, where, when, buffer and release rules. */
  setup?: {
    kind: "building" | "renovation" | "event" | "community" | null;
    location: string | null;
    starts_on: string | null;
    finishes_on: string | null;
    buffer_percent: number;
    release: { photos: boolean; video: boolean; receipts: boolean; approvers: "all" | "owner"; retention_percent: number; retention_months: number } | null;
    vendor_invite: string | null;
  } | null;
  held_back?: string;
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
/**
 * dual_approval: keyholders agree · document: death certificate · fast_release: a keyholder released money at once, with proof
 * · rule_change: the owner's new release rules, waiting for the keyholders
 */
export type EmergencyRequestMethod = "dual_approval" | "document" | "fast_release" | "rule_change";
export type EmergencyRequestStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "released" | "flagged";
export type EmergencyDocumentType = "death_certificate" | "legal_notice" | "proof";

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
  purposes?: EmergencyPurpose[];
  /** Full names, owner first. */
  keyholders?: string[];
  required_keyholders?: number;
  request_expiry_hours?: number | null;
  fast_release_limit?: string | null; // naira string
  fast_release_every_days?: number;
  manual_unlock?: boolean;
  unlock_on_document?: boolean;
  /** Full names, in order: 1st, then fallbacks. */
  beneficiaries?: string[];
  /** Released money goes to the hospital's bank account, not a person (EMG-03). */
  pay_directly?: boolean;
  /** People without the app who can ask for a release from an SMS link, e.g. "Dr Chika Nwosu (Family doctor)". */
  trusted_contacts?: string[];
}

/** EMG-05 trusted contact on a request detail (EmergencyService::detail). */
export interface EmergencyTrustedContact {
  id: number;
  name: string;
  relation: string | null;
  phone: string;
  masked_phone: string;
  link_sent: boolean;
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
  /** Asked by a trusted contact from their SMS link (no account) — requested_by is then null. */
  trusted_contact?: { name: string; relation: string | null } | null;
  /** Fast release paid straight to the bill. */
  payee?: { bank_name?: string; account_number: string; account_name: string } | null;
  /** Rule change: what would change, in words. */
  changes?: string[] | null;
  review_note: string | null;
  reviewed_by: string | null; // admin full name
  amount?: string | null; // fast release, naira string
  approvals?: number; // keyholders' yeses so far
  required_approvals?: number | null;
  expires_at?: string | null;
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
  keyholders?: EmergencyPerson[]; // besides the owner
  required_keyholders?: number;
  request_expiry_hours?: number | null;
  fast_release?: { limit: string; every_days: number; last_at: string | null; next_at: string | null } | null;
  pay_directly?: boolean;
  trusted_can_request?: boolean;
  trusted_can_upload?: boolean;
  trusted_can_see_balance?: boolean;
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
  trusted_contacts?: EmergencyTrustedContact[];
}

/** POST /admin/wallets/{id}/emergency/crisis-unlock (EmergencyService::summary). */
export interface CrisisUnlockResult {
  emergency: Pick<WalletEmergency, "purpose" | "locked" | "unlocked_at" | "unlocked_via">;
}

// ---------------------------------------------------------------- Vendors (VON-09 review)

export type VendorStatus = "draft" | "submitted" | "needs_changes" | "verified";
export type CheckStatus = "todo" | "pending" | "approved" | "redo" | "waiting";
export type VendorCheck = "owner" | "id_document" | "cac" | "directors" | "address" | "bank";

export interface VendorRow {
  id: number;
  business_name: string;
  category: string;
  location: string | null;
  status: VendorStatus;
  verified: boolean;
  owner_name: string | null;
  rating: number | null;
  reviews: number;
  checks: Record<VendorCheck, { status: CheckStatus; note: string | null }> | null;
  submitted_at: string | null;
  verified_at: string | null;
  created_at: string | null;
}

export interface VendorsData {
  vendors: VendorRow[];
  counts: Partial<Record<VendorStatus, number>>;
  pagination: Pagination;
}

export interface VendorVerification {
  status: VendorStatus;
  items: { item: VendorCheck; label: string; sub: string; status: CheckStatus; note: string | null }[];
  needs_you: number;
  ready: boolean;
}

export interface VendorDetailData {
  vendor: VendorRow & {
    rc_number: string | null;
    since_year: number | null;
    services: string[];
    bio: string | null;
    areas: string | null;
    team_size: string | null;
    address: string | null;
    tin: string | null;
    id_type: string | null;
    owner_bvn: string | null;
    owner_nin: string | null;
    bank: { account_name: string | null; account_number: string; bank_name: string | null } | null;
    logo_url: string | null;
    past_work: { url: string; caption: string | null }[];
    owner: { id: number; name: string; phone: string | null; email: string | null; kyc_tier: number } | null;
  };
  verification: VendorVerification;
  documents: { id: number; item: string; name: string; url: string; is_pdf: boolean; created_at: string | null }[];
  directors: { id: number; name: string; phone: string | null; share_percent: number | null; status: string; is_owner: boolean; bvn: string | null; selfie_url: string | null }[];
  stats: { projects: number; milestones_paid: number; open_disputes: number };
  labels: Record<VendorCheck, [string, string]>;
}

// ---------------------------------------------------------------- Disputes (DSP-08/09 decisions)

export type DisputeStatus = "open" | "responded" | "fixing" | "escalated" | "resolved" | "under_review" | "rejected";

export interface DisputeRow {
  id: number;
  number: string | null;
  subject: string;
  kind: "milestone" | "payment_made" | "payment_received" | "other";
  category: string;
  status: DisputeStatus;
  status_label: string;
  active: boolean;
  against: string | null;
  raised_by: string | null;
  raised_by_name: string | null;
  project: { id: number; title: string } | null;
  milestone: { id: number; title: string } | null;
  amount_on_hold: string | null;
  reply_by: string | null;
  decision_due: string | null;
  outcome: string | null;
  released_amount: string | null;
  refund_amount: string | null;
  resolved_at: string | null;
  created_at: string | null;
}

export interface DisputesData {
  disputes: DisputeRow[];
  counts: Partial<Record<DisputeStatus, number>>;
  pagination: Pagination;
}

export interface DisputeDetail {
  id: number;
  number: string | null;
  subject: string;
  kind: DisputeRow["kind"];
  category: string;
  status: DisputeStatus;
  reason_label: string | null;
  remedy_label: string | null;
  description: string;
  reference: string | null;
  amount_on_hold: string | null;
  raised_by: { id: number; name: string } | null;
  against: { id: number; name: string; profile_id: number | null } | null;
  project: { id: number; title: string } | null;
  milestone: { id: number; title: string; amount: string; status: string } | null;
  reply_by: string | null;
  escalated_at: string | null;
  escalation_note: string | null;
  decision_due: string | null;
  evidence_until: string | null;
  outcome: string | null;
  resolution: string | null;
  released_amount: string | null;
  refund_amount: string | null;
  resolved_at: string | null;
  created_at: string | null;
  messages: { id: number; kind: "message" | "offer" | "system" | "decision"; body: string | null; offer: { type: string; status: string; fix_by?: string; amount?: string } | null; from: "family" | "vendor" | "patriai"; name: string; created_at: string | null }[];
  files: { id: number; kind: "image" | "video" | "document"; url: string; name: string; from: "family" | "vendor" }[];
}
