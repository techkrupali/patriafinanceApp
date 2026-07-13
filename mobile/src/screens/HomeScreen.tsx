import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { IconTile } from '../components/IconTile';
import { TxnRow } from '../components/TxnRow';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { colors } from '../theme';
import { useDashboard } from '../api/hooks';
import { useAuth } from '../store/auth';
import { formatMoney, initials } from '../lib/format';
import { selection } from '../lib/haptics';
import type { TabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const user = useAuth((s) => s.user);
  const { data, isLoading, error, refetch, isRefetching } = useDashboard();
  const [hidden, setHidden] = useState(false);

  const mainWallet = useMemo(
    () => data?.wallets.find((w) => w.type === 'main') ?? data?.wallets[0],
    [data],
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />
        }
      >
        {/* Greeting */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Pressable onPress={() => navigation.navigate('Profile')} className="active:opacity-80">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-lav-soft">
                <Text className="text-sm font-semibold text-brand">{initials(user?.full_name)}</Text>
              </View>
            </Pressable>
            <View className="ml-3">
              <Text className="text-[13px] text-muted">Welcome back</Text>
              <Text className="text-lg font-semibold text-ink">Hi, {user?.first_name ?? 'there'}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Activity')}
            className="h-11 w-11 items-center justify-center rounded-full bg-lav-faint active:opacity-80"
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>

        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : data ? (
          <>
            {/* Balance panel */}
            <View className="mt-6 rounded-[20px] bg-lav-faint p-5">
              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] text-muted">Total balance</Text>
                <Pressable
                  onPress={() => {
                    selection();
                    setHidden((h) => !h);
                  }}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.brand} />
                </Pressable>
              </View>
              <Text className="mt-1 text-[34px] font-bold leading-tight tracking-tight text-ink">
                {hidden ? '₦ • • • • • •' : formatMoney(data.total_balance)}
              </Text>

              {/* Slim inflow / outflow */}
              <View className="mt-4 flex-row" style={{ gap: 24 }}>
                <View className="flex-row items-center">
                  <Ionicons name="arrow-down" size={14} color={colors.brand} style={{ marginRight: 5 }} />
                  <View>
                    <Text className="text-[11px] text-muted">In · 30d</Text>
                    <Text className="text-[13px] font-semibold text-brand">
                      {hidden ? '••••' : `+${formatMoney(data.inflow_30d)}`}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="arrow-up" size={14} color={colors.muted} style={{ marginRight: 5 }} />
                  <View>
                    <Text className="text-[11px] text-muted">Out · 30d</Text>
                    <Text className="text-[13px] font-semibold text-ink">
                      {hidden ? '••••' : `-${formatMoney(data.outflow_30d)}`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Quick actions */}
            <View className="mt-6 flex-row" style={{ gap: 8 }}>
              <IconTile
                icon="paper-plane-outline"
                label="Send"
                onPress={() => navigation.navigate('Transfer', { walletId: mainWallet?.id })}
                disabled={!mainWallet}
              />
              <IconTile
                icon="add-outline"
                label="Fund"
                onPress={() => mainWallet && navigation.navigate('Fund', { walletId: mainWallet.id })}
                disabled={!mainWallet}
              />
              <IconTile
                icon="arrow-down-outline"
                label="Withdraw"
                onPress={() => mainWallet && navigation.navigate('Withdraw', { walletId: mainWallet.id })}
                disabled={!mainWallet}
              />
              <IconTile
                icon="wallet-outline"
                label="New wallet"
                onPress={() => navigation.navigate('CreateWallet')}
              />
            </View>

            {/* AI teaser */}
            <Pressable
              onPress={() => navigation.navigate('AI')}
              className="mt-6 flex-row items-center rounded-[20px] bg-lav-faint p-4 active:opacity-90"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-lav-soft">
                <Ionicons name="sparkles-outline" size={20} color={colors.brand} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-medium text-ink">Smart suggestions</Text>
                <Text className="mt-0.5 text-[13px] text-muted">Ask Patriai AI about your money</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faded} />
            </Pressable>

            {/* Recent activity */}
            <View className="mt-7 flex-row items-center justify-between">
              <Text className="text-xl font-semibold text-ink">Recent activity</Text>
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
