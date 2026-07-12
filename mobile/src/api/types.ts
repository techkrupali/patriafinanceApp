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

export type WalletType = 'main' | 'shared' | 'project';

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
  user_id: number;
  name: string;
  email: string;
  role: string;
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
}

export interface WalletsData {
  wallets: Wallet[];
}

export interface WalletCreatedData {
  wallet: Wallet;
}

export interface WalletDetailData {
  wallet: Wallet;
  members: WalletMember[];
  recent_transactions: Transaction[];
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

export interface WithdrawData {
  transaction: Transaction;
}

export interface TransferData {
  reference: string;
  /** Source wallet balance after transfer (naira decimal string) */
  balance: string;
  recipient: { name: string; email: string } | null;
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
