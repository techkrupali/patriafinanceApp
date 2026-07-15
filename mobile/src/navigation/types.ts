import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Otp: { identifier: string; purpose: 'verify' | 'login'; sentTo?: string; debugOtp?: string };
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Wallets: undefined;
  AI: undefined;
  Activity: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  WalletDetail: { walletId: number };
  Fund: { walletId: number };
  Withdraw: { walletId: number };
  Transfer: { walletId?: number } | undefined;
  CreateWallet: undefined;
  ChangePassword: undefined;
  ChangePin: undefined;
  Devices: undefined;
  // ---- Collaboration & governance (Milestone 3) ----
  InviteMember: { walletId: number };
  WalletSettings: { walletId: number };
  Approvals: { scope?: 'to_me' | 'mine' } | undefined;
  ApprovalDetail: { approvalId: number };
  Notifications: undefined;
  Invitations: undefined;
  // ---- Loans (Milestone 4 — Patria Lending) ----
  Loans: undefined;
  LoanApply: undefined;
  LoanDetail: { loanId: number };
  Repay: { loanId: number };
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
