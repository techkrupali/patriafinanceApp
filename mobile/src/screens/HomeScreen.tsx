import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { TxnRow } from '../components/TxnRow';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { colors, gradients, shadow } from '../theme';
import { useDashboard, useMyInvitations } from '../api/hooks';
import { useAuth } from '../store/auth';
import { formatMoney, initials } from '../lib/format';
import { selection } from '../lib/haptics';
import type { TabScreenProps } from '../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function QuickAction({
  icon,
  label,
  tint,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  tint: readonly [string, string];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      disabled={disabled}
      className={`flex-1 items-center ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
    >
      <LinearGradient
        colors={tint}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ height: 56, width: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}
      >
        <Ionicons name={icon} size={23} color={colors.white} />
      </LinearGradient>
      <Text className="mt-2 text-xs font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const user = useAuth((s) => s.user);
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();
  const { data: invitations } = useMyInvitations();
  const [hidden, setHidden] = useState(false);

  const mainWallet = useMemo(
    () => data?.wallets.find((w) => w.type === 'main') ?? data?.wallets[0],
    [data],
  );

  const unread = data?.unread_notifications ?? 0;
  const pendingApprovals = data?.pending_approvals ?? 0;
  const inviteCount = invitations?.length ?? 0;

  const inflow = parseFloat(data?.inflow_30d ?? '0');
  const outflow = parseFloat(data?.outflow_30d ?? '0');
  const maxFlow = Math.max(inflow, outflow, 1);

  const activeLoan =
    data?.active_loan && data.active_loan.has_active_loan ? data.active_loan : null;

  const pendingSubmissions = data?.projects?.pending_submissions ?? 0;

  const canUpgradeKyc = data?.kyc?.can_upgrade ?? false;
  const nextKycTier = (data?.kyc?.tier ?? 0) + 1;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />
        }
      >
        {/* Greeting */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Pressable onPress={() => navigation.navigate('Profile')} className="active:opacity-80">
              <LinearGradient
                colors={gradients.avatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 46, width: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-sm font-bold text-white">{initials(user?.full_name)}</Text>
              </LinearGradient>
            </Pressable>
            <View className="ml-3">
              <Text className="text-[13px] text-muted">Welcome back</Text>
              <Text className="text-lg font-extrabold text-ink">Hi, {user?.first_name ?? 'there'}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-80"
            style={shadow.soft}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            {unread > 0 ? (
              <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1">
                <Text className="text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : data ? (
          <>
            {/* Balance hero */}
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 28, marginTop: 20, padding: 24 }, shadow.hero]}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                  Total Balance
                </Text>
                <Pressable
                  onPress={() => {
                    selection();
                    setHidden((h) => !h);
                  }}
                  hitSlop={8}
                  className="flex-row items-center active:opacity-70"
                >
                  <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.brandGlow} />
                  <Text className="ml-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-glow">
                    {hidden ? 'Show' : 'Hide'}
                  </Text>
                </Pressable>
              </View>
              <Text className="mt-2 text-[40px] font-extrabold leading-tight tracking-tight text-white">
                {hidden ? '₦ • • • • • •' : formatMoney(data.total_balance)}
              </Text>

              {/* Inflow / outflow bars */}
              <View className="mt-5" style={{ gap: 12 }}>
                <View className="flex-row items-center">
                  <Ionicons name="arrow-down" size={13} color={colors.brandGlow} />
                  <View className="mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <View
                      className="h-1.5 rounded-full bg-brand-mint"
                      style={{ width: `${Math.max((inflow / maxFlow) * 100, 3)}%` }}
                    />
                  </View>
                  <Text className="text-xs font-semibold text-brand-glow">
                    {hidden ? '••••' : `+${formatMoney(data.inflow_30d)}`}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="arrow-up" size={13} color={colors.rose} />
                  <View className="mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <View
                      className="h-1.5 rounded-full"
                      style={{ width: `${Math.max((outflow / maxFlow) * 100, 3)}%`, backgroundColor: colors.rose }}
                    />
                  </View>
                  <Text className="text-xs font-semibold" style={{ color: colors.rose }}>
                    {hidden ? '••••' : `-${formatMoney(data.outflow_30d)}`}
                  </Text>
                </View>
              </View>
              <Text className="mt-3 text-[10px] text-white/40">Inflow vs outflow · last 30 days</Text>
            </LinearGradient>

            {/* Quick actions */}
            <View className="mt-6 flex-row" style={{ gap: 8 }}>
              <QuickAction
                icon="paper-plane"
                label="Send"
                tint={gradients.navy}
                onPress={() => navigation.navigate('Transfer', { walletId: mainWallet?.id })}
                disabled={!mainWallet}
              />
              <QuickAction
                icon="add"
                label="Fund"
                tint={gradients.navy}
                onPress={() => mainWallet && navigation.navigate('Fund', { walletId: mainWallet.id })}
                disabled={!mainWallet}
              />
              <QuickAction
                icon="arrow-down"
                label="Withdraw"
                tint={gradients.navy}
                onPress={() => mainWallet && navigation.navigate('Withdraw', { walletId: mainWallet.id })}
                disabled={!mainWallet}
              />
              <QuickAction
                icon="wallet"
                label="New"
                tint={gradients.navy}
                onPress={() => navigation.navigate('CreateWallet')}
              />
            </View>

            {/* Active loan */}
            {activeLoan ? (
              <View className="mt-6 rounded-3xl bg-navy p-4" style={shadow.card}>
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                    <Ionicons name="cash-outline" size={22} color={colors.brandGlow} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                      Loan outstanding
                    </Text>
                    <Text className="mt-0.5 text-xl font-extrabold text-white">
                      {formatMoney(activeLoan.outstanding)}
                    </Text>
                  </View>
                </View>
                <View className="mt-3 flex-row" style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      selection();
                      navigation.navigate('Repay', { loanId: activeLoan.loan_id });
                    }}
                    className="flex-1 items-center rounded-2xl bg-brand py-3 active:opacity-80"
                  >
                    <Text className="text-[13px] font-bold text-white">Repay</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      selection();
                      navigation.navigate('LoanDetail', { loanId: activeLoan.loan_id });
                    }}
                    className="flex-1 items-center rounded-2xl bg-white/15 py-3 active:opacity-80"
                  >
                    <Text className="text-[13px] font-bold text-white">View</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Governance surfaces */}
            {pendingApprovals > 0 ? (
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('Approvals', { scope: 'to_me' });
                }}
                className="mt-6 flex-row items-center rounded-3xl bg-navy p-4 active:opacity-90"
                style={shadow.card}
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                  <Ionicons name="shield-checkmark" size={22} color={colors.brandGlow} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[15px] font-bold text-white">
                    {pendingApprovals} approval{pendingApprovals === 1 ? '' : 's'} waiting
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-white/60">Review spends that need your sign-off</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.brandGlow} />
              </Pressable>
            ) : null}

            {inviteCount > 0 ? (
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('Invitations');
                }}
                className="mt-3 flex-row items-center rounded-3xl bg-white p-4 active:opacity-90"
                style={shadow.card}
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-lav-soft">
                  <Ionicons name="mail-open-outline" size={22} color={colors.navy} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[15px] font-bold text-ink">
                    {inviteCount} wallet invitation{inviteCount === 1 ? '' : 's'}
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-muted">Someone invited you to collaborate</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.faded} />
              </Pressable>
            ) : null}

            {/* Verify identity prompt */}
            {canUpgradeKyc ? (
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('Kyc');
                }}
                className="mt-6 flex-row items-center rounded-3xl bg-navy p-4 active:opacity-90"
                style={shadow.card}
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                  <Ionicons name="shield-checkmark" size={22} color={colors.brandGlow} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[15px] font-bold text-white">Verify your identity</Text>
                  <Text className="mt-0.5 text-[13px] text-white/60">
                    Verify Tier {nextKycTier} to raise your limits
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.brandGlow} />
              </Pressable>
            ) : null}

            {/* Patria Lending entry point */}
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Loans');
              }}
              className="mt-6 flex-row items-center rounded-3xl bg-white p-4 active:opacity-90"
              style={shadow.card}
            >
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 44, width: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="cash-outline" size={20} color={colors.white} />
              </LinearGradient>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-bold text-ink">Patria Lending</Text>
                <Text className="mt-0.5 text-[13px] text-muted">Borrow for rent, school fees & more</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faded} />
            </Pressable>

            {/* Projects & escrow */}
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Projects');
              }}
              className="mt-3 flex-row items-center rounded-3xl bg-white p-4 active:opacity-90"
              style={shadow.card}
            >
              <LinearGradient
                colors={gradients.navy}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 44, width: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="briefcase" size={20} color={colors.brandGlow} />
              </LinearGradient>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-bold text-ink">Projects</Text>
                <Text className="mt-0.5 text-[13px] text-muted">Escrow-backed milestone projects</Text>
              </View>
              {pendingSubmissions > 0 ? (
                <View className="mr-2 rounded-full bg-success-soft px-2.5 py-1">
                  <Text className="text-[11px] font-bold text-brand">{pendingSubmissions} to review</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={20} color={colors.faded} />
            </Pressable>

            {/* Recent activity */}
            <View className="mt-7 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink">Recent activity</Text>
              <Pressable onPress={() => navigation.navigate('Activity')} className="active:opacity-70" hitSlop={6}>
                <Text className="text-sm font-semibold text-brand">View all</Text>
              </Pressable>
            </View>

            <View className="mt-3" style={{ gap: 10 }}>
              {data.recent_transactions.length === 0 ? (
                <EmptyState
                  title="No transactions yet"
                  message="Fund your wallet to see activity here."
                  icon="swap-vertical-outline"
                />
              ) : (
                data.recent_transactions.map((t) => <TxnRow key={t.id} txn={t} />)
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
