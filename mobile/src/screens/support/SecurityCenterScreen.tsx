import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { colors, gradients, shadow } from '../../theme';
import { useDashboard } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { tierName } from '../../lib/kyc';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

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
    <Pressable
      onPress={
        onPress
          ? () => {
              selection();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      className="flex-row items-center py-3.5 active:opacity-70"
    >
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

const TIPS: { icon: IconName; text: string }[] = [
  { icon: 'lock-closed-outline', text: 'Patriai staff will never ask for your PIN or password.' },
  { icon: 'finger-print-outline', text: 'Turn on biometric unlock for faster, safer sign-in.' },
  { icon: 'trending-up-outline', text: 'Verify a higher KYC tier to raise your limits.' },
  { icon: 'phone-portrait-outline', text: "Review your devices regularly and remove any you don't recognise." },
];

export function SecurityCenterScreen({ navigation }: RootScreenProps<'SecurityCenter'>) {
  const { data: dashboard, isLoading, error, refetch, isRefetching } = useDashboard();
  const user = useAuth((s) => s.user);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);

  const hasPin = Boolean(user?.has_pin);
  const kycTier = dashboard?.kyc?.tier ?? user?.kyc_tier ?? 0;
  const kycOn = kycTier >= 1;

  const protections = [hasPin, biometricEnabled, kycOn];
  const activeCount = protections.filter(Boolean).length;
  const total = protections.length;
  const pct = Math.round((activeCount / total) * 100);
  const allOn = activeCount === total;

  return (
    <Screen withBottomInset>
      <Header title="Security Center" />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />
        }
      >
        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : (
          <>
            {/* Score hero */}
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
            >
              <View className="flex-row items-center">
                <View className="mr-3.5 h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <Ionicons
                    name={allOn ? 'shield-checkmark' : 'shield-half'}
                    size={26}
                    color={colors.brandGlow}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                    Security status
                  </Text>
                  <Text className="mt-1 text-xl font-extrabold leading-tight text-white">
                    {allOn ? 'Your account is protected' : 'Boost your protection'}
                  </Text>
                </View>
              </View>

              <View className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
                <View
                  className="h-2 rounded-full bg-brand-mint"
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </View>
              <Text className="mt-2.5 text-[13px] text-white/70">
                {activeCount} of {total} protections on
              </Text>
            </LinearGradient>

            {/* Protection checklist */}
            <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Protection</Text>
            <Card className="mt-3 py-1">
              <Row
                icon="keypad-outline"
                tint="bg-success-soft"
                iconColor={colors.brand}
                title="Transaction PIN"
                subtitle={hasPin ? 'On — required for every spend' : 'Not set'}
                onPress={() => navigation.navigate('ChangePin')}
                right={
                  hasPin ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                  ) : (
                    <View className="rounded-full bg-lav-faint px-2.5 py-1">
                      <Text className="text-[11px] font-bold text-brand">Set up</Text>
                    </View>
                  )
                }
              />
              <Divider />
              <Row
                icon="finger-print-outline"
                tint="bg-success-soft"
                iconColor={colors.brand}
                title="Biometric unlock"
                subtitle={biometricEnabled ? 'On' : 'Off'}
                right={
                  biometricEnabled ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={colors.faded} />
                  )
                }
              />
              <Divider />
              <Row
                icon="shield-checkmark-outline"
                tint="bg-success-soft"
                iconColor={colors.brand}
                title="Identity verification (KYC)"
                subtitle={`Tier ${kycTier} · ${tierName(kycTier)}`}
                onPress={() => navigation.navigate('Kyc')}
                right={
                  <View className="flex-row items-center">
                    {kycOn ? (
                      <Ionicons name="checkmark-circle" size={22} color={colors.brand} style={{ marginRight: 2 }} />
                    ) : null}
                    <Ionicons name="chevron-forward" size={18} color={colors.faded} />
                  </View>
                }
              />
              <Divider />
              <Row
                icon="phone-portrait-outline"
                title="Sign-in devices"
                subtitle="Review where you're signed in"
                onPress={() => navigation.navigate('Devices')}
              />
              <Divider />
              <Row
                icon="key-outline"
                title="Password"
                subtitle="Change your sign-in password"
                onPress={() => navigation.navigate('ChangePassword')}
              />
            </Card>

            {/* Stay safe tips */}
            <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Stay safe</Text>
            <Card className="mt-3 py-1">
              {TIPS.map((tip, i) => (
                <View key={tip.text}>
                  {i > 0 ? <Divider /> : null}
                  <View className="flex-row items-center py-3.5">
                    <View className="mr-3.5 h-10 w-10 items-center justify-center rounded-2xl bg-lav-faint">
                      <Ionicons name={tip.icon} size={18} color={colors.navy} />
                    </View>
                    <Text className="flex-1 text-[13px] leading-5 text-muted">{tip.text}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
