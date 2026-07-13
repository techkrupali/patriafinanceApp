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
import { useDashboard } from '../api/hooks';
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
  const [hidden, setHidden] = useState(false);

  const mainWallet = useMemo(
    () => data?.wallets.find((w) => w.type === 'main') ?? data?.wallets[0],
    [data],
  );

  const inflow = parseFloat(data?.inflow_30d ?? '0');
  const outflow = parseFloat(data?.outflow_30d ?? '0');
  const maxFlow = Math.max(inflow, outflow, 1);

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
            onPress={() => navigation.navigate('Activity')}
            className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-80"
            style={shadow.soft}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
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

            {/* AI teaser */}
            <Pressable
              onPress={() => navigation.navigate('AI')}
              className="mt-6 flex-row items-center rounded-3xl bg-white p-4 active:opacity-90"
              style={shadow.card}
            >
              <LinearGradient
                colors={gradients.avatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 44, width: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="sparkles" size={20} color={colors.brandGlow} />
              </LinearGradient>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-bold text-ink">Smart suggestions</Text>
                <Text className="mt-0.5 text-[13px] text-muted">Ask Patriai AI about your money</Text>
              </View>
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
