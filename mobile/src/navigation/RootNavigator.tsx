import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/auth';
import { useAppLock } from '../store/appLock';
import { pt, ptFont } from '../theme';
import { AppLock } from '../components/AppLock';
import type { AuthStackParamList, ChildStackParamList, ChildTabParamList, MainTabParamList, RootStackParamList, VendorTabParamList } from './types';

// Auth screens (client prototype onboarding + log in)
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { AccountTypeScreen } from '../screens/auth/AccountTypeScreen';
import { PhoneScreen } from '../screens/auth/PhoneScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { CodeScreen } from '../screens/auth/CodeScreen';
import { DetailsScreen } from '../screens/auth/DetailsScreen';
import { CreatePinScreen } from '../screens/auth/CreatePinScreen';
import { PurposeScreen } from '../screens/auth/PurposeScreen';
import { WalletReadyScreen } from '../screens/auth/WalletReadyScreen';
import { UnlockScreen } from '../screens/auth/UnlockScreen';
import { ForgotPinScreen } from '../screens/auth/ForgotPinScreen';
import { GetStartedScreen } from '../screens/auth/GetStartedScreen';
import { PermissionsScreen } from '../screens/system/PermissionsScreen';
import { SendScreen } from '../screens/send/SendScreen';
import { SendRecipientScreen } from '../screens/send/SendRecipientScreen';
import { SendBankScreen } from '../screens/send/SendBankScreen';
import { SendAmountScreen } from '../screens/send/SendAmountScreen';
import { SendFromScreen } from '../screens/send/SendFromScreen';
import { SendNoteScreen } from '../screens/send/SendNoteScreen';
import { SendReviewScreen } from '../screens/send/SendReviewScreen';
import { SendResultScreen } from '../screens/send/SendResultScreen';
import { SavedAccountsScreen } from '../screens/send/SavedAccountsScreen';
import { SavedAccountAddScreen } from '../screens/send/SavedAccountAddScreen';
import { SavedAccountDetailScreen } from '../screens/send/SavedAccountDetailScreen';
import { SavedGroupScreen } from '../screens/send/SavedGroupScreen';
import { MoveMoneyScreen } from '../screens/send/MoveMoneyScreen';
import { MyQrScreen } from '../screens/send/MyQrScreen';
import { ScanQrScreen } from '../screens/send/ScanQrScreen';
import { RequestMoneyScreen } from '../screens/request/RequestMoneyScreen';
import { RequestSentScreen } from '../screens/request/RequestSentScreen';
import { IncomingRequestScreen } from '../screens/request/IncomingRequestScreen';
import { SplitBillScreen } from '../screens/request/SplitBillScreen';
import { SendScheduleScreen } from '../screens/send/SendScheduleScreen';
import { AddToTreasuryScreen } from '../screens/AddToTreasuryScreen';
import { BreakEarlyScreen } from '../screens/savings/BreakEarlyScreen';
import { BreakDoneScreen } from '../screens/savings/BreakDoneScreen';
import { ScheduledPaymentsScreen } from '../screens/send/ScheduledPaymentsScreen';
import { AddMoneyScreen } from '../screens/send/AddMoneyScreen';
import { BankTransferScreen } from '../screens/send/BankTransferScreen';
import { TransactionsScreen } from '../screens/send/TransactionsScreen';
import { TransactionDetailScreen } from '../screens/send/TransactionDetailScreen';
import { DeepLinkScreen } from '../screens/system/DeepLinkScreen';
import { useSystem } from '../store/system';
import { TermsScreen } from '../screens/auth/TermsScreen';
import { ReferralCodeScreen } from '../screens/auth/ReferralCodeScreen';
import { NextStepsScreen } from '../screens/auth/NextStepsScreen';
import { NewDeviceScreen } from '../screens/auth/NewDeviceScreen';
import { LockedScreen } from '../screens/auth/LockedScreen';

// Tab screens
import { HomeScreen } from '../screens/HomeScreen';
import { WalletsScreen } from '../screens/WalletsScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

// Stack screens
import { WalletDetailScreen } from '../screens/wallet/WalletDetailScreen';
import { FundScreen } from '../screens/wallet/FundScreen';
import { WithdrawScreen } from '../screens/wallet/WithdrawScreen';
import { TransferScreen } from '../screens/wallet/TransferScreen';
import { RequestSpendScreen } from '../screens/wallet/RequestSpendScreen';
import { CreateWalletScreen } from '../screens/wallet/CreateWalletScreen';
import { WalletSetupScreen } from '../screens/wallet/WalletSetupScreen';
import { GoalWalletSetupScreen } from '../screens/wallet/GoalWalletSetupScreen';
import { JointWalletSetupScreen } from '../screens/wallet/JointWalletSetupScreen';
import { ChildWalletSetupScreen } from '../screens/wallet/ChildWalletSetupScreen';
import { ProjectWalletSetupScreen } from '../screens/wallet/ProjectWalletSetupScreen';
import { WalletCreatedScreen } from '../screens/wallet/WalletCreatedScreen';
import { SetupDoneScreen } from '../screens/wallet/SetupDoneScreen';
import { SavingsWalletSetupScreen } from '../screens/wallet/SavingsWalletSetupScreen';
import { EmergencyWalletSetupScreen } from '../screens/wallet/EmergencyWalletSetupScreen';
import { SpendingWalletSetupScreen } from '../screens/wallet/SpendingWalletSetupScreen';
import { SpendingLimitsScreen } from '../screens/wallet/SpendingLimitsScreen';
import { GivingWalletSetupScreen } from '../screens/giving/GivingWalletSetupScreen';
import { AddRecipientScreen } from '../screens/giving/AddRecipientScreen';
import { EmergencyCenterScreen } from '../screens/wallet/emergency/EmergencyCenterScreen';
import { EditEmergencyRulesScreen } from '../screens/wallet/emergency/EditEmergencyRulesScreen';
import { EmergencyPolicyScreen } from '../screens/wallet/emergency/EmergencyPolicyScreen';
import { EmergencyReleaseScreen } from '../screens/wallet/emergency/EmergencyReleaseScreen';
import { SavingsPlanScreen } from '../screens/goals/SavingsPlanScreen';
import { InviteMemberScreen } from '../screens/wallet/InviteMemberScreen';
import { WalletSettingsScreen } from '../screens/wallet/WalletSettingsScreen';
import { AssignAccessScreen } from '../screens/wallet/AssignAccessScreen';
import { WalletAuditLogScreen } from '../screens/wallet/WalletAuditLogScreen';
import { WalletLockScreen } from '../screens/wallet/WalletLockScreen';
import { WalletActivityScreen } from '../screens/wallet/WalletActivityScreen';
import { WalletMembersScreen } from '../screens/wallet/WalletMembersScreen';
import { WalletAccountScreen } from '../screens/wallet/WalletAccountScreen';
import { WalletBasicsScreen } from '../screens/wallet/WalletBasicsScreen';
import { MemberPermissionsScreen } from '../screens/wallet/MemberPermissionsScreen';
import { ApprovalRulesScreen } from '../screens/wallet/ApprovalRulesScreen';
import { LockWalletScreen } from '../screens/wallet/LockWalletScreen';
import { AskToUnlockScreen } from '../screens/wallet/AskToUnlockScreen';
import { CloseWalletScreen } from '../screens/wallet/CloseWalletScreen';
import { WalletStatementScreen } from '../screens/wallet/WalletStatementScreen';
import { PersonalDetailsScreen } from '../screens/me/PersonalDetailsScreen';
import { LinkedBanksScreen } from '../screens/me/LinkedBanksScreen';
import { AppLockScreen } from '../screens/me/AppLockScreen';
import { TwoStepScreen } from '../screens/me/TwoStepScreen';
import { LoginHistoryScreen } from '../screens/me/LoginHistoryScreen';
import { MyLimitsScreen } from '../screens/me/MyLimitsScreen';
import { PrivacyScreen } from '../screens/me/PrivacyScreen';
import { AppearanceScreen } from '../screens/me/AppearanceScreen';
import { LanguageScreen } from '../screens/me/LanguageScreen';
import { ConnectedAppsScreen } from '../screens/me/ConnectedAppsScreen';
import { SupportChatScreen } from '../screens/me/SupportChatScreen';
import { FreezeAccountScreen } from '../screens/me/FreezeAccountScreen';
import { LegalDocScreen, LegalScreen } from '../screens/me/LegalScreen';
import { AboutScreen } from '../screens/me/AboutScreen';
import { CloseAccountScreen } from '../screens/me/CloseAccountScreen';
import { FamilyHubScreen } from '../screens/family/FamilyHubScreen';
import { FamilyMemberScreen } from '../screens/family/FamilyMemberScreen';
import { SpousalSyncScreen } from '../screens/family/SpousalSyncScreen';
import { AutomationsScreen } from '../screens/automation/AutomationsScreen';
import { CreateAutomationScreen } from '../screens/automation/CreateAutomationScreen';
import { DisputesScreen } from '../screens/disputes/DisputesScreen';
import { StartDisputeScreen } from '../screens/disputes/StartDisputeScreen';
import { DisputeDetailScreen } from '../screens/disputes/DisputeDetailScreen';
import { DisputeChatScreen } from '../screens/disputes/DisputeChatScreen';
import { DisputeRespondScreen } from '../screens/disputes/DisputeRespondScreen';
import { EscalateDisputeScreen } from '../screens/disputes/EscalateDisputeScreen';
import { HelpFaqScreen } from '../screens/support/HelpFaqScreen';
import { SecurityCenterScreen } from '../screens/support/SecurityCenterScreen';
import { ReferralScreen } from '../screens/referral/ReferralScreen';
import { GoalsScreen } from '../screens/goals/GoalsScreen';
import { VendorDirectoryScreen } from '../screens/vendors/VendorDirectoryScreen';
import { VendorProfileScreen } from '../screens/vendors/VendorProfileScreen';
import { RateVendorScreen } from '../screens/vendors/RateVendorScreen';
import { BusinessSetupScreen } from '../screens/business/BusinessSetupScreen';
import { BusinessVerificationScreen } from '../screens/business/BusinessVerificationScreen';
import { VendorHomeScreen } from '../screens/vendor/VendorHomeScreen';
import { VendorPayoutsScreen } from '../screens/vendor/VendorPayoutsScreen';
import { VendorDisputesScreen } from '../screens/vendor/VendorDisputesScreen';
import { VendorPublicProfileScreen } from '../screens/vendor/VendorPublicProfileScreen';
import { VendorProjectScreen } from '../screens/vendor/VendorProjectScreen';
import { SubmitWorkScreen } from '../screens/vendor/SubmitWorkScreen';
import { ProposeMilestoneScreen } from '../screens/vendor/ProposeMilestoneScreen';
import { InviteTeamScreen, VendorTeamScreen } from '../screens/vendor/VendorTeamScreen';
import { TeamInviteScreen } from '../screens/vendor/TeamInviteScreen';
import { ProjectInviteScreen } from '../screens/vendor/ProjectInviteScreen';
import { AskChangeScreen, ChangesSentScreen, InviteMilestonesScreen } from '../screens/vendor/InviteMilestonesScreen';
import { ApprovalsScreen } from '../screens/governance/ApprovalsScreen';
import { ApprovalDetailScreen } from '../screens/governance/ApprovalDetailScreen';
import { NotificationsScreen } from '../screens/governance/NotificationsScreen';
import { InvitationsScreen } from '../screens/governance/InvitationsScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { ChangePinScreen } from '../screens/profile/ChangePinScreen';
import { DevicesScreen } from '../screens/profile/DevicesScreen';
import { LoansScreen } from '../screens/loans/LoansScreen';
import { LoanApplyScreen } from '../screens/loans/LoanApplyScreen';
import { LoanDetailScreen } from '../screens/loans/LoanDetailScreen';
import { RepayScreen } from '../screens/loans/RepayScreen';
import { ProjectsScreen } from '../screens/projects/ProjectsScreen';
import { ProjectDetailScreen } from '../screens/projects/ProjectDetailScreen';
import { MilestonesScreen } from '../screens/projects/MilestonesScreen';
import { EditMilestoneScreen } from '../screens/projects/EditMilestoneScreen';
import { ReviewMilestoneScreen } from '../screens/projects/ReviewMilestoneScreen';
import { ReleasePaymentScreen } from '../screens/projects/ReleasePaymentScreen';
import { ProofViewerScreen } from '../screens/projects/ProofViewerScreen';
import { MilestoneApprovalsScreen } from '../screens/projects/MilestoneApprovalsScreen';
import { ProjectApprovalSettingsScreen } from '../screens/projects/ProjectApprovalSettingsScreen';
import { MoneyByMilestoneScreen } from '../screens/projects/MoneyByMilestoneScreen';
import { ProjectWalletScreen } from '../screens/projects/ProjectWalletScreen';
import { ProjectMembersScreen } from '../screens/projects/ProjectMembersScreen';
import { InviteFunderScreen } from '../screens/projects/InviteFunderScreen';
import { VendorProjectFundsScreen } from '../screens/vendor/VendorProjectFundsScreen';
import { FunderInviteScreen } from '../screens/projects/FunderInviteScreen';
import { ChatsScreen } from '../screens/chats/ChatsScreen';
import { NewChatScreen } from '../screens/chats/NewChatScreen';
import { ConversationScreen } from '../screens/chats/ConversationScreen';
import { ChatInfoScreen } from '../screens/chats/ChatInfoScreen';
import { ProposalReviewScreen } from '../screens/projects/ProposalReviewScreen';
import { ProposalFundScreen } from '../screens/projects/ProposalFundScreen';
import { NewProposalScreen } from '../screens/vendor/NewProposalScreen';
import { ListProjectScreen } from '../screens/vendor/ListProjectScreen';
import { ListingScreen } from '../screens/vendors/ListingScreen';
import { FindVendorStewardScreen } from '../screens/vendors/FindVendorStewardScreen';
import { ProjectDocumentsScreen } from '../screens/projects/ProjectDocumentsScreen';
import { ProjectBudgetScreen } from '../screens/projects/ProjectBudgetScreen';
import { ApproveProposalScreen } from '../screens/projects/ApproveProposalScreen';
import { ProjectChatScreen } from '../screens/projects/ProjectChatScreen';
import { KycScreen } from '../screens/kyc/KycScreen';
import { KycSubmitScreen } from '../screens/kyc/KycSubmitScreen';
import { StewardScreen } from '../screens/steward/StewardScreen';
import { CustomiseHomeScreen } from '../screens/CustomiseHomeScreen';
import { AllWalletsScreen } from '../screens/AllWalletsScreen';
import { ChildLinkScreen } from '../screens/child/ChildLinkScreen';
import { ChildHomeScreen } from '../screens/child/ChildHomeScreen';
import { ChildAskScreen } from '../screens/child/ChildAskScreen';
import { ChildGoalScreen } from '../screens/child/ChildGoalScreen';
import { ChildTasksScreen } from '../screens/child/ChildTasksScreen';
import { ChildRequestsScreen } from '../screens/child/ChildRequestsScreen';
import { ChildTipsScreen } from '../screens/child/ChildTipsScreen';
import { ChildNotificationsScreen } from '../screens/child/ChildNotificationsScreen';
import { ChildLimitsScreen } from '../screens/child/ChildLimitsScreen';
import { ChildTasksParentScreen } from '../screens/child/ChildTasksParentScreen';
import { AssignTaskScreen } from '../screens/child/AssignTaskScreen';
import { ChildGiftScreen } from '../screens/child/ChildGiftScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const VendorTabNav = createBottomTabNavigator<VendorTabParamList>();
const ChildTabNav = createBottomTabNavigator<ChildTabParamList>();
const ChildStack = createNativeStackNavigator<ChildStackParamList>();

/**
 * Client footer (prototype tab bar): six tabs — Home · Family · Steward ·
 * Treasury · Rules · More. White bar with 24pt top corners and a soft shadow;
 * the active tab gets a brand-soft pill behind its icon and a bold brand label.
 */
const TAB_ICONS: Record<keyof MainTabParamList, (color: string) => React.ReactNode> = {
  Home: (c) => <Feather name="home" size={22} color={c} />,
  Family: (c) => <Feather name="users" size={22} color={c} />,
  Steward: (c) => <MaterialCommunityIcons name="shield-account-outline" size={23} color={c} />,
  Treasury: (c) => <MaterialCommunityIcons name="bank-outline" size={23} color={c} />,
  Rules: (c) => <Feather name="sliders" size={21} color={c} />,
  More: (c) => <Feather name="menu" size={22} color={c} />,
};

// Existing screen re-hosted as a tab (its inner navigation calls still work
// through the composite navigator; it takes no route params).
const FamilyTab = (props: Record<string, unknown>) => (
  <FamilyHubScreen {...(props as unknown as React.ComponentProps<typeof FamilyHubScreen>)} />
);
const RulesTab = (props: Record<string, unknown>) => (
  <AutomationsScreen {...(props as unknown as React.ComponentProps<typeof AutomationsScreen>)} />
);

/**
 * The client footer: white bar with 24pt top corners and a soft shadow; the
 * active tab gets a brand-soft pill behind its icon and a bold brand label.
 * Shared by the family tabs and vendor mode.
 */
function tabBarOptions(bottomInset: number, label: string, icon: (color: string) => React.ReactNode) {
  return {
    headerShown: false,
    // Default tab button uses RN Pressable, which doesn't fire onPress inside
    // native-stack on physical Android + New Arch. Use the RNGH Pressable.
    tabBarButton: (props: BottomTabBarButtonProps) => (
      <GHPressable
        onPress={props.onPress as never}
        onLongPress={(props.onLongPress ?? undefined) as never}
        disabled={props.disabled ?? undefined}
        accessibilityRole="button"
        accessibilityState={props.accessibilityState}
        android_ripple={{ color: 'transparent', borderless: false }}
        style={props.style as object}
      >
        {props.children}
      </GHPressable>
    ),
    // The Steward composer sits where the bar was while typing.
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: pt.brand,
    tabBarInactiveTintColor: pt.inkMuted,
    tabBarLabel: ({ focused, color }: { focused: boolean; color: string }) => (
      <Text style={{ fontFamily: focused ? ptFont.bold : ptFont.semibold, fontSize: 11, lineHeight: 14, color, marginTop: 3 }}>{label}</Text>
    ),
    tabBarItemStyle: { paddingTop: 8 },
    tabBarStyle: {
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0,
      height: 64 + Math.max(bottomInset, 12),
      paddingBottom: Math.max(bottomInset, 12),
      paddingHorizontal: 4,
    },
    tabBarBackground: () => (
      <View
        style={{
          flex: 1,
          backgroundColor: pt.raised,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          shadowColor: pt.emerald900,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 20,
          elevation: 12,
        }}
      />
    ),
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => (
      <View style={{ width: 52, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? pt.brandSoft : 'transparent' }}>
        {icon(color)}
      </View>
    ),
  };
}

const VENDOR_TABS: Record<keyof VendorTabParamList, { label: string; icon: (color: string) => React.ReactNode }> = {
  VendorHome: { label: 'Projects', icon: (c) => <Feather name="home" size={21} color={c} /> },
  VendorPayouts: { label: 'Payouts', icon: (c) => <MaterialCommunityIcons name="bank-outline" size={22} color={c} /> },
  VendorDisputes: { label: 'Disputes', icon: (c) => <Feather name="alert-triangle" size={21} color={c} /> },
  VendorProfileTab: { label: 'Profile', icon: (c) => <Feather name="user" size={21} color={c} /> },
};

const CHILD_TABS: Record<keyof ChildTabParamList, { label: string; icon: (color: string) => React.ReactNode }> = {
  ChildHome: { label: 'Home', icon: (c) => <Feather name="home" size={21} color={c} /> },
  ChildAsk: { label: 'Ask', icon: (c) => <Feather name="message-square" size={21} color={c} /> },
  ChildGoal: { label: 'My goal', icon: (c) => <Feather name="target" size={21} color={c} /> },
  ChildTasks: { label: 'Tasks', icon: (c) => <Feather name="star" size={21} color={c} /> },
};

/** CHD-03…07 the child's own app: Home · Ask · My goal · Tasks. */
function ChildTabs() {
  const insets = useSafeAreaInsets();
  return (
    <ChildTabNav.Navigator screenOptions={({ route }) => tabBarOptions(insets.bottom, CHILD_TABS[route.name].label, CHILD_TABS[route.name].icon)}>
      <ChildTabNav.Screen name="ChildHome" component={ChildHomeScreen} />
      <ChildTabNav.Screen name="ChildAsk" component={ChildAskScreen} />
      <ChildTabNav.Screen name="ChildGoal" component={ChildGoalScreen} />
      <ChildTabNav.Screen name="ChildTasks" component={ChildTasksScreen} />
    </ChildTabNav.Navigator>
  );
}

/** VDM-03…08 vendor mode: Projects · Payouts · Disputes · Profile. */
function VendorTabs() {
  const insets = useSafeAreaInsets();
  return (
    <VendorTabNav.Navigator screenOptions={({ route }) => tabBarOptions(insets.bottom, VENDOR_TABS[route.name].label, VENDOR_TABS[route.name].icon)}>
      <VendorTabNav.Screen name="VendorHome" component={VendorHomeScreen} />
      <VendorTabNav.Screen name="VendorPayouts" component={VendorPayoutsScreen} />
      <VendorTabNav.Screen name="VendorDisputes" component={VendorDisputesScreen} />
      <VendorTabNav.Screen name="VendorProfileTab" component={VendorPublicProfileScreen} />
    </VendorTabNav.Navigator>
  );
}

function MainTabs({ navigation }: NativeStackScreenProps<RootStackParamList, 'Tabs'>) {
  const insets = useSafeAreaInsets();
  const postAuthRoute = useAuth((s) => s.postAuthRoute);
  const clearPostAuthRoute = useAuth((s) => s.clearPostAuthRoute);

  // A next step picked at the end of onboarding (or "I have an invite") opens on top of Home.
  useEffect(() => {
    if (!postAuthRoute) return;
    clearPostAuthRoute();
    navigation.navigate(postAuthRoute);
  }, [postAuthRoute, clearPostAuthRoute, navigation]);

  return (
    <Tabs.Navigator screenOptions={({ route }) => tabBarOptions(insets.bottom, route.name, TAB_ICONS[route.name])}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Family" component={FamilyTab} />
      <Tabs.Screen name="Steward" component={StewardScreen} />
      <Tabs.Screen name="Treasury" component={WalletsScreen} />
      <Tabs.Screen name="Rules" component={RulesTab} />
      <Tabs.Screen name="More" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const status = useAuth((s) => s.status);
  const hasStoredSession = useAuth((s) => s.hasStoredSession);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const mode = useAuth((s) => s.mode);
  const returning = useAuth((s) => s.returning);
  const supportOnly = useSystem((s) => s.supportOnly);
  const isChild = useAuth((s) => s.user?.role === 'child');
  // ME-13 "Reduce motion": screens change without sliding.
  const reduceMotion = useAppLock((s) => s.reduceMotion);
  const [bypassLock, setBypassLock] = useState(false);

  if (status !== 'authed') {
    // A persisted session locked behind biometrics -> present the unlock screen.
    if (hasStoredSession && biometricEnabled && !bypassLock) {
      return <AppLock onUsePassword={() => setBypassLock(true)} />;
    }
    return (
      // The first screen listed is also where the stack falls back to when it replaces the
      // signed-in stack after a log out, so a returning person's ONB-02 goes first.
      <AuthStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={returning ? 'GetStarted' : 'Welcome'}>
        {returning ? <AuthStack.Screen name="GetStarted" component={GetStartedScreen} /> : null}
        <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
        <AuthStack.Screen name="ChildLink" component={ChildLinkScreen} />
        <AuthStack.Screen name="AccountType" component={AccountTypeScreen} />
        <AuthStack.Screen name="Phone" component={PhoneScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Code" component={CodeScreen} />
        <AuthStack.Screen name="Details" component={DetailsScreen} />
        <AuthStack.Screen name="CreatePin" component={CreatePinScreen} />
        <AuthStack.Screen name="Purpose" component={PurposeScreen} options={{ gestureEnabled: false }} />
        <AuthStack.Screen name="WalletReady" component={WalletReadyScreen} options={{ gestureEnabled: false }} />
        <AuthStack.Screen name="Unlock" component={UnlockScreen} />
        <AuthStack.Screen name="ForgotPin" component={ForgotPinScreen} />
        {returning ? null : <AuthStack.Screen name="GetStarted" component={GetStartedScreen} />}
        <AuthStack.Screen name="Terms" component={TermsScreen} />
        <AuthStack.Screen name="ReferralCode" component={ReferralCodeScreen} />
        <AuthStack.Screen name="NextSteps" component={NextStepsScreen} options={{ gestureEnabled: false }} />
        <AuthStack.Screen name="NewDevice" component={NewDeviceScreen} />
        <AuthStack.Screen name="Locked" component={LockedScreen} options={{ gestureEnabled: false }} />
      </AuthStack.Navigator>
    );
  }

  // CHW-06: a child's own phone gets the child's app, nothing else.
  if (isChild) {
    return (
      <ChildStack.Navigator screenOptions={{ headerShown: false }}>
        <ChildStack.Screen name="ChildTabs" component={ChildTabs} />
        <ChildStack.Screen name="ChildRequests" component={ChildRequestsScreen} />
        <ChildStack.Screen name="ChildTips" component={ChildTipsScreen} />
        <ChildStack.Screen name="ChildNotifications" component={ChildNotificationsScreen} />
      </ChildStack.Navigator>
    );
  }

  // SYS-06 "Contact support": just the chat, away from the screen that failed.
  if (supportOnly) {
    return (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="SupportChat" component={SupportChatScreen} initialParams={{}} />
      </RootStack.Navigator>
    );
  }

  return (
    // The app opens in the mode last used on this phone (VDM-03 vendor mode, or the family app).
    <RootStack.Navigator screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default' }} initialRouteName={mode === 'business' ? 'VendorTabs' : 'Tabs'}>
      <RootStack.Screen name="Tabs" component={MainTabs} />
      <RootStack.Screen name="VendorTabs" component={VendorTabs} />
      <RootStack.Screen name="CustomiseHome" component={CustomiseHomeScreen} />
      <RootStack.Screen name="AllWallets" component={AllWalletsScreen} />
      <RootStack.Screen name="Activity" component={TransactionsScreen} />
      <RootStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <RootStack.Screen name="Assistant" component={AssistantScreen} />
      <RootStack.Screen name="WalletDetail" component={WalletDetailScreen} />
      <RootStack.Screen name="Fund" component={FundScreen} />
      <RootStack.Screen name="Withdraw" component={WithdrawScreen} />
      <RootStack.Screen name="Transfer" component={TransferScreen} />
      <RootStack.Screen name="RequestSpend" component={RequestSpendScreen} />
      <RootStack.Screen name="CreateWallet" component={CreateWalletScreen} />
      <RootStack.Screen name="WalletSetup" component={WalletSetupScreen} />
      <RootStack.Screen name="GoalWalletSetup" component={GoalWalletSetupScreen} />
      <RootStack.Screen name="JointWalletSetup" component={JointWalletSetupScreen} />
      <RootStack.Screen name="ChildWalletSetup" component={ChildWalletSetupScreen} />
      <RootStack.Screen name="ProjectWalletSetup" component={ProjectWalletSetupScreen} />
      <RootStack.Screen name="WalletCreated" component={WalletCreatedScreen} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="SetupDone" component={SetupDoneScreen} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="SavingsWalletSetup" component={SavingsWalletSetupScreen} />
      <RootStack.Screen name="EmergencyWalletSetup" component={EmergencyWalletSetupScreen} />
      <RootStack.Screen name="SpendingWalletSetup" component={SpendingWalletSetupScreen} />
      <RootStack.Screen name="GivingWalletSetup" component={GivingWalletSetupScreen} />
      <RootStack.Screen name="AddRecipient" component={AddRecipientScreen} />
      <RootStack.Screen name="SpendingLimits" component={SpendingLimitsScreen} />
      <RootStack.Screen name="EmergencyCenter" component={EmergencyCenterScreen} />
      <RootStack.Screen name="EditEmergencyRules" component={EditEmergencyRulesScreen} />
      <RootStack.Screen name="EmergencyPolicy" component={EmergencyPolicyScreen} />
      <RootStack.Screen name="EmergencyRelease" component={EmergencyReleaseScreen} />
      <RootStack.Screen name="SavingsPlan" component={SavingsPlanScreen} />
      <RootStack.Screen name="InviteMember" component={InviteMemberScreen} />
      <RootStack.Screen name="WalletSettings" component={WalletSettingsScreen} />
      <RootStack.Screen name="AssignAccess" component={AssignAccessScreen} />
      <RootStack.Screen name="WalletAuditLog" component={WalletAuditLogScreen} />
      <RootStack.Screen name="WalletLock" component={WalletLockScreen} />
      <RootStack.Screen name="WalletActivity" component={WalletActivityScreen} />
      <RootStack.Screen name="WalletMembers" component={WalletMembersScreen} />
      <RootStack.Screen name="WalletAccount" component={WalletAccountScreen} />
      <RootStack.Screen name="WalletBasics" component={WalletBasicsScreen} />
      <RootStack.Screen name="MemberPermissions" component={MemberPermissionsScreen} />
      <RootStack.Screen name="ApprovalRules" component={ApprovalRulesScreen} />
      <RootStack.Screen name="LockWallet" component={LockWalletScreen} />
      <RootStack.Screen name="AskToUnlock" component={AskToUnlockScreen} />
      <RootStack.Screen name="CloseWallet" component={CloseWalletScreen} />
      <RootStack.Screen name="WalletStatement" component={WalletStatementScreen} />
      <RootStack.Screen name="PersonalDetails" component={PersonalDetailsScreen} />
      <RootStack.Screen name="LinkedBanks" component={LinkedBanksScreen} />
      <RootStack.Screen name="AppLockSettings" component={AppLockScreen} />
      <RootStack.Screen name="TwoStep" component={TwoStepScreen} />
      <RootStack.Screen name="LoginHistory" component={LoginHistoryScreen} />
      <RootStack.Screen name="MyLimits" component={MyLimitsScreen} />
      <RootStack.Screen name="Privacy" component={PrivacyScreen} />
      <RootStack.Screen name="Appearance" component={AppearanceScreen} />
      <RootStack.Screen name="Language" component={LanguageScreen} />
      <RootStack.Screen name="ConnectedApps" component={ConnectedAppsScreen} />
      <RootStack.Screen name="Send" component={SendScreen} />
      <RootStack.Screen name="SendRecipient" component={SendRecipientScreen} />
      <RootStack.Screen name="SendBank" component={SendBankScreen} />
      <RootStack.Screen name="SendAmount" component={SendAmountScreen} />
      <RootStack.Screen name="SendFrom" component={SendFromScreen} />
      <RootStack.Screen name="SendNote" component={SendNoteScreen} />
      <RootStack.Screen name="SendReview" component={SendReviewScreen} />
      <RootStack.Screen name="SendResult" component={SendResultScreen} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="SavedAccounts" component={SavedAccountsScreen} />
      <RootStack.Screen name="SavedAccountAdd" component={SavedAccountAddScreen} />
      <RootStack.Screen name="SavedAccountDetail" component={SavedAccountDetailScreen} />
      <RootStack.Screen name="SavedGroup" component={SavedGroupScreen} />
      <RootStack.Screen name="MoveMoney" component={MoveMoneyScreen} />
      <RootStack.Screen name="MyQr" component={MyQrScreen} />
      <RootStack.Screen name="ScanQr" component={ScanQrScreen} />
      <RootStack.Screen name="RequestMoney" component={RequestMoneyScreen} />
      <RootStack.Screen name="RequestSent" component={RequestSentScreen} />
      <RootStack.Screen name="IncomingRequest" component={IncomingRequestScreen} />
      <RootStack.Screen name="SplitBill" component={SplitBillScreen} />
      <RootStack.Screen name="SendSchedule" component={SendScheduleScreen} />
      <RootStack.Screen name="AddToTreasury" component={AddToTreasuryScreen} />
      <RootStack.Screen name="BreakEarly" component={BreakEarlyScreen} />
      <RootStack.Screen name="ChildLimits" component={ChildLimitsScreen} />
      <RootStack.Screen name="ChildTasksParent" component={ChildTasksParentScreen} />
      <RootStack.Screen name="AssignTask" component={AssignTaskScreen} />
      <RootStack.Screen name="ChildGift" component={ChildGiftScreen} />
      <RootStack.Screen name="BreakDone" component={BreakDoneScreen} />
      <RootStack.Screen name="ScheduledPayments" component={ScheduledPaymentsScreen} />
      <RootStack.Screen name="AddMoney" component={AddMoneyScreen} />
      <RootStack.Screen name="BankTransfer" component={BankTransferScreen} />
      <RootStack.Screen name="Permissions" component={PermissionsScreen} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="DeepLink" component={DeepLinkScreen} />
      <RootStack.Screen name="SupportChat" component={SupportChatScreen} />
      <RootStack.Screen name="FreezeAccount" component={FreezeAccountScreen} />
      <RootStack.Screen name="Legal" component={LegalScreen} />
      <RootStack.Screen name="LegalDoc" component={LegalDocScreen} />
      <RootStack.Screen name="About" component={AboutScreen} />
      <RootStack.Screen name="CloseAccount" component={CloseAccountScreen} />
      <RootStack.Screen name="FamilyHub" component={FamilyHubScreen} />
      <RootStack.Screen name="FamilyMember" component={FamilyMemberScreen} />
      <RootStack.Screen name="SpousalSync" component={SpousalSyncScreen} />
      <RootStack.Screen name="Automations" component={AutomationsScreen} />
      <RootStack.Screen name="CreateAutomation" component={CreateAutomationScreen} />
      <RootStack.Screen name="Disputes" component={DisputesScreen} />
      <RootStack.Screen name="StartDispute" component={StartDisputeScreen} />
      <RootStack.Screen name="DisputeDetail" component={DisputeDetailScreen} />
      <RootStack.Screen name="DisputeChat" component={DisputeChatScreen} />
      <RootStack.Screen name="DisputeRespond" component={DisputeRespondScreen} />
      <RootStack.Screen name="EscalateDispute" component={EscalateDisputeScreen} />
      <RootStack.Screen name="HelpFaq" component={HelpFaqScreen} />
      <RootStack.Screen name="SecurityCenter" component={SecurityCenterScreen} />
      <RootStack.Screen name="Referral" component={ReferralScreen} />
      <RootStack.Screen name="Goals" component={GoalsScreen} />
      <RootStack.Screen name="VendorDirectory" component={VendorDirectoryScreen} />
      <RootStack.Screen name="VendorProfile" component={VendorProfileScreen} />
      <RootStack.Screen name="RateVendor" component={RateVendorScreen} />
      <RootStack.Screen name="BusinessSetup" component={BusinessSetupScreen} />
      <RootStack.Screen name="BusinessVerification" component={BusinessVerificationScreen} />
      <RootStack.Screen name="VendorProject" component={VendorProjectScreen} />
      <RootStack.Screen name="SubmitWork" component={SubmitWorkScreen} />
      <RootStack.Screen name="ProposeMilestone" component={ProposeMilestoneScreen} />
      <RootStack.Screen name="VendorTeam" component={VendorTeamScreen} />
      <RootStack.Screen name="InviteTeam" component={InviteTeamScreen} />
      <RootStack.Screen name="TeamInvite" component={TeamInviteScreen} />
      <RootStack.Screen name="ProjectInvite" component={ProjectInviteScreen} />
      <RootStack.Screen name="InviteMilestones" component={InviteMilestonesScreen} />
      <RootStack.Screen name="AskChange" component={AskChangeScreen} />
      <RootStack.Screen name="ChangesSent" component={ChangesSentScreen} options={{ gestureEnabled: false }} />
      <RootStack.Screen name="Approvals" component={ApprovalsScreen} />
      <RootStack.Screen name="ApprovalDetail" component={ApprovalDetailScreen} />
      <RootStack.Screen name="Notifications" component={NotificationsScreen} />
      <RootStack.Screen name="Invitations" component={InvitationsScreen} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} />
      <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <RootStack.Screen name="ChangePin" component={ChangePinScreen} />
      <RootStack.Screen name="Devices" component={DevicesScreen} />
      <RootStack.Screen name="Loans" component={LoansScreen} />
      <RootStack.Screen name="LoanApply" component={LoanApplyScreen} />
      <RootStack.Screen name="LoanDetail" component={LoanDetailScreen} />
      <RootStack.Screen name="Repay" component={RepayScreen} />
      <RootStack.Screen name="Projects" component={ProjectsScreen} />
      <RootStack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <RootStack.Screen name="Milestones" component={MilestonesScreen} />
      <RootStack.Screen name="EditMilestone" component={EditMilestoneScreen} />
      <RootStack.Screen name="ReviewMilestone" component={ReviewMilestoneScreen} />
      <RootStack.Screen name="ReleasePayment" component={ReleasePaymentScreen} />
      <RootStack.Screen name="ProofViewer" component={ProofViewerScreen} options={{ presentation: 'fullScreenModal' }} />
      <RootStack.Screen name="MilestoneApprovals" component={MilestoneApprovalsScreen} />
      <RootStack.Screen name="ProjectApprovalSettings" component={ProjectApprovalSettingsScreen} />
      <RootStack.Screen name="MoneyByMilestone" component={MoneyByMilestoneScreen} />
      <RootStack.Screen name="ProjectWallet" component={ProjectWalletScreen} />
      <RootStack.Screen name="ProjectMembers" component={ProjectMembersScreen} />
      <RootStack.Screen name="InviteFunder" component={InviteFunderScreen} />
      <RootStack.Screen name="VendorProjectFunds" component={VendorProjectFundsScreen} />
      <RootStack.Screen name="FunderInvite" component={FunderInviteScreen} />
      <RootStack.Screen name="Chats" component={ChatsScreen} />
      <RootStack.Screen name="NewChat" component={NewChatScreen} />
      <RootStack.Screen name="Conversation" component={ConversationScreen} />
      <RootStack.Screen name="ChatInfo" component={ChatInfoScreen} />
      <RootStack.Screen name="ProposalReview" component={ProposalReviewScreen} />
      <RootStack.Screen name="ProposalFund" component={ProposalFundScreen} />
      <RootStack.Screen name="NewProposal" component={NewProposalScreen} />
      <RootStack.Screen name="ListProject" component={ListProjectScreen} />
      <RootStack.Screen name="Listing" component={ListingScreen} />
      <RootStack.Screen name="FindVendorSteward" component={FindVendorStewardScreen} />
      <RootStack.Screen name="ProjectDocuments" component={ProjectDocumentsScreen} />
      <RootStack.Screen name="ProjectBudget" component={ProjectBudgetScreen} />
      <RootStack.Screen name="ApproveProposal" component={ApproveProposalScreen} />
      <RootStack.Screen name="ProjectChat" component={ProjectChatScreen} />
      <RootStack.Screen name="Kyc" component={KycScreen} />
      <RootStack.Screen name="KycSubmit" component={KycSubmitScreen} />
    </RootStack.Navigator>
  );
}
