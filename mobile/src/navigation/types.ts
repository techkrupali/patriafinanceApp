import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { CreatableWalletType, OtpChannel, PhoneAccount, UserSearchResult } from '../api/types';

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
  /** GLW-01…05 + WCR-06/07; `addedAccountId` comes back from GIV-07. */
  GoalWalletSetup: { draftId?: number; addedAccountId?: number } | undefined;
  /** JNT-01…05 + WCR-06: a joint wallet with a partner. */
  JointWalletSetup: { draftId?: number } | undefined;
  /** CHW-01…07 + WCR-06: a child's wallet. */
  ChildWalletSetup: { draftId?: number } | undefined;
  /** PRW-01…06 + WCR-06: a project paid by milestone. */
  ProjectWalletSetup: { name?: string; draftId?: number } | undefined;
  /** WCR-12: the new wallet's account details; `invited` are first names. */
  WalletCreated: { walletId: number; invited: string[] };
  /** WCR-07 (savings, emergency): progress, then what happened — invites, rules. */
  SetupDone: {
    walletId: number;
    title: string;
    subtitle: string;
    /** Under the balance, e.g. "of ₦600,000 · locked to 25 Feb". */
    caption: string;
    events: { label: string; title: string; sub?: string }[];
    openLabel: string;
    /** Spending (WCR-07): each category, "₦0 of ₦150,000", in place of the balance card. */
    budget?: { name: string; limit: string }[];
    /** Giving (WCR-07): what goes out first, in place of the balance card. */
    payments?: { title: string; sub: string; amount: string }[];
    /** A note under the list ("The first offering comes from Main this week…"). */
    note?: string;
    /** GLW: a link to share ("Contribution link — ready to share"). */
    share?: { label: string; message: string };
    /** JNT "Waiting for Emeka": both avatars instead of the balance, Back to Treasury first, and a reminder. */
    waiting?: { initials: [string, string]; remind: { label: string; invitationId: number } | null };
    /** CHW "Kamsi's wallet is ready": the child's initials instead of the balance; Edit on the phone row gives a new code. */
    child?: { initials: string; phoneMode: 'own' | 'managed' };
  };
  /** SAV-01…06 + WCR-06: a savings wallet. */
  SavingsWalletSetup: { draftId?: number } | undefined;
  /** EMG-01…05 + WCR-06: an emergency fund. */
  EmergencyWalletSetup: { draftId?: number } | undefined;
  /** SPD-01…06 + WCR-06: a spending wallet. */
  SpendingWalletSetup: { draftId?: number } | undefined;
  /** GIV-01…06 + WCR-06: a giving wallet; `addedAccountId` comes back from GIV-07. */
  GivingWalletSetup: { draftId?: number; addedAccountId?: number } | undefined;
  /** GIV-07 "Add a recipient, save for later". */
  AddRecipient: { context?: string; returnTo: 'GivingWalletSetup' | 'GoalWalletSetup' };
  /** WAL-09 "Spending limits" of a spending wallet. */
  SpendingLimits: { walletId: number };
  /** Type-specific setup for every type without its own journey. */
  WalletSetup: { type: CreatableWalletType; draftId?: number };
  // ---- Emergency fund management ----
  EmergencyCenter: { walletId: number };
  /** Owner: change rules, beneficiaries and the custom PIN after setup. */
  EditEmergencyRules: { walletId: number };
  // ---- Savings plan management ----
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
