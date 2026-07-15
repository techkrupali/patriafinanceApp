import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PinPad } from '../components/PinPad';
import { colors, gradients } from '../theme';
import { useDashboard, useLogoutApi } from '../api/hooks';
import { useAuth } from '../store/auth';
import { initials } from '../lib/format';
import { tierName } from '../lib/kyc';
import {
  clearTxnPin,
  getBiometricSupport,
  runBiometricPrompt,
  saveTxnPin,
  type BiometricSupport,
} from '../lib/biometrics';
import { notifySuccess } from '../lib/haptics';
import type { TabScreenProps } from '../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Row({
  icon,
  tint = 'bg-lav-faint',
  iconColor = colors.navy,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon: IconName;
  tint?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-center py-3.5 active:opacity-70">
      <View className={`mr-3.5 h-10 w-10 items-center justify-center rounded-2xl ${tint}`}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-muted">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.faded} /> : null)}
    </Pressable>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

export function ProfileScreen({ navigation }: TabScreenProps<'Profile'>) {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);
  const logoutLocal = useAuth((s) => s.logout);
  const logoutApi = useLogoutApi();
  const qc = useQueryClient();
  const { data: dashboard } = useDashboard();

  const kyc = dashboard?.kyc;
  const kycTier = kyc?.tier ?? user?.kyc_tier ?? 0;
  const kycSubtitle =
    kyc?.status === 'pending'
      ? 'Verification under review'
      : kyc?.can_upgrade
        ? `Tier ${kycTier} · Verify to raise your limits`
        : `Tier ${kycTier} · ${tierName(kycTier)}`;

  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [capturePin, setCapturePin] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const bioLabel = support?.label ?? 'Biometric unlock';

  const onToggleBiometric = async (next: boolean) => {
    if (busy) return;
    if (!next) {
      await setBiometricEnabled(false);
      await clearTxnPin();
      return;
    }
    if (!support?.available) {
      Alert.alert(
        'Not available',
        'Set up Face ID or a fingerprint in your device settings first, then try again.',
      );
      return;
    }
    setBusy(true);
    try {
      const ok = await runBiometricPrompt(`Confirm to enable ${bioLabel}`);
      if (ok) {
        setCapturePin('');
        setPinModal(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const onCaptureChange = async (next: string) => {
    setCapturePin(next);
    if (next.length === 4) {
      await saveTxnPin(next);
      await setBiometricEnabled(true);
      notifySuccess();
      setPinModal(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logoutApi.mutate(undefined, {
            onSettled: async () => {
              await logoutLocal();
              qc.clear();
            },
          });
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <Text className="text-3xl font-extrabold tracking-tight text-ink">Profile</Text>

        {/* Identity card */}
        <Card className="mt-5 items-center py-7">
          <LinearGradient
            colors={gradients.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ height: 72, width: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text className="text-2xl font-bold text-white">{initials(user?.full_name)}</Text>
          </LinearGradient>
          <Text className="mt-3 text-lg font-extrabold text-ink">{user?.full_name}</Text>
          <Text className="mt-1 text-sm text-muted">{user?.email}</Text>
          <Text className="mt-0.5 text-sm text-muted">{user?.phone}</Text>

          <View className="mt-4 flex-row items-center rounded-full bg-success-soft px-3.5 py-1.5">
            <Ionicons name="ribbon-outline" size={13} color={colors.brand} style={{ marginRight: 5 }} />
            <Text className="text-[11px] font-bold uppercase tracking-widest text-brand">
              KYC Tier {kycTier}
            </Text>
          </View>
        </Card>

        {/* Identity */}
        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Identity</Text>
        <Card className="mt-2 py-1">
          <Row
            icon="shield-checkmark-outline"
            tint="bg-success-soft"
            iconColor={colors.brand}
            title="Identity verification"
            subtitle={kycSubtitle}
            onPress={() => navigation.navigate('Kyc')}
            right={
              kyc?.can_upgrade ? (
                <View className="flex-row items-center">
                  <View className="mr-2 rounded-full bg-success-soft px-2.5 py-1">
                    <Text className="text-[11px] font-bold text-brand">Verify</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.faded} />
                </View>
              ) : undefined
            }
          />
        </Card>

        {/* Security */}
        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Security</Text>
        <Card className="mt-2 py-1">
          <Row
            icon="key-outline"
            title="Change password"
            subtitle="Update your sign-in password"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <Divider />
          <Row
            icon="keypad-outline"
            title="Change transaction PIN"
            subtitle="4-digit PIN used to authorize money"
            onPress={() => navigation.navigate('ChangePin')}
          />
          <Divider />
          <Row
            icon={support?.icon ?? 'finger-print'}
            tint="bg-success-soft"
            iconColor={colors.brand}
            title={bioLabel}
            subtitle={biometricEnabled ? 'Enabled for unlock & payments' : 'Use biometrics to authorize'}
            right={
              <Switch
                value={biometricEnabled}
                onValueChange={(v) => void onToggleBiometric(v)}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.white}
              />
            }
          />
          <Divider />
          <Row
            icon="phone-portrait-outline"
            title="Devices"
            subtitle="Where you're signed in"
            onPress={() => navigation.navigate('Devices')}
          />
        </Card>

        {/* Finance */}
        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Finance</Text>
        <Card className="mt-2 py-1">
          <Row
            icon="cash-outline"
            tint="bg-success-soft"
            iconColor={colors.brand}
            title="Loans"
            subtitle="Borrow & manage Patria Lending"
            onPress={() => navigation.navigate('Loans')}
          />
          <Divider />
          <Row
            icon="briefcase-outline"
            title="Projects"
            subtitle="Escrow-backed milestone projects"
            onPress={() => navigation.navigate('Projects')}
          />
        </Card>

        {/* Collaboration */}
        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Collaboration</Text>
        <Card className="mt-2 py-1">
          <Row
            icon="shield-checkmark-outline"
            tint="bg-success-soft"
            iconColor={colors.brand}
            title="Approvals"
            subtitle="Spends waiting on approval"
            onPress={() => navigation.navigate('Approvals')}
          />
          <Divider />
          <Row
            icon="mail-open-outline"
            title="Invitations"
            subtitle="Wallets you've been invited to"
            onPress={() => navigation.navigate('Invitations')}
          />
          <Divider />
          <Row
            icon="notifications-outline"
            title="Notifications"
            subtitle="Approvals, invites & transfers"
            onPress={() => navigation.navigate('Notifications')}
          />
        </Card>

        <View className="mt-8">
          <Button title="Log Out" variant="danger" icon="log-out-outline" iconPosition="left" onPress={confirmLogout} loading={logoutApi.isPending} />
        </View>
        <Text className="mt-4 text-center text-xs text-faded">Patriai · v1.0.0</Text>
      </ScrollView>

      {/* Transaction PIN capture (for biometric authorize) */}
      <Modal visible={pinModal} transparent animationType="slide" onRequestClose={() => setPinModal(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-[32px] bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />
            <View className="mb-4 flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-extrabold text-ink">Confirm your PIN</Text>
                <Text className="mt-1 text-sm text-muted">
                  Enter your transaction PIN once so {bioLabel} can authorize payments securely.
                </Text>
              </View>
              <Pressable
                onPress={() => setPinModal(false)}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
            <PinPad value={capturePin} onChange={(v) => void onCaptureChange(v)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
