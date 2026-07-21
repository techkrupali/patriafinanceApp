import React, { useState } from 'react';
import { View } from 'react-native';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/auth';
import { colors, gradients, shadow } from '../theme';
import { AppLock } from '../components/AppLock';
import type { AuthStackParamList, MainTabParamList, RootStackParamList } from './types';

// Auth screens
import { WalkthroughScreen } from '../screens/auth/WalkthroughScreen';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { OtpScreen } from '../screens/auth/OtpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';

// Tab screens
import { HomeScreen } from '../screens/HomeScreen';
import { WalletsScreen } from '../screens/WalletsScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

// Stack screens
import { WalletDetailScreen } from '../screens/wallet/WalletDetailScreen';
import { FundScreen } from '../screens/wallet/FundScreen';
import { WithdrawScreen } from '../screens/wallet/WithdrawScreen';
import { TransferScreen } from '../screens/wallet/TransferScreen';
import { RequestSpendScreen } from '../screens/wallet/RequestSpendScreen';
import { CreateWalletScreen } from '../screens/wallet/CreateWalletScreen';
import { InviteMemberScreen } from '../screens/wallet/InviteMemberScreen';
import { WalletSettingsScreen } from '../screens/wallet/WalletSettingsScreen';
import { AssignAccessScreen } from '../screens/wallet/AssignAccessScreen';
import { WalletAuditLogScreen } from '../screens/wallet/WalletAuditLogScreen';
import { WalletLockScreen } from '../screens/wallet/WalletLockScreen';
import { FamilyHubScreen } from '../screens/family/FamilyHubScreen';
import { FamilyMemberScreen } from '../screens/family/FamilyMemberScreen';
import { SpousalSyncScreen } from '../screens/family/SpousalSyncScreen';
import { AutomationsScreen } from '../screens/automation/AutomationsScreen';
import { CreateAutomationScreen } from '../screens/automation/CreateAutomationScreen';
import { DisputesScreen } from '../screens/support/DisputesScreen';
import { RaiseDisputeScreen } from '../screens/support/RaiseDisputeScreen';
import { HelpFaqScreen } from '../screens/support/HelpFaqScreen';
import { SecurityCenterScreen } from '../screens/support/SecurityCenterScreen';
import { ReferralScreen } from '../screens/referral/ReferralScreen';
import { GoalsScreen } from '../screens/goals/GoalsScreen';
import { CreateGoalScreen } from '../screens/goals/CreateGoalScreen';
import { VendorDirectoryScreen } from '../screens/vendors/VendorDirectoryScreen';
import { VendorProfileScreen } from '../screens/vendors/VendorProfileScreen';
import { BecomeVendorScreen } from '../screens/vendors/BecomeVendorScreen';
import { ApprovalsScreen } from '../screens/governance/ApprovalsScreen';
import { ApprovalDetailScreen } from '../screens/governance/ApprovalDetailScreen';
import { NotificationsScreen } from '../screens/governance/NotificationsScreen';
import { InvitationsScreen } from '../screens/governance/InvitationsScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { ChangePinScreen } from '../screens/profile/ChangePinScreen';
import { DevicesScreen } from '../screens/profile/DevicesScreen';
import { LoansScreen } from '../screens/loans/LoansScreen';
import { LoanApplyScreen } from '../screens/loans/LoanApplyScreen';
import { LoanDetailScreen } from '../screens/loans/LoanDetailScreen';
import { RepayScreen } from '../screens/loans/RepayScreen';
import { ProjectsScreen } from '../screens/projects/ProjectsScreen';
import { CreateProjectScreen } from '../screens/projects/CreateProjectScreen';
import { ProjectDetailScreen } from '../screens/projects/ProjectDetailScreen';
import { AssignVendorScreen } from '../screens/projects/AssignVendorScreen';
import { AddMilestoneScreen } from '../screens/projects/AddMilestoneScreen';
import { KycScreen } from '../screens/kyc/KycScreen';
import { KycSubmitScreen } from '../screens/kyc/KycSubmitScreen';
import { StewardScreen } from '../screens/steward/StewardScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Client footer spec — Home · Family · Steward (raised gold AI button) ·
 * Treasury · Rules · More. Material icons per the Curated Ledger design.
 */
const TAB_ICONS: Record<Exclude<keyof MainTabParamList, 'Steward'>, { on: MciName; off: MciName }> = {
  Home: { on: 'home', off: 'home-outline' },
  Family: { on: 'account-group', off: 'account-group-outline' },
  Treasury: { on: 'bank', off: 'bank-outline' },
  Rules: { on: 'tune-variant', off: 'tune-variant' },
  More: { on: 'menu', off: 'menu' },
};

// Existing screens re-hosted as tabs (their inner navigation calls still work
// through the composite navigator; they take no route params).
const FamilyTab = (props: Record<string, unknown>) => (
  <FamilyHubScreen {...(props as unknown as React.ComponentProps<typeof FamilyHubScreen>)} />
);
const RulesTab = (props: Record<string, unknown>) => (
  <AutomationsScreen {...(props as unknown as React.ComponentProps<typeof AutomationsScreen>)} />
);

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        // Default tab button uses RN Pressable, which doesn't fire onPress inside
        // native-stack on physical Android + New Arch. Use the RNGH Pressable.
        tabBarButton: (props) => (
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
        tabBarActiveTintColor: colors.goldDeep,
        tabBarInactiveTintColor: colors.muted,
        // One shared label spec so every tab's text sits on the same baseline.
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '800',
          marginTop: 5,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        tabBarItemStyle: { paddingTop: 12 },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 74 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          paddingTop: 4,
          paddingHorizontal: 4,
        },
        tabBarBackground: () => (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.white,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              ...shadow.tab,
            }}
          />
        ),
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'Steward') {
            // Raised metallic-gold AI button. The circle is absolutely
            // positioned inside a normal-height slot so the STEWARD label
            // stays on the exact same baseline as every other tab.
            return (
              <View style={{ width: 56, height: 28, alignItems: 'center' }}>
                <LinearGradient
                  colors={gradients.gold}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    {
                      position: 'absolute',
                      top: -32,
                      height: 54,
                      width: 54,
                      borderRadius: 27,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 4,
                      borderColor: colors.white,
                    },
                    shadow.gold,
                  ]}
                >
                  <MaterialCommunityIcons name="creation" size={24} color="#3D2F00" />
                </LinearGradient>
              </View>
            );
          }
          const icons = TAB_ICONS[route.name as Exclude<keyof MainTabParamList, 'Steward'>];
          return (
            <View
              style={{
                width: 46,
                height: 28,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? '#FFF3C4' : 'transparent',
              }}
            >
              <MaterialCommunityIcons name={focused ? icons.on : icons.off} size={21} color={color} />
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Family" component={FamilyTab} />
      <Tabs.Screen name="Steward" component={StewardScreen} options={{ tabBarLabel: 'Steward' }} />
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
  const [bypassLock, setBypassLock] = useState(false);

  if (status !== 'authed') {
    // A persisted session locked behind biometrics -> present the unlock screen.
    if (hasStoredSession && biometricEnabled && !bypassLock) {
      return <AppLock onUsePassword={() => setBypassLock(true)} />;
    }
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
        <AuthStack.Screen name="Walkthrough" component={WalkthroughScreen} />
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="Otp" component={OtpScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={MainTabs} />
      <RootStack.Screen name="Activity" component={ActivityScreen} />
      <RootStack.Screen name="WalletDetail" component={WalletDetailScreen} />
      <RootStack.Screen name="Fund" component={FundScreen} />
      <RootStack.Screen name="Withdraw" component={WithdrawScreen} />
      <RootStack.Screen name="Transfer" component={TransferScreen} />
      <RootStack.Screen name="RequestSpend" component={RequestSpendScreen} />
      <RootStack.Screen name="CreateWallet" component={CreateWalletScreen} />
      <RootStack.Screen name="InviteMember" component={InviteMemberScreen} />
      <RootStack.Screen name="WalletSettings" component={WalletSettingsScreen} />
      <RootStack.Screen name="AssignAccess" component={AssignAccessScreen} />
      <RootStack.Screen name="WalletAuditLog" component={WalletAuditLogScreen} />
      <RootStack.Screen name="WalletLock" component={WalletLockScreen} />
      <RootStack.Screen name="FamilyHub" component={FamilyHubScreen} />
      <RootStack.Screen name="FamilyMember" component={FamilyMemberScreen} />
      <RootStack.Screen name="SpousalSync" component={SpousalSyncScreen} />
      <RootStack.Screen name="Automations" component={AutomationsScreen} />
      <RootStack.Screen name="CreateAutomation" component={CreateAutomationScreen} />
      <RootStack.Screen name="Disputes" component={DisputesScreen} />
      <RootStack.Screen name="RaiseDispute" component={RaiseDisputeScreen} />
      <RootStack.Screen name="HelpFaq" component={HelpFaqScreen} />
      <RootStack.Screen name="SecurityCenter" component={SecurityCenterScreen} />
      <RootStack.Screen name="Referral" component={ReferralScreen} />
      <RootStack.Screen name="Goals" component={GoalsScreen} />
      <RootStack.Screen name="CreateGoal" component={CreateGoalScreen} />
      <RootStack.Screen name="VendorDirectory" component={VendorDirectoryScreen} />
      <RootStack.Screen name="VendorProfile" component={VendorProfileScreen} />
      <RootStack.Screen name="BecomeVendor" component={BecomeVendorScreen} />
      <RootStack.Screen name="Approvals" component={ApprovalsScreen} />
      <RootStack.Screen name="ApprovalDetail" component={ApprovalDetailScreen} />
      <RootStack.Screen name="Notifications" component={NotificationsScreen} />
      <RootStack.Screen name="Invitations" component={InvitationsScreen} />
      <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <RootStack.Screen name="ChangePin" component={ChangePinScreen} />
      <RootStack.Screen name="Devices" component={DevicesScreen} />
      <RootStack.Screen name="Loans" component={LoansScreen} />
      <RootStack.Screen name="LoanApply" component={LoanApplyScreen} />
      <RootStack.Screen name="LoanDetail" component={LoanDetailScreen} />
      <RootStack.Screen name="Repay" component={RepayScreen} />
      <RootStack.Screen name="Projects" component={ProjectsScreen} />
      <RootStack.Screen name="CreateProject" component={CreateProjectScreen} />
      <RootStack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <RootStack.Screen name="AssignVendor" component={AssignVendorScreen} />
      <RootStack.Screen name="AddMilestone" component={AddMilestoneScreen} />
      <RootStack.Screen name="Kyc" component={KycScreen} />
      <RootStack.Screen name="KycSubmit" component={KycSubmitScreen} />
    </RootStack.Navigator>
  );
}
