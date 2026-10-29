import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/auth';
import { pt, ptFont } from '../theme';
import { AppLock } from '../components/AppLock';
import type { AuthStackParamList, MainTabParamList, RootStackParamList, VendorTabParamList } from './types';

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

// Tab screens
import { HomeScreen } from '../screens/HomeScreen';
import { WalletsScreen } from '../screens/WalletsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
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
import { ProjectDocumentsScreen } from '../screens/projects/ProjectDocumentsScreen';
import { ProjectBudgetScreen } from '../screens/projects/ProjectBudgetScreen';
import { ApproveProposalScreen } from '../screens/projects/ApproveProposalScreen';
import { ProjectChatScreen } from '../screens/projects/ProjectChatScreen';
import { KycScreen } from '../screens/kyc/KycScreen';
import { KycSubmitScreen } from '../screens/kyc/KycSubmitScreen';
import { StewardScreen } from '../screens/steward/StewardScreen';
import { CustomiseHomeScreen } from '../screens/CustomiseHomeScreen';
import { AllWalletsScreen } from '../screens/AllWalletsScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();
const VendorTabNav = createBottomTabNavigator<VendorTabParamList>();

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
  const [bypassLock, setBypassLock] = useState(false);

  if (status !== 'authed') {
    // A persisted session locked behind biometrics -> present the unlock screen.
    if (hasStoredSession && biometricEnabled && !bypassLock) {
      return <AppLock onUsePassword={() => setBypassLock(true)} />;
    }
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
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
      </AuthStack.Navigator>
    );
  }

  return (
    // The app opens in the mode last used on this phone (VDM-03 vendor mode, or the family app).
    <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={mode === 'business' ? 'VendorTabs' : 'Tabs'}>
      <RootStack.Screen name="Tabs" component={MainTabs} />
      <RootStack.Screen name="VendorTabs" component={VendorTabs} />
      <RootStack.Screen name="CustomiseHome" component={CustomiseHomeScreen} />
      <RootStack.Screen name="AllWallets" component={AllWalletsScreen} />
      <RootStack.Screen name="Activity" component={ActivityScreen} />
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
      <RootStack.Screen name="ProjectDocuments" component={ProjectDocumentsScreen} />
      <RootStack.Screen name="ProjectBudget" component={ProjectBudgetScreen} />
      <RootStack.Screen name="ApproveProposal" component={ApproveProposalScreen} />
      <RootStack.Screen name="ProjectChat" component={ProjectChatScreen} />
      <RootStack.Screen name="Kyc" component={KycScreen} />
      <RootStack.Screen name="KycSubmit" component={KycSubmitScreen} />
    </RootStack.Navigator>
  );
}
