import type { DeepLink } from '../lib/deepLinks';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { CreatableWalletType, GoalKind, OtpChannel, PhoneAccount, UserSearchResult } from '../api/types';

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
  /** CHW-06 on the child's phone: "I have a code". */
  ChildLink: undefined;
  /** VON-01 "How will you use Patriai?" — a family or a business. */
  AccountType: undefined;
  /** ONB-03 */
  Phone: undefined;
  /** ONB-02 Get started (Patriai was used on this phone before). */
  GetStarted: undefined;
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
  /** ONB-10 terms and consent, then ONB-11 referral, which creates the account. */
  Terms: { phoneToken: string; details: SignupDetails; pin: string; biometric: boolean };
  ReferralCode: {
    phoneToken: string;
    details: SignupDetails;
    pin: string;
    biometric: boolean;
    consents: { terms: boolean; verify: boolean; steward_learn: boolean; news: boolean };
  };
  /** ONB-12 */
  WalletReady: undefined;
  /** ONB-13 */
  NextSteps: undefined;
  /** ACC-02; `phone` for Forgot PIN and the lock screen. */
  Unlock: { phoneToken: string; account: PhoneAccount; phone?: string };
  /** ACC-03 → 05: a code to the phone, the BVN (or email code) and a selfie, a new PIN. */
  ForgotPin: { phone: string };
  /** ACC-06 */
  NewDevice: { phoneToken: string; account: PhoneAccount; phone: string };
  /** ACC-07 */
  Locked: { phone: string; phoneToken: string; until: string };
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
/** CHD-03…07 the child's own app. */
export type ChildTabParamList = {
  ChildHome: undefined;
  ChildAsk: undefined;
  ChildGoal: undefined;
  ChildTasks: undefined;
};

export type ChildStackParamList = {
  ChildTabs: NavigatorScreenParams<ChildTabParamList> | undefined;
  /** CHD-05 */
  ChildRequests: undefined;
  /** CHD-08 */
  ChildTips: undefined;
  ChildNotifications: undefined;
};

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
  /** TXN-01 all transactions, or one wallet's. */
  Activity: { walletId?: number } | undefined;
  /** TXN-02 one transaction (TXN-03 receipt, TXN-04 report). */
  TransactionDetail: { id: number };
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
  /** TRS-03 */
  AddToTreasury: undefined;
  /** WCR-02 → WCR-11: a goal wallet, private or shared, with people and approvals. */
  /** GLW-01…05 + WCR-06/07; `addedAccountId` comes back from GIV-07. */
  GoalWalletSetup:
    | {
        draftId?: number;
        addedAccountId?: number;
        /** GOL-12 "Use this plan": the goal filled in, starting at its plan (GLW-03). */
        template?: { kind: GoalKind; name: string; forWhom: string; target: string; dueDate: string; lines: { name: string; amount: string }[]; link: boolean };
      }
    | undefined;
  /** JNT-01…05 + WCR-06: a joint wallet with a partner. */
  JointWalletSetup: { draftId?: number } | undefined;
  /** CHW-01…07 + WCR-06: a child's wallet. */
  ChildWalletSetup: { draftId?: number } | undefined;
  /** PRW-01…06 + WCR-06: a project paid by milestone. */
  /** vendor: VND-02 "Add to a project" → PRW-04 with this builder already chosen. */
  ProjectWalletSetup: { name?: string; draftId?: number; vendor?: { id: number; name: string } } | undefined;
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
    /** WCR-07 (Project): "Open project" goes to the project, not the wallet. */
    projectId?: number;
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
  /** WAL-16 the fund's release rules and "Release money". */
  EmergencyPolicy: { walletId: number };
  /** WAL-17 an amount, what happened, who's paid and the proof — for the keyholders. */
  EmergencyRelease: { walletId: number };
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
  /** FAM-02 "Who is in which wallet". */
  CircleView: { circleId: number | null };
  /** FAM-07 a member's profile in a circle. */
  CircleMember: { circleId: number | null; userId: number };
  /** FAM-08 "Edit role". */
  EditCircleRole: { circleId: number | null; userId: number };
  /** FAM-10 "Family activity". */
  FamilyActivity: { circleId: number | null };
  /** FAM-11 "New circle". */
  NewCircle: undefined;
  /** FAM-12 "Transfer ownership". */
  TransferCircle: { circleId: number | null };
  SpousalSync: undefined;
  // ---- Wallet governance (Audit / Lock / Automation) ----
  // ---- Me and settings (ME-03…22) ----
  /** ME-03 */
  PersonalDetails: undefined;
  /** ME-04 */
  LinkedBanks: undefined;
  /** ME-07 */
  AppLockSettings: undefined;
  /** ME-08 */
  TwoStep: undefined;
  /** ME-10 */
  LoginHistory: undefined;
  /** ME-11 */
  MyLimits: undefined;
  /** ME-12 */
  Privacy: undefined;
  /** ME-13 */
  Appearance: undefined;
  /** ME-14 (with appearance, connected apps and privacy) */
  Language: undefined;
  /** ME-15 */
  ConnectedApps: undefined;
  /** ME-17; `topic: 'fraud'` from ME-18 */
  SupportChat: { topic?: 'fraud' } | undefined;
  // ---- Money in and out (SND, BEN, ADD-07, QR) ----
  /** SND-01, maybe from a wallet's "Pay from wallet". */
  Send: { fromWalletId?: number } | undefined;
  /** REQ-01 / SPL-01: pick who to ask instead of who to pay. */
  SendRecipient: { purpose?: 'request' | 'split' } | undefined;
  SendBank: { accountNumber?: string } | undefined;
  SendAmount: undefined;
  SendFrom: undefined;
  SendNote: undefined;
  SendReview: undefined;
  SendResult: {
    outcome: 'sent' | 'approval' | 'processing' | 'failed' | 'moved';
    reference?: string;
    balance?: string;
    approvalId?: number;
    approvers?: string[];
    reason?: string;
    at?: string;
  };
  SavedAccounts: undefined;
  SavedAccountAdd: undefined;
  SavedAccountDetail: { id: number };
  SavedGroup: { id: number; pay?: boolean };
  MoveMoney: { fromWalletId?: number; toWalletId?: number } | undefined;
  /** ADD-01, to a wallet (Main by default). */
  AddMoney: { walletId?: number } | undefined;
  /** ADD-03 Pay with card (a saved card or the payment partner's page). */
  CardPay: { walletId: number; amount?: string };
  /** ADD-04 the bank's code for a card payment. */
  CardOtp: { reference: string };
  /** ADD-08 Money added / ADD-09 didn't go through (waits for the bank). */
  CardResult: { reference: string; walletId: number };
  /** ADD-05 USSD. */
  Ussd: { walletId: number };
  /** ADD-06 Cash at an agent. */
  Agents: { walletId: number };
  /** ADD-02 the wallet's account details. */
  BankTransfer: { walletId: number };
  MyQr: undefined;
  ScanQr: undefined;
  /** REQ-01 */
  RequestMoney: undefined;
  /** REQ-02 the link to share. */
  RequestSent: { code: string };
  /** REQ-03 pay all, part, or decline (or, for your own, where it stands). */
  IncomingRequest: { code: string };
  /** SND-14 repeat the payment in the send draft; `retryInHour` from SND-13. */
  SendSchedule: { retryInHour?: boolean } | undefined;
  /** SND-15 */
  ScheduledPayments: undefined;
  /** WPV-04 "Change limits" */
  ChildLimits: { walletId: number };
  /** CHD-09 "Tasks and rewards" */
  ChildTasksParent: { walletId: number };
  /** CHD-12 */
  AssignTask: { walletId: number };
  /** WPV-05 "Send a gift" / "Add to the bike": a relative into a child's wallet or goal. */
  ChildGift: { walletId: number; into: 'wallet' | 'goal' };
  /** BRK-04 */
  BreakEarly: { walletId: number };
  /** BRK-05 */
  BreakDone: { reference: string };
  /** SPL-01 a new split (maybe from a payment), or one already sent. */
  SplitBill: { key?: string; title?: string; total?: string; place?: string } | undefined;
  /** SYS-07 notifications primer, once per phone. */
  Permissions: undefined;
  /** SYS-08 "Opening Ngozi's request…" */
  DeepLink: { link: DeepLink };
  /** ME-18 */
  FreezeAccount: undefined;
  /** ME-19 */
  Legal: undefined;
  LegalDoc: { key: string };
  /** ME-20 */
  About: undefined;
  /** ME-22 */
  CloseAccount: undefined;
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
  /** WAL-15; `audit` when opened from the audit log's export; `from`/`to` from a month on INS-07. */
  WalletStatement: { walletId: number; audit?: boolean; from?: string; to?: string };
  /** HOM-05 Search Patriai. */
  Search: undefined;
  /** PLN-01 Free vs Pro. */
  Plans: { interval?: 'monthly' | 'yearly' } | undefined;
  /** PLN-02 Upgrade and pay. */
  PlanUpgrade: { plan: string; interval: 'monthly' | 'yearly' };
  /** PLN-03 Manage subscription. */
  Subscription: undefined;
  /** INS-01 Insights home. */
  Insights: undefined;
  /** INS-02 spending by category, a month ("2026-10"). */
  InsightsCategories: { month?: string } | undefined;
  /** INS-03 one wallet's report. */
  InsightsWallet: { walletId?: number } | undefined;
  /** INS-04 budget vs actual. */
  InsightsBudget: { walletId?: number } | undefined;
  /** INS-05 savings forecast. */
  InsightsForecast: undefined;
  /** INS-06 who put in what. */
  InsightsContributions: undefined;
  /** INS-07 statements by month, for a wallet or all of them. */
  Statements: { wallet?: number | 'all' } | undefined;
  /** STM-01 pick wallets and a period (dates from a month on INS-07). */
  StatementsPick: { walletIds?: number[]; from?: string; to?: string } | undefined;
  /** STM-02 the files, to download or email. */
  StatementsReady: { walletIds: number[]; period: 'last_month' | 'last_3_months' | 'this_year' | 'custom'; from?: string | null; to?: string | null; combined: boolean };
  /** INS-08 export and sync. */
  ExportSync: undefined;
  Automations: undefined;
  CreateAutomation: { fromWalletId?: number; toWalletId?: number } | undefined;
  /** AUT-02 "New rule · Start from a template". */
  RuleTemplates: undefined;
  /** AUT-03…06 the builder (a template, a sentence, or editing a rule). */
  RuleBuilder: { preset?: import('../api/rules').RuleDraft; ruleId?: number; step?: number } | undefined;
  /** AUT-07 "Describe your rule". */
  DescribeRule: undefined;
  /** AUT-08 a rule and its runs (AUT-09 in its menu). */
  RuleDetail: { ruleId: number };
  /** AUT-10 "Rules need your help". */
  RulesHelp: undefined;
  /** AUT-11 "Contribution rules". */
  ContributionRules: { walletId?: number };
  /** RUL-01 "What should it do?" */
  RuleTypes: undefined;
  /** RUL-01 "Round up and save". */
  RoundUpRule: undefined;
  /** RUL-02…06 "Split between accounts" (a scheduled payment to several). */
  SplitRule: { paymentId?: number };
  /** AIS-05 what Steward may do on its own. */
  StewardPermissions: undefined;
  /** RUL-09 "Steward auto-action". */
  StewardAutoAction: undefined;
  /** AIS-06 "What Steward did". */
  StewardLog: undefined;
  /** RUL-07 "Not enough for Sunday's payment". */
  PaymentShort: { paymentId: number };
  /** RUL-08 cancelled or skipped; RUL-04 confirm tomorrow's payment. */
  PaymentOutcome: { paymentId: number; confirm?: boolean };
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
  /** A code from a referral link (SYS-08) is filled in. */
  Referral: { code?: string } | undefined;
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
  Approvals: { scope?: 'to_me' | 'mine' | 'history' } | undefined;
  ApprovalDetail: { approvalId: number };
  /** APR-04 Decline with reason. */
  ApprovalDecline: { approvalId: number };
  /** APR-05 Ask a question. */
  ApprovalQuestion: { approvalId: number };
  /** APR-06 Outcomes. */
  ApprovalOutcome: { approvalId: number };
  /** APR-09 Away mode. */
  AwayMode: undefined;
  /** FAM-03 "Invite: choose role" — co-owner, contributor, child, keyholder, accountant or vendor. */
  InviteRole: { walletId?: number; circleId?: number | null } | undefined;
  /** FAM-04 "Invite by phone, link or QR". */
  InviteHow: { role: 'co_owner' | 'contributor' | 'keyholder' | 'accountant'; walletIds: number[]; phone?: string; dial?: string; accessUntil?: string };
  /** FAM-05 Invites you sent: Waiting / Accepted / Expired. */
  Invites: undefined;
  /** FAM-06 / INV-K1 / INV-A1 an invitation, or INV-04 when it can't open. */
  Invitation: { invitationId?: number; code?: string; decline?: boolean };
  /** INV-03 "Decline Ngozi's invite?" */
  DeclineInvite: { invitationId: number; inviter?: string };
  /** INV-K2 "Verify to become a keyholder · Tier 2 needed". */
  KeyholderVerify: { walletId: number };
  /** INV-K3 "You're a keyholder". */
  KeyholderDone: { walletId: number };
  /** INV-CH3 "Link this phone to Kamsi?" on the parent's phone. */
  ChildLinkConfirm: { requestId: number };
  /** AJO-03 a member's circle, WPV-06 the organiser's, or a circle still forming. */
  Ajo: { walletId: number };
  /** AJO-01 "New ajo circle", or "Edit rules" on one. */
  AjoSetup: { walletId?: number } | undefined;
  /** Invite people to a forming circle, or someone to take a member's place. */
  AjoInvite: { walletId: number; replaceMemberId?: number };
  /** AJO-02 payout order: set it and start, or see it and ask to swap. */
  AjoOrder: { walletId: number };
  /** AJO-04 a missed contribution. */
  AjoMissed: { walletId: number };
  /** INV-J1 "Join the circle", from an invitation or a code. */
  AjoJoin: { invitationId?: number; code?: string };
  /** TRS-03 "Join an ajo circle · With a code from the organiser". */
  AjoCode: undefined;
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
  /** MLS-01 one photo or video of a submission, full size. */
  ProofViewer: { projectId: number; milestoneId: number; index?: number };
  /** MLS-02 who has said yes, and "Remind Chidi". */
  MilestoneApprovals: { projectId: number; milestoneId: number };
  /** MLS-03 who approves each milestone. */
  ProjectApprovalSettings: { projectId: number };
  /** MLS-04 released, held back, funded, not funded. */
  MoneyByMilestone: { projectId: number };
  /** PJH-06 balance, account, who put in what. */
  ProjectWallet: { projectId: number };
  /** PJH-05 the family side and the builder's side. */
  ProjectMembers: { projectId: number };
  /** CTB-01 a funder who puts money in and approves. */
  InviteFunder: { projectId: number };
  /** CHT-01 every chat. */
  Chats: undefined;
  /** CHT-02 a direct chat or a group. */
  NewChat: undefined;
  /** CHT-04 a direct chat or group. */
  Conversation: { conversationId: number };
  /** CHT-05 a project chat's or a group's info. */
  ChatInfo: { projectId?: number; conversationId?: number };
  /** VPJ-05 a builder's proposal, for the family. */
  ProposalReview: { proposalId: number };
  /** VPJ-06 who approves, and fund the first phase. */
  ProposalFund: { proposalId: number };
  /** VPJ-01…04 the builder starts a project. */
  NewProposal: undefined;
  /** VLS-01 show a finished project on the profile. */
  ListProject: undefined;
  /** VLS-02 a finished project on a builder's profile. */
  Listing: { listingId: number };
  /** GOL-08 Pay my share. */
  PayShare: { walletId: number };
  /** GOL-09 Edit milestones. */
  GoalMilestones: { walletId: number };
  /** GOL-10 Goal reached. */
  GoalReached: { walletId: number };
  /** GOL-12 Newborn plan. */
  NewbornPlan: undefined;
  /** INV-C3 "You've joined". */
  GoalJoined: { walletId: number; how?: 'bank' | 'wallet' };
  /** INV-C1/C2 joining a goal as a contributor: a few details, then how you'll add money. */
  ContributorJoin: { invitationId: number };
  /** WAL-19 Joint wallet rules: propose a change, approve the other's. */
  JointRules: { walletId: number };
  /** JNT-05 from WPV-03 Leave: notice to leave and closing with both PINs. */
  JointLeave: { walletId: number };
  /** INV-O3 "Your joint wallet is open". */
  JointOpen: { walletId: number };
  /** VND-03 "Find a vendor" with Steward, over the directory. */
  FindVendorSteward: { category: string; near?: string; projectId?: number };
  /** CTB-02 a funder (who may approve) is invited to a project. */
  FunderInvite: { invitationId: number };
  /** VDM-13 the builder's money on one project. */
  VendorProjectFunds: { projectId: number };
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
