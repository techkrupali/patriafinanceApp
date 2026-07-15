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

export interface WalletMember {
  /** Present on the members endpoint; absent on the wallet-detail embed. */
  id?: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
  can_approve: boolean;
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
  | 'wallet_member_removed';

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
