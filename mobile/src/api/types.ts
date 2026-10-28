// Shapes mirror the Laravel API serializers (ApiController.php).
// Envelope: { status: boolean, message: string, data?: T, errors?: ... }

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  username: string | null;
  avatar_url: string | null;
  kyc_tier: number;
  role: string;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
  has_pin: boolean;
  /** False for phone sign-ups, who log in with their PIN and never set a password. */
  has_password: boolean;
  /** Transaction PIN length: 6 for phone sign-ups, 4 for older accounts. */
  pin_length: 4 | 6;
  language: 'en' | 'pcm';
  date_of_birth: string | null;
  onboarding_purposes: string[];
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
  /** Emergency wallet still held by its access rules (false for every other type). */
  emergency_locked?: boolean;
  /** Type-specific purpose chosen during guided setup, e.g. "medical". */
  purpose?: string | null;
  created_at: string | null;
  owner?: WalletOwner;
  my_role?: string;
  /** Someone besides you is in this wallet (GET /wallets only). */
  is_shared?: boolean;
  // ---- Governance (Milestone 3) ----
  description?: string | null;
  /** Naira decimal string, or null when the wallet has no target. */
  target_amount?: string | null;
  /** YYYY-MM-DD the owner wants to reach the target by (savings goals). */
  target_date?: string | null;
  approval_enabled?: boolean;
  /** Naira decimal string. null = every spend needs approval. */
  approval_threshold?: string | null;
  required_approvals?: number;
  // ---- Guided creation (WCR-02/09/11) ----
  /** Private (just you) or shared (family adds money and sees everything). */
  mode?: 'private' | 'shared' | null;
  /** Who decides a spend that needs a yes; null = the fixed required_approvals. */
  approval_mode?: ApprovalMode | null;
  /** Owner chose "Lock until goal is reached". */
  lock_until_goal?: boolean;
  /** Locked right now: every spend needs everyone's yes until the target is reached. */
  goal_locked?: boolean;
  /** How long approval requests wait for answers. */
  approval_expiry_hours?: number;
  /** Day of the month savers get a reminder (1–28), or null. */
  reminder_day?: number | null;
  /** SAV-01 colour. */
  colour?: WalletColour | null;
  /** SAV-05: locked until a date or the target; `locked` while it holds. */
  lock?: {
    mode: 'date' | 'target';
    until: string | null;
    early_break: boolean;
    approval: boolean;
    locked: boolean;
    /** SAV-05: kept from what's taken out early; half to the charity picked. */
    fee_percent?: number;
    charity?: { id: number; name: string; area: string | null; state: string | null } | null;
  } | null;
}

export type WalletColour = 'emerald' | 'mint' | 'gold' | 'deep' | 'clay' | 'violet';

/** "Any one approver", "everyone", or "more than half". */
export type ApprovalMode = 'any' | 'all' | 'majority';

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
  /** Who moved the money (wallet activity only). */
  by?: { id: number; first_name: string } | null;
}

/** GET /savings/insights — SAV-03 estimates from the last 3 months of Main. */
export interface SavingsInsights {
  main_wallet: { id: number; name: string; balance: string; account_number: string | null } | null;
  months: number;
  salary: { amount: string; day: number; from: string | null } | null;
  /** Monthly round-up estimate by step: "100" | "500" | "1000" → naira string. */
  roundups: Record<string, string>;
  /** SPD-02 "Last 3 months you spent about ₦338,000": spending from Main a month. */
  monthly_spending?: string;
  /** GIV-03: typical monthly bank deposits by wallet id (naira strings). */
  monthly_deposits?: Record<string, string>;
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
  /** The phone, email or @username the invite was sent to. */
  invitee_identifier?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Present on the "my invitations" list. */
  wallet?: WalletRef;
  inviter?: PersonRef;
  created_at?: string | null;
  expires_at?: string | null;
  /** Access chosen for this person at invite time (null = role defaults). */
  permissions?: InvitePermissions | null;
  /** Emergency contributors: what they were asked to put in each month. */
  pledge?: { amount: string; label: string } | null;
  /** Savings wallets: the plan the invitee is joining. */
  savings?: SavingsSummary | null;
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

export type OtpChannel = 'sms' | 'whatsapp';

export interface PhoneStartData {
  /** Masked phone number the code went to. */
  sent_to: string;
  channel: OtpChannel;
  /** Seconds before another code can be requested. */
  resend_in: number;
  debug_otp?: string;
}

/** Who owns a verified phone number, enough to greet them on the PIN screen. */
export interface PhoneAccount {
  first_name: string;
  initials: string;
  avatar_url: string | null;
  pin_length: 4 | 6;
}

export interface PhoneVerifyData {
  /** Short-lived proof that this phone was verified; spent by register/login/PIN reset. */
  phone_token: string;
  /** null when the number has no account yet (sign-up continues). */
  account: PhoneAccount | null;
}

export interface PinForgotData {
  /** Masked email the reset code went to. */
  sent_to: string;
  debug_otp?: string;
}

// ---- GET /home: the Home tab and the Treasury header (client prototype HOM-01 / TRS-01) ----

export interface HomeTotals {
  /** Naira decimal strings. */
  total: string;
  yours: string;
  shared: string;
  children: string;
  month_in: string;
  month_out: string;
}

export interface HomeNeedItem {
  kind: 'approval' | 'invitation' | 'milestone' | 'low_funds';
  id: number;
  /** Short lower-case label for the "3 need you:" line. */
  label: string;
}

export interface HomeUpcomingItem {
  kind: 'approval' | 'request' | 'rule';
  id: number;
  wallet_id: number;
  title: string;
  /** YYYY-MM-DD */
  date: string | null;
  subtitle: string;
  /** Naira decimal string. */
  amount: string;
  tone: 'warning' | 'danger' | 'neutral';
}

export interface HomeGoal {
  wallet_id: number;
  name: string;
  type: WalletType;
  percent: number;
  balance: string;
  target: string;
  target_date: string | null;
}

export interface HomeProject {
  id: number;
  title: string;
  status_line: string;
  needs_review: boolean;
}

export interface HomeData {
  first_name: string;
  wallet_count: number;
  totals: HomeTotals;
  needs_you: { count: number; items: HomeNeedItem[] };
  upcoming: HomeUpcomingItem[];
  goals: HomeGoal[];
  projects: HomeProject[];
  unread_notifications: number;
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
  /** Emergency wallets only (null otherwise). */
  emergency?: EmergencySummary | null;
  /** Savings/goal wallets with a plan (null otherwise). */
  savings?: SavingsSummary | null;
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

export interface PhoneRegisterPayload {
  phone_token: string;
  first_name: string;
  last_name: string;
  email: string;
  /** YYYY-MM-DD */
  date_of_birth: string;
  pin: string;
  language: 'en' | 'pcm';
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
  /** Spending wallets: what it's for (SPD-03 category). */
  budget_category_id?: number;
  destination: TransferDestination;
  /** Optional idempotency key — reused from the AI create_transfer hand-off. */
  idempotency_key?: string;
}

/**
 * Structured UI action the AI assistant can attach to a reply. `secure_transfer`
 * carries everything the frontend needs to submit a transfer to POST /transfers
 * EXCEPT the PIN, which the user enters into the secure PinSheet in-chat.
 */
export interface SecureTransferAction {
  type: 'secure_transfer';
  summary: {
    source_wallet: { id: number; name: string };
    /** Unified destination: a wallet (name) or a verified bank account. */
    destination: {
      kind: 'wallet' | 'bank';
      name: string; // wallet name OR verified account holder name
      bank_name?: string | null; // bank transfers only
      account_masked?: string | null; // bank transfers only, e.g. "******7890"
    };
    amount: string;
    fee: string; // "0.00" for wallet transfers
    currency: string;
    description: string | null;
    may_require_approval: boolean;
  };
  authorization: {
    action: 'open_secure_transfer';
    requires_pin: boolean;
    pin_set: boolean;
    transfer: {
      from_wallet_id: number;
      destination: TransferDestination;
      amount: string;
      description: string | null;
      idempotency_key: string;
    };
  };
}

/** A single transaction row shown in the assistant's structured list. */
export interface AssistantTransactionRow {
  id: number;
  reference: string;
  date: string | null;
  type: string;
  direction: 'credit' | 'debit';
  amount: string;
  currency: string;
  status: string;
  description: string | null;
  wallet: string | null;
  recipient: string | null;
}

/** Structured transaction list the app renders natively inside the chat. */
export interface TransactionListAction {
  type: 'transaction_list';
  title: string;
  summary: {
    total_transactions: number;
    count: number;
    total_amount: string | null;
  };
  transactions: AssistantTransactionRow[];
  page: number;
  per_page: number | null;
  has_more: boolean;
}

/** Grouped/aggregated transactions for one target (wallet, bank account, recipient). */
export interface TransactionGroupAction {
  type: 'transaction_group';
  title: string;
  target:
    | { type: 'wallet'; wallet_id: number; wallet_name: string | null }
    | { type: 'bank_account'; display: string }
    | { type: 'recipient'; display: string }
    | null;
  summary: {
    transaction_count: number;
    total_amount: string;
    total_incoming: string;
    total_outgoing: string;
    average_amount: string;
    currency: string;
    first_transaction: string | null;
    latest_transaction: string | null;
  };
  transactions: AssistantTransactionRow[];
  page: number;
  per_page: number | null;
  has_more: boolean;
}

/** A backend-team support escalation that was submitted. */
export interface SupportRequestAction {
  type: 'support_request';
  request_id: number | null;
  category: string | null;
  subject: string | null;
  status: string | null;
}

export type AssistantAction =
  | SecureTransferAction
  | TransactionListAction
  | TransactionGroupAction
  | SupportRequestAction;

export interface AssistantChatPayload {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AssistantChatData {
  reply: string;
  action: AssistantAction | null;
}

export interface WithdrawPayload {
  /** Spending wallets: what it's for. */
  budget_category_id?: number;
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
  /** Type-specific purpose key from the guided setup (see lib/walletGuides). */
  purpose?: string;
  /** Naira decimal string moved in from `source_wallet_id` at creation. */
  initial_deposit?: string;
  source_wallet_id?: number;
  /** Naira decimal string moved in every month from `source_wallet_id`. */
  monthly_amount?: string;
  /** 1–28; defaults to today's day of month. */
  monthly_day?: number;
  /** Emergency wallets only — the Step 2 access rules. */
  emergency?: EmergencyRulesPayload;
  // ---- Savings goals (savings + goal wallets) ----
  /** YYYY-MM-DD, after today. */
  target_date?: string;
  milestones?: { title: string; amount: string; due_date?: string }[];
  contributors?: { user_id: number; can_approve?: boolean; permissions?: InvitePermissions }[];
  savings_plan?: SavingsPlanPayload;
  // ---- Guided creation (WCR-02 → WCR-11) ----
  mode?: 'private' | 'shared';
  /** People to invite: an account by id, or a phone number / email for someone new. */
  members?: {
    user_id?: number;
    identifier?: string;
    role: 'co_owner' | 'contributor' | 'viewer';
    can_approve?: boolean;
    permissions?: InvitePermissions;
    /** Emergency contributors: naira a month, on the 25th. */
    pledge?: string;
    /** Emergency: invited by phone, they hold a key once they join. */
    keyholder?: boolean;
    /** SPD-05 spenders: categories by name (absent = all) and a daily limit (naira). */
    spend?: { categories?: string[] | null; daily_limit?: string | null };
  }[];
  colour?: WalletColour;
  lock?: { mode: 'none' | 'date' | 'target'; until?: string; early_break?: boolean; approval?: boolean; charity_id?: number | null };
  /** Spending wallets (SPD-02…06). */
  budget?: BudgetPayload;
  /** Giving wallets (GIV-01…06). */
  giving?: GivingPayload;
  /** "When does money need a yes?" — threshold null means any amount. */
  approval?: { threshold: string | null; mode: ApprovalMode; lock_until_goal?: boolean; expiry_hours?: number };
  reminder_day?: number;
  /** The draft this setup came from — deleted once the wallet exists. */
  draft_id?: number;
}

// ============================================================================
// Savings Goals + wallet drafts (client sheet "Savings Wallets", 2026-10-18)
// ============================================================================

export type SavingsFrequency = 'daily' | 'weekly' | 'monthly';

/** view / fund / request / withdraw chosen per invited person. */
export interface InvitePermissions {
  view: boolean;
  fund: boolean;
  request: boolean;
  withdraw: boolean;
}

export interface SavingsPlanPayload {
  /** SAV-02: a fixed amount on a schedule (amount + frequency). */
  schedule?: boolean;
  /** Naira decimal string — what EACH saver puts in per period. */
  amount?: string;
  frequency?: SavingsFrequency;
  day_of_week?: number;
  day_of_month?: number;
  /** A share of every salary that lands in Main (1–50). */
  salary_percent?: number;
  /** Round spending from Main up to ₦100 / ₦500 / ₦1,000. */
  roundup_to?: '100' | '500' | '1000';
  auto_save: boolean;
  allow_contributor_edit: boolean;
  /** SAV-06 if a save can't happen. */
  missed_policy?: SavingsMissedPolicy;
  notify_others_on_miss?: boolean;
  /** SAV-06 "Tell me — Push and SMS". */
  notify_sms?: boolean;
}

export type SavingsMissedPolicy = 'retry' | 'partial' | 'skip';

/** A plan or a saver's auto-save, as the API describes it. */
export interface SavingsTerms {
  amount: string;
  frequency: SavingsFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  /** "₦50.00 monthly on day 5" */
  label: string;
}

export interface SavingsSummary extends SavingsTerms {
  auto_save: boolean;
  allow_contributor_edit: boolean;
  /** False when the plan saves only from salary or round-ups. */
  schedule?: boolean;
  salary_percent?: number | null;
  roundup_to?: string | null;
  target_amount: string | null;
  target_date: string | null;
}

export interface SaverAutoSave extends SavingsTerms {
  enabled: boolean;
  /** Only shown for the viewer's own auto-save. */
  source_wallet: { id: number; name: string } | null;
}

export interface Saver {
  user: { id: number; name: string; username: string | null; avatar_url: string | null };
  status: 'owner' | 'member' | 'invited';
  auto_save: SaverAutoSave | null;
  total_saved: string;
  invitation_id?: number;
}

export interface SavingsDetail {
  wallet_id: number;
  balance: string;
  target_amount: string | null;
  target_date: string | null;
  progress: number | null;
  days_left: number | null;
  plan:
    | (SavingsTerms & {
        auto_save: boolean;
        allow_contributor_edit: boolean;
        schedule?: boolean;
        salary_percent?: number | null;
        roundup_to?: string | null;
        missed_policy?: SavingsMissedPolicy;
        notify_others_on_miss?: boolean;
      })
    | null;
  projection: {
    per_month: string;
    projected_date: string | null;
    on_track: boolean | null;
    /** Per-person amount (plan frequency) that would hit the target on time. */
    suggested_amount: string | null;
    reached: boolean;
  };
  milestones: { id: number; title: string; amount: string; due_date: string | null; reached: boolean; overdue: boolean }[];
  savers: Saver[];
  me: {
    is_owner: boolean;
    is_saver: boolean;
    can_edit_plan: boolean;
    can_edit_own_terms: boolean;
    auto_save: SaverAutoSave | null;
    can_start_auto_save: boolean;
  };
}

export interface SavingsDetailData {
  savings: SavingsDetail;
}

/** An unfinished wallet setup, resumable from the wallet list. */
export interface WalletDraft {
  id: number;
  type: CreatableWalletType;
  name: string | null;
  step: number;
  total_steps: number;
  data: Record<string, unknown>;
  updated_at: string | null;
}

export interface WalletDraftsData {
  drafts: WalletDraft[];
}

export interface WalletDraftData {
  draft: WalletDraft;
}

// ============================================================================
// Emergency Wallet (client video "Emergency Wallet instructions", 2026-10-17)
// ============================================================================

export type EmergencyPurpose = 'medical' | 'funeral' | 'travel' | 'legal' | 'other';
export type EmergencyRecipientRole = 'beneficiary' | 'fallback';
export type EmergencyAccessType = 'immediate' | 'delay_7d';
export type EmergencyUnlockVia = 'manual' | 'dual_approval' | 'document' | 'high_balance' | 'national_crisis';
export type EmergencyDocumentType = 'death_certificate' | 'legal_notice';

export interface EmergencyRecipientPayload {
  user_id: number;
  relationship?: string;
  /** Informational — the server derives it from the order (1st = beneficiary, rest = fallback). */
  role?: EmergencyRecipientRole;
  /** Naira decimal string; omit for "up to the full balance". */
  withdrawal_limit?: string;
  access_type: EmergencyAccessType;
}

export interface EmergencyRulesPayload {
  purpose: EmergencyPurpose;
  dual_approval: boolean;
  approver_user_id?: number;
  unlock_on_document: boolean;
  manual_unlock: boolean;
  unlock_reason?: string;
  emergency_pin?: string;
  override_national_crisis: boolean;
  override_high_balance: boolean;
  beneficiary_note?: string;
  beneficiaries: EmergencyRecipientPayload[];
  // ---- EMG-01/03/04 ----
  purposes?: EmergencyPurpose[];
  /** Keyholders besides you (Patriai users). */
  keyholders?: number[];
  /** "2 of 3": yeses a release needs, you included. */
  required_keyholders?: number;
  request_expiry_hours?: number;
  /** Naira; null/absent = no fast release. */
  fast_release_limit?: string | null;
  fast_release_every_days?: number;
  /** EMG-03 "Pay the hospital directly": released money goes to a bank account, not a person. */
  pay_directly?: boolean;
  /** EMG-05: people without the app who get an SMS link. Phone as typed; the server normalises it. */
  trusted_contacts?: EmergencyTrustedContactPayload[];
  trusted_can_request?: boolean;
  trusted_can_upload?: boolean;
  trusted_can_see_balance?: boolean;
}

export interface EmergencyTrustedContactPayload {
  name: string;
  phone: string;
  relation?: string;
}

export interface EmergencyTrustedContact {
  id: number;
  name: string;
  relation: string | null;
  /** Full number for the owner, masked for keyholders. */
  phone: string;
  masked_phone: string;
  link_sent: boolean;
}

/** Where a pay-directly release went. */
export interface EmergencyPayee {
  bank_name?: string;
  account_number: string;
  account_name: string;
}

export interface EmergencyPerson {
  id: number;
  name: string;
  username: string | null;
  avatar_url: string | null;
}

export interface EmergencySummary {
  purpose: EmergencyPurpose;
  locked: boolean;
  unlocked_at: string | null;
  unlocked_via: EmergencyUnlockVia | null;
  my_emergency_role: 'owner' | 'approver' | 'recipient' | null;
  /** Keyholders, you included, and how many must agree ("2 of 3"). */
  keyholders?: number;
  required?: number;
}

export interface EmergencyRecipient {
  id: number;
  user: EmergencyPerson | null;
  position: number;
  relationship: string | null;
  role: EmergencyRecipientRole;
  /** Naira decimal string, or null when capped only by the balance. */
  withdrawal_limit: string | null;
  access_type: EmergencyAccessType;
  withdrawn: string;
}

export interface EmergencyRequest {
  id: number;
  wallet_id: number;
  method: 'dual_approval' | 'document' | 'fast_release' | 'rule_change';
  document_type: EmergencyDocumentType | 'proof' | null;
  has_document: boolean;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'released' | 'flagged';
  /** Fast release: naira moved. */
  amount?: string | null;
  /** Keyholders' yeses so far and needed. */
  approvals?: number;
  required_approvals?: number | null;
  expires_at?: string | null;
  can_flag?: boolean;
  requested_by: EmergencyPerson | null;
  approved_by: EmergencyPerson | null;
  /** Asked by a trusted contact from their SMS link (no account). */
  trusted_contact?: { name: string; relation: string | null } | null;
  /** Fast release paid straight to the bill. */
  payee?: EmergencyPayee | null;
  /** Rule change: what would change, in words. */
  changes?: string[] | null;
  review_note: string | null;
  created_at: string | null;
  decided_at: string | null;
  can_approve: boolean;
  can_reject: boolean;
  can_cancel: boolean;
}

export interface EmergencyDetail {
  purpose: EmergencyPurpose;
  purposes?: EmergencyPurpose[];
  locked: boolean;
  unlocked_at: string | null;
  unlocked_via: EmergencyUnlockVia | null;
  balance: string;
  rules: {
    dual_approval: boolean;
    approver: EmergencyPerson | null;
    unlock_on_document: boolean;
    manual_unlock: boolean;
    unlock_reason: string | null;
    /** Owner only: a custom PIN is already set (editing may keep it). */
    has_custom_pin: boolean;
    override_national_crisis: boolean;
    override_high_balance: boolean;
    override_balance_threshold: string;
    keyholders?: EmergencyPerson[];
    required_keyholders?: number;
    request_expiry_hours?: number | null;
    fast_release?: { limit: string; every_days: number; last_at: string | null; next_at: string | null } | null;
    pay_directly?: boolean;
    trusted_can_request?: boolean;
    trusted_can_upload?: boolean;
    trusted_can_see_balance?: boolean;
  };
  /** Owner and keyholders only. */
  trusted_contacts?: EmergencyTrustedContact[];
  beneficiaries: EmergencyRecipient[];
  /** Owner always; recipients only once the wallet is unlocked. */
  beneficiary_note: string | null;
  requests: EmergencyRequest[];
  me: {
    role: 'owner' | 'approver' | 'recipient' | null;
    can_edit_rules: boolean;
    /** Owner, or the approver once unlocked: may withdraw/transfer directly. */
    can_spend: boolean;
    can_manual_unlock: boolean;
    can_override: boolean;
    can_lock: boolean;
    can_request_dual: boolean;
    can_submit_document: boolean;
    is_keyholder?: boolean;
    /** A rule change is waiting for the keyholders. */
    pending_rule_change?: boolean;
    can_fast_release?: boolean;
    beneficiary: {
      withdrawal_limit: string | null;
      withdrawn: string;
      remaining: string | null;
      access_type: EmergencyAccessType;
      access_available_at: string | null;
      can_withdraw_now: boolean;
    } | null;
  };
}

export interface EmergencyDetailData {
  emergency: EmergencyDetail;
}

export interface EmergencyWithdrawData {
  emergency: EmergencyDetail;
  reference: string;
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
  /** Email or phone of the person to invite (out-of-app invite). */
  identifier?: string;
  /** Existing registered user, picked via username search (in-app invite). */
  invitee_user_id?: number;
  role?: string;
  can_approve?: boolean;
  /** Per-person access applied when they accept (contributor/admin). */
  permissions?: InvitePermissions;
}

/** Slim user shape returned by GET /users/search. */
export interface UserSearchResult {
  id: number;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
}

export interface UsersSearchData {
  users: UserSearchResult[];
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
  /** Optional deadline, ISO date (YYYY-MM-DD). */
  due_date: string | null;
  status: MilestoneStatus;
  /** Vendor-supplied proof of work, once submitted. */
  proof: string | null;
  /** Uploaded image/video evidence attached to this milestone. */
  evidence: MilestoneEvidence[];
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
  /** Existing app user picked via @username search (in-app). */
  vendor_user_id?: number;
  /** Or a vendor's email/phone (external). */
  identifier?: string;
}

export interface MilestoneEvidence {
  id: number;
  kind: 'image' | 'video';
  url: string;
  uploaded_by: string | null;
  created_at: string | null;
}

export interface AddMilestonePayload {
  title: string;
  description?: string;
  /** Naira decimal string — must be ≤ the project's available escrow. */
  amount: string;
  /** Optional deadline, YYYY-MM-DD. */
  due_date?: string;
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
  wallet_type?: WalletType;
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
  /** schedule (calendar) | salary (percent of each salary) | roundup (swept daily). */
  trigger?: 'schedule' | 'salary' | 'roundup';
  percent?: number | null;
  roundup_to?: string | null;
  /** Round-ups built up and not yet moved. */
  pending_amount?: string;
  /** A missed save trying again. */
  retry_at?: string | null;
  frequency: AutomationFrequency;
  /** 1 (Mon) – 7 (Sun), for weekly rules. */
  day_of_week: number | null;
  /** 1 – 28, for monthly rules. */
  day_of_month: number | null;
  /** Naira decimal string, or null. */
  min_balance: string | null;
  enabled: boolean;
  last_run_at: string | null;
  /** YYYY-MM-DD of the next run, or null when paused. */
  next_run_on: string | null;
  next_run_hint: string;
}

/** A wallet's "when does money need a yes" rule, for the Rules tab. */
export interface ApprovalRuleSummary {
  wallet_id: number;
  wallet_name: string;
  wallet_type: WalletType;
  /** Naira decimal string; null = every payment needs a yes. */
  threshold: string | null;
  required_approvals: number;
  approval_mode?: ApprovalMode | null;
  goal_locked?: boolean;
  /** First names of the people who can approve. */
  approvers: string[];
}

export interface AutomationsData {
  automations: AutomationRule[];
  approval_rules: ApprovalRuleSummary[];
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

export type DisputeCategory =
  | 'transaction'
  | 'withdrawal'
  | 'project'
  | 'wallet'
  | 'vendor'
  | 'account'
  | 'other';
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
  /** Spending wallets: what it's for. */
  budget_category_id?: number;
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

// ============================================================================
// Family member detail (Child Dashboard / Overview)
// ============================================================================

export interface FamilyMemberMembership {
  wallet_id: number;
  wallet_name: string;
  wallet_type: string;
  role: string;
  can_approve: boolean;
  permissions: MemberPermissions;
  /** WalletMember row id (null when this person owns the wallet). */
  member_row_id: number | null;
}

export interface FamilyMemberDetailData {
  person: {
    id: number;
    name: string;
    email: string;
    avatar: string;
    role: string;
    member_since: string | null;
  };
  memberships: FamilyMemberMembership[];
  /** Spend requests this person raised on wallets you manage. */
  recent_requests: ApprovalRequest[];
  stats: {
    shared_wallets: number;
    pending_requests: number;
    approved_requests_30d: number;
  };
}

// ============================================================================
// Spending, Giving, saved accounts (client sheet "Wallets · Savings, Spending, Giving")
// ============================================================================

export type BudgetPeriod = 'weekly' | 'monthly' | 'one_off';
export type BudgetFunding = 'topup' | 'split' | 'manual';

export interface BudgetPayload {
  /** Naira. */
  amount: string;
  period: BudgetPeriod;
  /** Monthly: day 1–28 ("the 25th"); weekly: ISO weekday. */
  start_day?: number;
  leftover?: { mode: 'keep' | 'main' | 'wallet'; wallet_id?: number | null };
  funding?: BudgetFunding;
  /** Split funding: your own share each period (naira). */
  my_share?: string;
  alerts?: { half?: boolean; eighty?: boolean; category_out?: boolean; weekly?: boolean };
  over_limit?: 'approve' | 'stop';
  categories?: { name: string; limit: string }[];
}

export interface BudgetCategoryRow {
  id: number;
  name: string;
  limit: string;
  spent: string;
}

/** WAL-09 GET /wallets/{id}/budget */
export interface BudgetDetail {
  amount: string;
  period: BudgetPeriod;
  start_day: number;
  period_start: string;
  next_period_start: string | null;
  leftover: { mode: 'keep' | 'main' | 'wallet'; wallet_id: number | null; wallet_name: string | null };
  funding: BudgetFunding;
  alerts: { half: boolean; eighty: boolean; category_out: boolean; weekly: boolean };
  over_limit: 'approve' | 'stop';
  spent: string;
  categories: BudgetCategoryRow[];
  /** `pending`: invited, not joined yet. */
  spenders: { user_id: number | null; name: string | null; role: string; can_spend: boolean; pending?: boolean; categories: string[] | null; daily_limit: string | null }[];
  viewers: string[];
  me: { categories: number[] | null; daily_limit: string | null };
}

export interface BudgetDetailData {
  budget: BudgetDetail;
}

export type GivingKind = 'tithes' | 'zakat' | 'charity' | 'parents' | 'dues';
export type GivingFrequency = 'weekly' | 'monthly' | 'monthly_weekday' | 'once';

export interface GivingSchedulePayload {
  label: string;
  /** Naira per giving date (a group splits it evenly). */
  amount: string;
  saved_account_id?: number;
  group_id?: number;
  frequency: GivingFrequency;
  day_of_week?: number;
  day_of_month?: number;
  week_of_month?: number;
  run_on?: string;
}

export interface GivingPayload {
  kind: GivingKind;
  source_wallet_id?: number;
  recipients: ({ saved_account_id: number } | { group_id: number })[];
  /** Client: fixed amounts and a percentage of deposits, from one or more wallets. */
  set_aside: (
    | { kind: 'percent'; source_wallet_id: number; percent: number }
    | { kind: 'fixed'; source_wallet_id: number; amount: string; day_of_month: number }
    | { kind: 'roundup'; source_wallet_id: number; roundup_to: string }
  )[];
  schedules: GivingSchedulePayload[];
  ask_first: boolean;
  thanksgiving_reminder: boolean;
  pledge?: {
    name: string;
    total: string;
    paid_before: string;
    due_date: string;
    saved_account_id?: number;
    group_id?: number;
    parts: { date: string; amount: string }[];
  } | null;
  receipts: boolean;
  yearly_statement: boolean;
  anonymous: boolean;
}

/** WAL-18 GET /wallets/{id}/giving */
export interface GivingDetail {
  kind: GivingKind | null;
  settings: { kind?: GivingKind; ask_first?: boolean; thanksgiving_reminder?: boolean; receipts?: boolean; yearly_statement?: boolean; anonymous?: boolean; source_wallet_id?: number | null };
  set_aside: string;
  given_this_year: string;
  set_aside_rules: { id: number; name: string; trigger: string; percent: number | null; amount: string; from: string | null; enabled: boolean }[];
  coming_up: { schedule_id: number; date: string; label: string; amount: string; to: string; when: string; ask_first: boolean }[];
  schedules: { id: number; label: string; amount: string; to: string; when: string; frequency: GivingFrequency; ask_first: boolean; enabled: boolean; pledge_id: number | null }[];
  awaiting: { id: number; label: string | null; amount: string; to: string | null; date: string }[];
  recent: { id: number; label: string | null; amount: string; to: string | null; status: 'paid' | 'failed' | 'skipped'; receipt_no: string | null; note: string | null; date: string }[];
  pledge: { id: number; name: string; total: string; paid: string; due_date: string | null; to: string | null } | null;
  recipients: ({ group_id: number; name: string; accounts: string[] } | { saved_account_id: number; name: string; verified: boolean })[];
  statement: { year: number; enabled: boolean };
}

export interface GivingDetailData {
  giving: GivingDetail;
}

export type OrganisationKind = 'church' | 'mosque' | 'charity' | 'school' | 'other';
export type CharityCause = 'children' | 'food' | 'education' | 'health' | 'elderly' | 'faith';

export interface Organisation {
  id: number;
  name: string;
  kind: OrganisationKind;
  cause: CharityCause | null;
  area: string | null;
  state: string | null;
  about: string | null;
  verified: boolean;
  bank_name: string;
  masked_number: string;
}

export interface OrganisationsData {
  organisations: Organisation[];
  total: number;
  states: string[];
}

export interface SavedAccount {
  id: number;
  nickname: string;
  account_name: string;
  account_number: string;
  masked_number: string;
  bank_code: string;
  bank_name: string;
  category: string;
  verified: boolean;
  organisation: { id: number; kind: OrganisationKind; area: string | null; state: string | null } | null;
  groups: string[];
}

export interface SavedAccountGroup {
  id: number;
  name: string;
  accounts: { id: number; nickname: string; verified: boolean }[];
}

export interface SavedAccountsData {
  accounts: SavedAccount[];
  groups: SavedAccountGroup[];
}
