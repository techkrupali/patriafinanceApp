// Shapes mirror the Laravel API serializers (ApiController.php).
// Envelope: { status: boolean, message: string, data?: T, errors?: ... }

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  kyc_tier: number;
  role: string;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
  has_pin: boolean;
  created_at: string | null;
}

export type WalletType =
  | 'main'
  | 'shared'
  | 'project'
  | 'savings'
  | 'goal'
  | 'emergency'
  | 'giving'
  | 'joint'
  | 'child'
  | 'spending';

/** Types a user is allowed to create (everything except the system `main` wallet). */
export type CreatableWalletType = Exclude<WalletType, 'main'>;

export interface WalletOwner {
  id: number;
  name: string;
  email: string;
}

export interface Wallet {
  id: number;
  type: WalletType;
  name: string;
  currency: string;
  /** Naira amount as a decimal string, e.g. "12500.00" */
  balance: string;
  virtual_account: string | null;
  virtual_account_bank: string | null;
  status: string;
  /** Scheduled-access window (Wallet Lock feature); null when unrestricted. */
  access_schedule?: AccessSchedule | null;
  created_at: string | null;
  owner?: WalletOwner;
  my_role?: string;
  // ---- Governance (Milestone 3) ----
  description?: string | null;
  /** Naira decimal string, or null when the wallet has no target. */
  target_amount?: string | null;
  approval_enabled?: boolean;
  /** Naira decimal string. null = every spend needs approval. */
  approval_threshold?: string | null;
  required_approvals?: number;
}

export interface Transaction {
  id: number;
  reference: string;
  wallet_id: number;
  type: string;
  direction: 'credit' | 'debit';
  /** Naira decimal string */
  amount: string;
  /** Naira decimal string */
  fee: string;
  /** Naira decimal string */
  balance_after: string | null;
  status: string;
  description: string | null;
  counterparty: Record<string, unknown> | null;
  created_at: string | null;
}

/** Per-member granular access matrix ("Assign Wallet Access & Roles"). */
export interface MemberPermissions {
  view: boolean;
  fund: boolean;
  request: boolean;
  withdraw: boolean;
  /** Max amount this member may request in one spend request (naira string), or null = no cap. */
  request_limit?: string | null;
}

export interface WalletMember {
  /** Present on the members endpoint; absent on the wallet-detail embed. */
  id?: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
  can_approve: boolean;
  /** Present on the members endpoint. */
  can_spend?: boolean;
  /** Effective granular access matrix; present on the members endpoint. */
  permissions?: MemberPermissions;
  /** Present on the members endpoint. */
  status?: string;
}

// ---- Governance (Milestone 3) ----

export type MemberRole = 'owner' | 'co_owner' | 'admin' | 'contributor' | 'viewer';

export interface WalletRef {
  id: number;
  name: string;
  type: WalletType;
}

export interface PersonRef {
  id: number;
  name: string;
}

export interface WalletInvitation {
  id: number;
  role: string;
  can_approve: boolean;
  status?: string;
  /** The email/phone the invite was sent to (wallet-scoped list). */
  identifier?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Present on the "my invitations" list. */
  wallet?: WalletRef;
  inviter?: PersonRef;
  created_at?: string | null;
  expires_at?: string | null;
}

export type ApprovalAction = 'withdrawal' | 'transfer_wallet' | 'transfer_user' | 'transfer_bank';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed'
  | 'cancelled';

export interface ApprovalResponse {
  approver: PersonRef | null;
  decision: 'approve' | 'reject';
  note: string | null;
  created_at: string | null;
}

export interface ApprovalRequest {
  id: number;
  wallet: WalletRef;
  initiator: PersonRef;
  action: ApprovalAction;
  /** Naira decimal string */
  amount: string;
  /** Naira decimal string */
  fee: string;
  description: string | null;
  status: ApprovalStatus;
  approvals_count: number;
  required_approvals: number;
  executed_transaction_reference: string | null;
  fail_reason: string | null;
  expires_at: string | null;
  created_at: string | null;
  /** Whether the current user has already responded. */
  my_responded?: boolean;
  /** Only on the detail endpoint. */
  responses?: ApprovalResponse[];
}

export type NotificationType =
  | 'approval_requested'
  | 'approval_rejected'
  | 'approval_executed'
  | 'approval_failed'
  | 'invitation_received'
  | 'invitation_accepted'
  | 'transfer_received'
  | 'wallet_member_removed'
  | 'admin_message'
  | 'transaction_reversed'
  | 'admin_adjustment';

export interface AppNotification {
  id: number;
  type: NotificationType | string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  read_at: string | null;
  created_at: string | null;
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface Bank {
  bank_name: string;
  bank_code: string;
}

export interface DeviceInfo {
  id: number;
  device_id: string;
  device_name: string | null;
  platform: string | null;
  last_active_at: string | null;
}

// ---- Response payloads (the `data` part of the envelope) ----

export interface AuthSessionData {
  user: User;
  token: string;
}

export interface RegisterData extends AuthSessionData {
  otp_sent_to: string;
  debug_otp?: string;
}

export interface OtpRequestData {
  sent_to?: string;
  debug_otp?: string;
}

export interface DashboardData {
  total_balance: string;
  inflow_30d: string;
  outflow_30d: string;
  wallets: Wallet[];
  recent_transactions: Transaction[];
  pending_approvals?: number;
  unread_notifications?: number;
  /** Milestone 4 — the borrower's current active loan, or null. */
  active_loan?: ActiveLoanSummary | null;
  /** Milestone 5 — vendor/project counters. */
  projects?: DashboardProjects;
  /** Milestone 6 — KYC snapshot for status chips & verify prompts. */
  kyc?: DashboardKyc;
}

export interface WalletsData {
  wallets: Wallet[];
}

export interface WalletCreatedData {
  wallet: Wallet;
}

export interface WalletApprovalConfig {
  enabled: boolean;
  /** Naira decimal string, or null when every spend needs approval. */
  threshold: string | null;
  required_approvals: number;
}

export interface WalletDetailData {
  wallet: Wallet;
  members: WalletMember[];
  my_role: string;
  /** Whether the current user may move money out of this wallet (server-derived). */
  my_can_spend?: boolean;
  /** Whether the current user may request a spend (routed to owner approval). */
  my_can_request?: boolean;
  approval: WalletApprovalConfig;
  /** Naira decimal string held against pending approvals. */
  held_amount: string;
  pending_approvals: number;
  recent_transactions: Transaction[];
}

export interface WalletUpdatedData {
  wallet: Wallet;
}

export interface WalletMembersData {
  members: WalletMember[];
}

export interface MemberUpdatedData {
  member: WalletMember;
}

export interface InvitationCreatedData {
  invitation: WalletInvitation;
}

export interface InvitationsData {
  invitations: WalletInvitation[];
}

export interface InvitationAcceptData {
  wallet: Wallet;
  member: WalletMember;
}

export interface ApprovalsData {
  approvals: ApprovalRequest[];
}

export interface ApprovalDetailData {
  approval: ApprovalRequest;
}

export interface NotificationsPageData {
  notifications: AppNotification[];
  pagination: Pagination;
}

export interface UnreadCountData {
  count: number;
}

export interface NotificationReadData {
  notification: AppNotification;
}

export interface TransactionsPageData {
  transactions: Transaction[];
  pagination: Pagination;
}

export interface FundingDetailsData {
  account_number: string;
  bank_name: string | null;
  account_name: string;
  note: string;
}

/** A spend that was queued for approval instead of executing immediately. */
export interface PendingApprovalData {
  pending_approval: true;
  approval: ApprovalRequest;
}

export interface WithdrawSuccessData {
  transaction: Transaction;
}

export type WithdrawData = WithdrawSuccessData | PendingApprovalData;

export interface TransferSuccessData {
  reference: string;
  /** Source wallet balance after transfer (naira decimal string) */
  balance: string;
  recipient: { name: string; email: string } | null;
}

export type TransferData = TransferSuccessData | PendingApprovalData;

/** Narrows a withdraw/transfer response to the queued-for-approval branch. */
export function isPendingApproval(
  data: WithdrawData | TransferData,
): data is PendingApprovalData {
  return 'pending_approval' in data && data.pending_approval === true;
}

export interface BanksData {
  banks: Bank[];
}

export interface VerifyAccountData {
  account_name: string;
  bank_name: string;
}

export interface DevicesData {
  devices: DeviceInfo[];
}

export interface MeData {
  user: User;
}

// ---- Request payloads ----

export interface DeviceMeta {
  device_id: string;
  device_name: string;
  platform: 'android' | 'ios' | 'web';
}

export interface RegisterPayload extends DeviceMeta {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  pin: string;
}

export interface LoginPayload extends DeviceMeta {
  identifier: string;
  password: string;
}

export type TransferDestination =
  | { kind: 'wallet'; wallet_id: number }
  | { kind: 'user'; identifier: string }
  | {
      kind: 'bank';
      bank_code: string;
      account_number: string;
      account_name: string;
      bank_name: string;
    };

export interface TransferPayload {
  from_wallet_id: number;
  amount: string;
  pin: string;
  description?: string;
  destination: TransferDestination;
}

export interface WithdrawPayload {
  amount: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  pin: string;
  description?: string;
}

// ---- Governance request payloads (Milestone 3) ----

export interface CreateWalletPayload {
  type: CreatableWalletType;
  name: string;
  description?: string;
  /** Naira decimal string */
  target_amount?: string;
}

export interface UpdateWalletPayload {
  name?: string;
  description?: string;
  approval_enabled?: boolean;
  /** Naira decimal string, or null to require approval on every spend. */
  approval_threshold?: string | null;
  required_approvals?: number;
}

export interface UpdateMemberPayload {
  role?: string;
  can_approve?: boolean;
  can_spend?: boolean;
  /**
   * Granular access matrix toggles (all optional, merged server-side).
   * `request_limit` is sent as a naira NUMBER (or null to clear), unlike the
   * read model which serializes it as a naira string.
   */
  permissions?: {
    view?: boolean;
    fund?: boolean;
    request?: boolean;
    withdraw?: boolean;
    request_limit?: number | null;
  };
}

export interface CreateInvitationPayload {
  /** Email or phone of the person to invite. */
  identifier: string;
  role?: string;
  can_approve?: boolean;
}

export interface RespondApprovalPayload {
  decision: 'approve' | 'reject';
  note?: string;
}

// ============================================================================
// Milestone 4 — Loan System (Patria Lending)
// ============================================================================

export type LoanCategory =
  | 'rent'
  | 'mortgage'
  | 'car'
  | 'school_fees'
  | 'family_emergency'
  | 'business'
  | 'feeding'
  | 'child_allowance'
  | 'short_term';

export type RepaymentFrequency = 'once' | 'weekly' | 'monthly';

export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'active'
  | 'repaid'
  | 'defaulted'
  | 'cancelled';

export type RepaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export interface Loan {
  id: number;
  reference: string;
  category: LoanCategory | string;
  purpose: string | null;
  /** Naira decimal string */
  principal: string;
  /** Interest in basis points, e.g. 500 = 5%. */
  interest_bps: number;
  /** Naira decimal string */
  fee: string;
  /** Naira decimal string */
  total_repayable: string;
  /** Naira decimal string still owed */
  outstanding: string;
  /** Naira decimal string of accrued penalties */
  penalty_accrued: string;
  tenor_days: number;
  repayment_frequency: RepaymentFrequency | string;
  status: LoanStatus | string;
  disbursed_wallet_id: number | null;
  disbursed_at: string | null;
  due_at: string | null;
  /** 0–100 */
  progress_pct: number;
  created_at: string | null;
}

export interface LoanRepayment {
  id: number;
  sequence: number;
  /** "YYYY-MM-DD" */
  due_date: string;
  /** Naira decimal string */
  amount_due: string;
  /** Naira decimal string */
  amount_paid: string;
  status: RepaymentStatus | string;
  paid_at: string | null;
}

export interface LoanEligibility {
  /** Naira decimal string of the max the user may borrow. */
  max_amount: string;
  /** Same limit in integer kobo, for exact validation. */
  max_amount_kobo: number;
  tier: number;
  /** When the user's tier is too low to borrow, the tier they must reach (e.g. 3). */
  requires_tier?: number;
  categories: string[];
  has_active_loan: boolean;
}

export interface LoanSummary {
  /** Naira decimal string */
  active_outstanding: string;
  /** Naira decimal string */
  total_borrowed: string;
  has_active_loan: boolean;
}

/** Compact active-loan surfaced on the dashboard. */
export interface ActiveLoanSummary {
  has_active_loan: boolean;
  /** Naira decimal string */
  outstanding: string;
  loan_id: number;
  reference: string;
}

// ---- Loan response payloads ----

export interface LoansData {
  loans: Loan[];
  summary: LoanSummary;
}

/** Both GET /loans/{id} and POST /loans return this shape. */
export interface LoanDetailData {
  loan: Loan;
  repayments: LoanRepayment[];
}

export interface LoanRepayResultData {
  loan: Loan;
  transaction: Transaction;
}

export interface LoanCancelData {
  loan: Loan;
}

// ---- Loan request payloads ----

export interface ApplyLoanPayload {
  category: LoanCategory | string;
  /** Naira decimal string */
  amount: string;
  tenor_days: number;
  repayment_frequency: RepaymentFrequency;
  purpose?: string;
  disburse_wallet_id?: number;
}

export interface RepayLoanPayload {
  /** Naira decimal string */
  amount: string;
  wallet_id: number;
  pin: string;
}

// ============================================================================
// Milestone 5 — Vendor & Project System (escrow-backed milestones)
// ============================================================================

export type ProjectStatus = 'active' | 'completed' | 'cancelled';

export type MilestoneStatus = 'funded' | 'submitted' | 'approved' | 'released' | 'rejected';

/** The current user's relationship to a project. */
export type ProjectRole = 'owner' | 'vendor';

export interface Project {
  id: number;
  title: string;
  description: string | null;
  wallet_id: number;
  /** Naira decimal string — total in the escrow wallet. */
  wallet_balance: string;
  /** Naira decimal string — the project budget. */
  budget: string;
  /** Naira decimal string — reserved against un-released milestones. */
  reserved: string;
  /** Naira decimal string — escrow not yet reserved by a milestone. */
  available: string;
  /** Naira decimal string — already paid out to the vendor. */
  released: string;
  status: ProjectStatus;
  vendor: PersonRef | null;
  owner: PersonRef | null;
  my_role: ProjectRole | null;
  milestones_total: number;
  milestones_released: number;
  created_at: string | null;
}

export interface Milestone {
  id: number;
  sequence: number;
  title: string;
  description: string | null;
  /** Naira decimal string reserved for this milestone. */
  amount: string;
  status: MilestoneStatus;
  /** Vendor-supplied proof of work, once submitted. */
  proof: string | null;
  submitted_at: string | null;
  released_at: string | null;
  released_transaction_reference: string | null;
  created_at: string | null;
}

/** Dashboard project counters (Milestone 5). */
export interface DashboardProjects {
  as_owner: number;
  as_vendor: number;
  pending_submissions: number;
}

/** owner/vendor contact on the project detail (carries email). */
export interface ProjectContact {
  name: string;
  email: string;
}

// ---- Project response payloads ----

export interface ProjectsData {
  projects: Project[];
}

export interface ProjectCreatedData {
  project: Project;
  /** The freshly-created escrow wallet, with a virtual_account to fund it. */
  wallet: Wallet;
}

export interface ProjectDetailData {
  project: Project;
  wallet: Wallet;
  owner: ProjectContact | null;
  vendor: ProjectContact | null;
  my_role: ProjectRole | null;
  milestones: Milestone[];
  /** Naira decimal strings (mirror the same fields on `project`). */
  reserved: string;
  available: string;
  released: string;
}

/** Vendor assign/remove both return the updated project. */
export interface ProjectMutatedData {
  project: Project;
}

export interface MilestoneCreatedData {
  milestone: Milestone;
  project: Project;
}

export interface MilestoneData {
  milestone: Milestone;
}

/** Approve pays the vendor and returns the disbursement reference. */
export interface MilestoneApprovedData {
  milestone: Milestone;
  reference: string;
}

// ---- Project request payloads ----

export interface CreateProjectPayload {
  title: string;
  description?: string;
  /** Naira decimal string */
  budget?: string;
}

export interface AssignVendorPayload {
  /** Vendor's email or phone. */
  identifier: string;
}

export interface AddMilestonePayload {
  title: string;
  description?: string;
  /** Naira decimal string — must be ≤ the project's available escrow. */
  amount: string;
}

export interface SubmitMilestonePayload {
  proof: string;
}

export interface RejectMilestonePayload {
  note?: string;
}

// ============================================================================
// Milestone 6 — KYC & Compliance (progressive identity tiers)
// ============================================================================

/** Overall verification state of the account. */
export type KycStatus = 'unverified' | 'pending' | 'verified';

/** Lifecycle of an individual tier submission. */
export type KycSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type KycIdType = 'nin_slip' | 'drivers_license' | 'passport' | 'voters_card';

export type KycSourceOfFunds = 'employment' | 'business' | 'investment' | 'other';

export interface KycSubmission {
  id: number;
  target_tier: number;
  type: string;
  status: KycSubmissionStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

/** The wallet/transfer/loan ceilings unlocked at a given tier. */
export interface KycLimits {
  max_wallets: number;
  /** Naira decimal string, or null when there is no daily transfer cap. */
  daily_transfer_limit: string | null;
  /** Naira decimal string. */
  loan_cap: string;
}

/** The next tier the user can work towards (null when at the max tier). */
export interface KycNextTier {
  tier: number;
  requirements: string[];
  benefits: KycLimits;
}

export interface KycState {
  tier: number;
  max_tier: number;
  status: KycStatus;
  pending_submission: KycSubmission | null;
  /** The most recent rejected submission, so the user can see why & resubmit. */
  last_rejected: KycSubmission | null;
  limits: KycLimits;
  next_tier: KycNextTier | null;
}

/** Compact KYC snapshot surfaced on the dashboard. */
export interface DashboardKyc {
  tier: number;
  status: KycStatus;
  can_upgrade: boolean;
}

// ---- KYC response payloads ----

export interface KycSubmitData {
  submission: KycSubmission;
}

// ---- KYC request payloads ----

/** POST /kyc/submit — `target_tier` plus the fields required by that tier. */
export interface SubmitKycPayload {
  target_tier: number;
  // Tier 1 — Identity
  bvn?: string;
  nin?: string;
  id_type?: KycIdType;
  id_number?: string;
  // Tier 2 — Address
  address?: string;
  city?: string;
  state?: string;
  // Tier 3 — Source of Funds
  source_of_funds?: KycSourceOfFunds;
  occupation?: string;
  business_name?: string;
  /** Naira decimal string (optional). */
  monthly_income?: string;
}

// ============================================================================
// Family Hub — aggregated people & invitations across the user's wallets
// ============================================================================

export interface FamilyMembership {
  wallet_id: number;
  wallet_name: string;
  role: string;
  can_approve: boolean;
}

export interface FamilyMember {
  id: number;
  name: string;
  email: string;
  /** Uppercase initials. */
  avatar: string;
  /** Highest role held across shared wallets. */
  role: string;
  status: string;
  memberships: FamilyMembership[];
}

export interface FamilyInvitation {
  id: number;
  direction: 'sent' | 'received';
  wallet_id: number;
  wallet_name: string | null;
  invited_identifier: string;
  role: string;
  status: string;
  inviter: { id: number; name: string } | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface FamilyStats {
  total_members: number;
  shared_wallets: number;
  pending_invites: number;
  child_wallets: number;
  vendor_members: number;
}

export interface FamilyData {
  members: FamilyMember[];
  pending_invitations: {
    sent: FamilyInvitation[];
    received: FamilyInvitation[];
  };
  stats: FamilyStats;
}

// ============================================================================
// Spousal Sync — two-person financial-transparency link
// ============================================================================

export type SyncTransparency = 'minimal' | 'selective' | 'full';
export type SyncStatus = 'pending' | 'active' | 'paused' | 'ended';

export interface SyncWalletSummary {
  id: number;
  name: string;
  type: string;
  /** Naira decimal string. */
  balance: string;
}

export interface SpousalSync {
  id: number;
  /** True when the current user initiated the sync. */
  is_initiator: boolean;
  /** The other party — a resolved user, or just the raw invited identifier. */
  partner: { name: string; email: string } | { identifier: string };
  transparency: SyncTransparency;
  status: SyncStatus;
  shared_wallet_ids: number[];
  /** Shared wallet summaries (selective transparency only). */
  wallets: SyncWalletSummary[];
  responded_at: string | null;
  created_at: string | null;
}

export interface SyncData {
  sync: SpousalSync | null;
  history: SpousalSync[];
}

export interface SyncMutatedData {
  sync: SpousalSync;
}

export interface CreateSyncPayload {
  identifier: string;
}

export interface UpdateSyncTransparencyPayload {
  transparency: SyncTransparency;
  wallet_ids?: number[];
}

// ============================================================================
// Wallet Lock / Scheduled Access
// ============================================================================

export interface AccessSchedule {
  /** ISO weekdays allowed for spending, 1 (Mon) – 7 (Sun). */
  days: number[];
  /** "HH:MM" 24h window start. */
  start: string;
  /** "HH:MM" 24h window end. */
  end: string;
  /** IANA tz, e.g. "Africa/Lagos". */
  tz: string;
}

export interface SetAccessSchedulePayload {
  days: number[];
  start: string;
  end: string;
  tz?: string;
}

// ============================================================================
// Wallet Audit Log
// ============================================================================

export type AuditEvent =
  | 'member_added'
  | 'member_removed'
  | 'member_role_changed'
  | 'permissions_changed'
  | 'wallet_frozen'
  | 'wallet_unfrozen'
  | 'access_schedule_set'
  | 'settings_changed'
  | 'wallet_created'
  | 'large_spend'
  | string;

export interface AuditLogEntry {
  id: number;
  event: AuditEvent;
  description: string;
  actor: { id: number; name: string } | null;
  meta: Record<string, unknown> | null;
  created_at: string | null;
}

export interface AuditLogPageData {
  audit_log: AuditLogEntry[];
  pagination: { page: number; per_page: number; total: number; last_page: number };
}

// ============================================================================
// Automation / Smart Rules
// ============================================================================

export type AutomationFrequency = 'daily' | 'weekly' | 'monthly';

export interface AutomationRule {
  id: number;
  name: string;
  from_wallet: { id: number; name: string };
  to_wallet: { id: number; name: string };
  /** Naira decimal string. */
  amount: string;
  frequency: AutomationFrequency;
  /** 1 (Mon) – 7 (Sun), for weekly rules. */
  day_of_week: number | null;
  /** 1 – 28, for monthly rules. */
  day_of_month: number | null;
  /** Naira decimal string, or null. */
  min_balance: string | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_hint: string;
}

export interface AutomationsData {
  automations: AutomationRule[];
}

export interface AutomationMutatedData {
  automation: AutomationRule;
}

export interface AutomationRunData {
  result: { rule_id: number; status: string; reference?: string; amount?: string; period?: string; reason?: string };
  automation: AutomationRule;
}

export interface CreateAutomationPayload {
  name: string;
  from_wallet_id: number;
  to_wallet_id: number;
  /** Naira number (the API accepts numeric naira and stores kobo). */
  amount: number;
  frequency: AutomationFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  min_balance?: number | null;
  enabled?: boolean;
}

export interface UpdateAutomationPayload {
  name?: string;
  amount?: number;
  frequency?: AutomationFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  min_balance?: number | null;
  enabled?: boolean;
}

// ============================================================================
// Dispute Center
// ============================================================================

export type DisputeCategory = 'transaction' | 'project' | 'vendor' | 'account' | 'other';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected';

export interface Dispute {
  id: number;
  subject: string;
  category: DisputeCategory;
  reference: string | null;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string | null;
}

export interface DisputesPageData {
  disputes: Dispute[];
  pagination: Pagination;
}

export interface DisputeCreatedData {
  dispute: Dispute;
}

export interface RaiseDisputePayload {
  subject: string;
  category: DisputeCategory;
  reference?: string | null;
  description: string;
}

// ============================================================================
// Referral & Rewards (Affiliate & Referral Center) — tracking only
// ============================================================================

export interface ReferralStats {
  total_referred: number;
  verified_referred: number;
  /** Naira decimal string (display-only, tracked). */
  rewards_earned: string;
  /** Naira decimal string. */
  reward_per_referral: string;
}

export interface ReferredPerson {
  name: string;
  joined_at: string | null;
  verified: boolean;
}

export interface ReferralData {
  code: string;
  share_url: string;
  stats: ReferralStats;
  referred: ReferredPerson[];
}

export interface ApplyReferralPayload {
  code: string;
}

// ============================================================================
// Spend Requests (member requests a spend → owner approves → executes)
// ============================================================================

export interface SpendRequestPayload {
  /** Naira decimal string. */
  amount: string;
  pin: string;
  description?: string;
  destination: TransferDestination;
}

// ============================================================================
// Vendor Discovery (directory of vendor profiles; assignment stays in Projects)
// ============================================================================

export type VendorCategory =
  | 'construction'
  | 'events'
  | 'catering'
  | 'education'
  | 'tech'
  | 'logistics'
  | 'fashion'
  | 'health'
  | 'other';

export interface VendorListing {
  /** VendorProfile id (route param for the detail screen). */
  id: number;
  user_id: number;
  business_name: string;
  category: VendorCategory | string;
  bio: string | null;
  location: string | null;
  verified: boolean;
  /** The vendor's personal name. */
  name: string;
  initials: string;
  projects_completed: number;
  member_since: string | null;
}

export interface VendorDetail extends VendorListing {
  /** Contact identifiers — used to assign this vendor to a project. */
  email: string;
  phone: string | null;
}

export interface VendorsPageData {
  vendors: VendorListing[];
  pagination: Pagination;
}

export interface VendorDetailData {
  vendor: VendorDetail;
}

export interface MyVendorProfileData {
  profile: VendorListing | null;
}

export interface UpsertVendorPayload {
  business_name: string;
  category: VendorCategory | string;
  bio?: string | null;
  location?: string | null;
}
