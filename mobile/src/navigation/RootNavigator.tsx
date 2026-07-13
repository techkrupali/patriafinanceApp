import React, { useState } from 'react';
import { View } from 'react-native';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../store/auth';
import { colors, shadow } from '../theme';
import { AppLock } from '../components/AppLock';
import type { AuthStackParamList, MainTabParamList, RootStackParamList } from './types';

// Auth screens
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { OtpScreen } from '../screens/auth/OtpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';

// Tab screens
import { HomeScreen } from '../screens/HomeScreen';
import { WalletsScreen } from '../screens/WalletsScreen';
import { AiScreen } from '../screens/AiScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ProfileScreen } from '../screens/ProfileScreen';

// Stack screens
import { WalletDetailScreen } from '../screens/wallet/WalletDetailScreen';
import { FundScreen } from '../screens/wallet/FundScreen';
import { WithdrawScreen } from '../screens/wallet/WithdrawScreen';
import { TransferScreen } from '../screens/wallet/TransferScreen';
import { CreateWalletScreen } from '../screens/wallet/CreateWalletScreen';
import { ChangePasswordScreen } from '../screens/profile/ChangePasswordScreen';
import { ChangePinScreen } from '../screens/profile/ChangePinScreen';
import { DevicesScreen } from '../screens/profile/DevicesScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof MainTabParamList, { on: IconName; off: IconName }> = {
  Home: { on: 'home', off: 'home-outline' },
  Wallets: { on: 'wallet', off: 'wallet-outline' },
  AI: { on: 'sparkles', off: 'sparkles-outline' },
  Activity: { on: 'time', off: 'time-outline' },
  Profile: { on: 'person', off: 'person-outline' },
};

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
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faded,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 4 },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 8,
          ...shadow.tab,
        },
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: focused ? colors.lav : 'transparent',
            }}
          >
            <Ionicons
              name={focused ? TAB_ICONS[route.name].on : TAB_ICONS[route.name].off}
              size={20}
              color={focused ? colors.brand : colors.faded}
            />
          </View>
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Wallets" component={WalletsScreen} />
      <Tabs.Screen name="AI" component={AiScreen} options={{ tabBarLabel: 'AI' }} />
      <Tabs.Screen name="Activity" component={ActivityScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
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
      <RootStack.Screen name="WalletDetail" component={WalletDetailScreen} />
      <RootStack.Screen name="Fund" component={FundScreen} />
      <RootStack.Screen name="Withdraw" component={WithdrawScreen} />
      <RootStack.Screen name="Transfer" component={TransferScreen} />
      <RootStack.Screen name="CreateWallet" component={CreateWalletScreen} />
      <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <RootStack.Screen name="ChangePin" component={ChangePinScreen} />
      <RootStack.Screen name="Devices" component={DevicesScreen} />
    </RootStack.Navigator>
  );
}
