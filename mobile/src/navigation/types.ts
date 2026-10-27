import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { CreatableWalletType, EmergencyPurpose, OtpChannel, PhoneAccount, UserSearchResult } from '../api/types';
import type { RecipientDraft } from '../components/RecipientSheet';

/** ONB-05 answers carried to the PIN step, where the account is created. */
export interface SignupDetails {
  first_name: string;
  last_name: string;
  email: string;
  /** YYYY-MM-DD */
  date_of_birth: string;
}

/**
 * Phone-first onboarding and log-in, per the client prototype:
 * Welcome → Phone → Code → Details → CreatePin → Purpose → WalletReady, and
 * Welcome → Login → Code → Unlock for an existing account.
 */
export type AuthStackParamList = {
  Welcome: undefined;
  /** ONB-03 */
  Phone: undefined;
  /** ACC-01 */
  Login: undefined;
  /** ONB-04, shared by sign-up and log-in. */
  Code: {
    /** E.164 */
    phone: string;
    channel: OtpChannel;
    resendIn: number;
    flow: 'signup' | 'login';
    debugOtp?: string;
  };
  /** ONB-05 */
  /** serverErrors: the PIN step sends us back when the server rejects a detail. */
  Details: { phoneToken: string; serverErrors?: { name?: string; email?: string; dob?: string } };
  /** ONB-06 + ONB-07, then ONB-08 once the account exists. */
  CreatePin: { phoneToken: string; details: SignupDetails };
  /** ONB-09 */
  Purpose: undefined;
  /** ONB-12 */
  WalletReady: undefined;
  /** ACC-02 */
  Unlock: { phoneToken: string; account: PhoneAccount };
  /** Forgot PIN: a code to the email on file, then a new PIN. */
  ForgotPin: { phoneToken: string; account: PhoneAccount };
};

/**
 * Client footer spec (video 2026-08-03): 6 flat tabs — Home · Family ·
 * Steward · Treasury · Rules · More.
 */
export type MainTabParamList = {
  Home: undefined;
  Family: undefined;
  Steward: undefined;
  Treasury: undefined;
  Rules: undefined;
  More: undefined;
};

/** Emergency wallet Step 1 answers carried into Step 2 (naira as typed). */
export interface EmergencyStepOne {
  name: string;
  purpose: EmergencyPurpose;
  /** Raw naira digits; '' = no initial deposit. */
  initialDeposit: string;
  sourceWalletId: number | null;
  /** Raw naira digits; '' = monthly auto-funding off. */
  monthlyAmount: string;
}

/** Emergency wallet Step 2 answers kept in a draft (never the emergency PIN). */
export interface EmergencyRulesDraft {
  dual: boolean;
  approver: UserSearchResult | null;
  docUnlock: boolean;
  manual: boolean;
  reason: string;
  crisis: boolean;
  highBalance: boolean;
  recipients: RecipientDraft[];
  note: string;
}

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  /** HOM-08: which Home sections show, hide balances on open. */
  CustomiseHome: undefined;
  /** TRS-02: every wallet, grouped, with drafts. */
  AllWallets: undefined;
  /** Full transaction feed (was a tab; now reached from Home → View all). */
  Activity: undefined;
  /** AI Assistant chat (hosts the in-chat secure transfer PIN flow). */
  Assistant: undefined;
  WalletDetail: { walletId: number };
  Fund: { walletId: number };
  Withdraw: { walletId: number };
  /** walletId = from; toWalletId pre-picks a wallet to move money into. */
  Transfer: { walletId?: number; toWalletId?: number } | undefined;
  RequestSpend: { walletId: number };
  /** Guided creation starts by picking the kind of wallet. */
  CreateWallet: undefined;
  /** WCR-02 → WCR-11: a goal wallet, private or shared, with people and approvals. */
  GoalWalletSetup: { draftId?: number } | undefined;
  /** WCR-12: the new wallet's account details; `invited` are first names. */
  WalletCreated: { walletId: number; invited: string[] };
  /** Type-specific setup for every type without its own journey. */
  WalletSetup: { type: CreatableWalletType; draftId?: number };
  // ---- Emergency wallet journey (Step 1 → Step 2) + management ----
  CreateEmergencyWallet: { draft?: EmergencyStepOne; draftId?: number } | undefined;
  /** sessionKey ties both steps to one draft (see lib/drafts). */
  EmergencyAccessRules: { draft: EmergencyStepOne; sessionKey: string; draftId?: number | null; rules?: EmergencyRulesDraft };
  EmergencyCenter: { walletId: number };
  /** Owner: change rules, beneficiaries and the custom PIN after setup. */
  EditEmergencyRules: { walletId: number };
  // ---- Savings goals (4-step journey) + plan management ----
  SavingsGoalSetup: { type: 'savings' | 'goal'; draftId?: number };
  SavingsPlan: { walletId: number };
  EditProfile: undefined;
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
  CreateAutomation: { fromWalletId?: number; toWalletId?: number } | undefined;
  // ---- Support & compliance ----
  Disputes: undefined;
  RaiseDispute: { reference?: string; category?: string } | undefined;
  HelpFaq: undefined;
  SecurityCenter: undefined;
  // ---- Referral & rewards ----
  Referral: undefined;
  // ---- Savings goals ----
  Goals: undefined;
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
  CreateProject: { name?: string; draftId?: number } | undefined;
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
