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
  /** VON-01 "How will you use Patriai?" — a family or a business. */
  AccountType: undefined;
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
  /** `ask`: a question to put to Steward straight away (VND-03 "Find a tiler near Nsukka"). */
  Steward: { ask?: string } | undefined;
  Treasury: undefined;
  Rules: undefined;
  More: undefined;
};

/** VDM-03…08 vendor mode: Projects · Payouts · Disputes · Profile. */
export type VendorTabParamList = {
  VendorHome: undefined;
  VendorPayouts: undefined;
  VendorDisputes: undefined;
  VendorProfileTab: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  /** Vendor mode, for a business and its team. */
  VendorTabs: NavigatorScreenParams<VendorTabParamList> | undefined;
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
  /** WAL-14 */
  WalletAuditLog: { walletId: number };
  /** Spending hours: when money may go out (from WAL-06). */
  WalletLock: { walletId: number };
  // ---- Wallets · Manage (WAL-03…15) ----
  /** WAL-03 */
  WalletActivity: { walletId: number };
  /** WAL-04 */
  WalletMembers: { walletId: number };
  /** WAL-05 */
  WalletAccount: { walletId: number };
  /** WAL-06 "Name, colour and goal". */
  WalletBasics: { walletId: number };
  /** WAL-07 */
  MemberPermissions: { walletId: number; memberId: number };
  /** WAL-08 (and the wallet's money rules). */
  ApprovalRules: { walletId: number };
  /** WAL-10 */
  LockWallet: { walletId: number };
  /** WAL-11 */
  AskToUnlock: { walletId: number };
  /** WAL-13 */
  CloseWallet: { walletId: number };
  /** WAL-15; `audit` when opened from the audit log's export. */
  WalletStatement: { walletId: number; audit?: boolean };
  Automations: undefined;
  CreateAutomation: { fromWalletId?: number; toWalletId?: number } | undefined;
  // ---- Support & compliance ----
  /** DSP-01 */
  Disputes: undefined;
  /** DSP-02…04, from a milestone ("Something isn't right") or from scratch. */
  StartDispute: { milestoneId?: number } | undefined;
  /** DSP-05, or DSP-09 once closed. */
  DisputeDetail: { disputeId: number };
  /** DSP-06 */
  DisputeChat: { disputeId: number };
  /** DSP-07 the builder's answer. */
  DisputeRespond: { disputeId: number };
  /** DSP-08 */
  EscalateDispute: { disputeId: number };
  HelpFaq: undefined;
  SecurityCenter: undefined;
  // ---- Referral & rewards ----
  Referral: undefined;
  // ---- Savings goals ----
  Goals: undefined;
  // ---- Vendor discovery ----
  /** VND-01; from a project it can add the vendor to it. */
  VendorDirectory: { projectId?: number; near?: string; category?: string } | undefined;
  /** VND-02 */
  VendorProfile: { profileId: number; projectId?: number };
  /** VND-04 */
  RateVendor: { profileId: number; name: string; milestoneId?: number; milestoneTitle?: string; projectId?: number; town?: string };
  // ---- Business account (VDM-01, VON-02…10) ----
  BusinessSetup: { step?: number } | undefined;
  BusinessVerification: undefined;
  // ---- Vendor mode (VDM-04…11, INV-V1…V5, INV-VT1) ----
  VendorProject: { projectId: number };
  SubmitWork: { projectId: number; milestoneId: number };
  ProposeMilestone: { projectId: number; milestoneId?: number };
  VendorTeam: undefined;
  InviteTeam: undefined;
  TeamInvite: { memberId: number };
  ProjectInvite: { projectId: number };
  InviteMilestones: { projectId: number };
  AskChange: { projectId: number; milestoneId: number };
  ChangesSent: { projectId: number };
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
  /** PRJ-01 */
  Projects: undefined;
  /** PRJ-03 (PRJ-12 when the builder declined). */
  ProjectDetail: { projectId: number };
  /** PRJ-04 */
  Milestones: { projectId: number };
  /** PRJ-05; without a milestone it adds one. */
  EditMilestone: { projectId: number; milestoneId?: number };
  /** PRJ-06 */
  ReviewMilestone: { projectId: number; milestoneId: number };
  /** PRJ-07 */
  ReleasePayment: { projectId: number; milestoneId: number };
  /** PRJ-09 */
  ProjectDocuments: { projectId: number };
  /** PRJ-10 */
  ProjectBudget: { projectId: number };
  /** PRJ-11 */
  ApproveProposal: { projectId: number; milestoneId: number };
  /** The project chat. */
  ProjectChat: { projectId: number };
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

export type VendorTabScreenProps<T extends keyof VendorTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<VendorTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
