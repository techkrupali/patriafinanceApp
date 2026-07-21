import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

export type AuthStackParamList = {
  Walkthrough: undefined;
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Otp: { identifier: string; purpose: 'verify' | 'login'; sentTo?: string; debugOtp?: string };
  ForgotPassword: undefined;
};

/**
 * Client footer spec: 5 slots — Home · Family · Steward (dead-center AI) ·
 * Treasury · More. Rules lives inside More.
 */
export type MainTabParamList = {
  Home: undefined;
  Family: undefined;
  Steward: undefined;
  Treasury: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  /** Full transaction feed (was a tab; now reached from Home → View all). */
  Activity: undefined;
  WalletDetail: { walletId: number };
  Fund: { walletId: number };
  Withdraw: { walletId: number };
  Transfer: { walletId?: number } | undefined;
  RequestSpend: { walletId: number };
  CreateWallet: undefined;
  ChangePassword: undefined;
  ChangePin: undefined;
  Devices: undefined;
  // ---- Collaboration & governance (Milestone 3) ----
  InviteMember: { walletId: number };
  WalletSettings: { walletId: number };
  AssignAccess: { walletId: number };
  // ---- Family Hub & Spousal Sync ----
  FamilyHub: undefined;
  FamilyMember: { memberId: number };
  SpousalSync: undefined;
  // ---- Wallet governance (Audit / Lock / Automation) ----
  WalletAuditLog: { walletId: number };
  WalletLock: { walletId: number };
  Automations: undefined;
  CreateAutomation: undefined;
  // ---- Support & compliance ----
  Disputes: undefined;
  RaiseDispute: { reference?: string; category?: string } | undefined;
  HelpFaq: undefined;
  SecurityCenter: undefined;
  // ---- Referral & rewards ----
  Referral: undefined;
  // ---- Savings goals ----
  Goals: undefined;
  CreateGoal: undefined;
  // ---- Vendor discovery ----
  VendorDirectory: undefined;
  VendorProfile: { profileId: number };
  BecomeVendor: undefined;
  Approvals: { scope?: 'to_me' | 'mine' } | undefined;
  ApprovalDetail: { approvalId: number };
  Notifications: undefined;
  Invitations: undefined;
  // ---- Loans (Milestone 4 — Patria Lending) ----
  Loans: undefined;
  LoanApply: undefined;
  LoanDetail: { loanId: number };
  Repay: { loanId: number };
  // ---- Projects & vendors (Milestone 5) ----
  Projects: undefined;
  CreateProject: undefined;
  ProjectDetail: { projectId: number };
  AssignVendor: { projectId: number };
  AddMilestone: { projectId: number };
  // ---- KYC & compliance (Milestone 6) ----
  Kyc: undefined;
  KycSubmit: { targetTier: number };
};

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
