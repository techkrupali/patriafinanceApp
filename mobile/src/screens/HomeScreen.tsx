import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { TxnRow } from '../components/TxnRow';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { useDashboard } from '../api/hooks';
import { useAuth } from '../store/auth';
import { formatMoney, initials } from '../lib/format';
import type { TabScreenProps } from '../navigation/types';

function QuickAction({
  glyph,
  label,
  onPress,
  disabled,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 items-center ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-lav-soft">
        <Text className="text-xl text-navy">{glyph}</Text>
      </View>
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
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor="#001736" />
        }
      >
        {/* Greeting */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-ink">
              Hi {user?.first_name ?? 'there'} 👋
            </Text>
            <Text className="mt-0.5 text-sm text-muted">Here's your money today.</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            className="h-11 w-11 items-center justify-center rounded-full bg-navy active:opacity-80"
          >
            <Text className="text-sm font-bold text-white">{initials(user?.full_name)}</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color="#001736" />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : data ? (
          <>
            {/* Balance hero */}
            <View
              className="mt-5 rounded-3xl bg-navy p-5"
              style={{
                shadowColor: '#001736',
                shadowOpacity: 0.3,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-bold tracking-widest text-white/60">
                  TOTAL BALANCE
                </Text>
                <Pressable onPress={() => setHidden((h) => !h)} className="active:opacity-70">
                  <Text className="text-[11px] font-bold tracking-widest text-brand-glow">
                    {hidden ? 'SHOW' : 'HIDE'}
                  </Text>
                </Pressable>
              </View>
              <Text className="mt-2 text-4xl font-bold text-white">
                {hidden ? '₦ ••••••' : formatMoney(data.total_balance)}
              </Text>

              {/* Inflow / outflow bars */}
              <View className="mt-5">
                <View className="flex-row items-center">
                  <Text className="w-9 text-[10px] font-bold tracking-wider text-white/50">IN</Text>
                  <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <View
                      className="h-1.5 rounded-full bg-brand-mint"
                      style={{ width: `${Math.max((inflow / maxFlow) * 100, 2)}%` }}
                    />
                  </View>
                  <Text className="ml-3 text-xs font-semibold text-brand-glow">
                    {hidden ? '••••' : `+${formatMoney(data.inflow_30d)}`}
                  </Text>
                </View>
                <View className="mt-2.5 flex-row items-center">
                  <Text className="w-9 text-[10px] font-bold tracking-wider text-white/50">OUT</Text>
                  <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <View
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.max((outflow / maxFlow) * 100, 2)}%`,
                        backgroundColor: '#fda4af',
                      }}
                    />
                  </View>
                  <Text className="ml-3 text-xs font-semibold" style={{ color: '#fda4af' }}>
                    {hidden ? '••••' : `-${formatMoney(data.outflow_30d)}`}
                  </Text>
                </View>
                <Text className="mt-2 text-[10px] text-white/40">Last 30 days</Text>
              </View>
            </View>

            {/* Quick actions */}
            <View className="mt-6 flex-row" style={{ gap: 8 }}>
              <QuickAction
                glyph="↗"
                label="Send"
                onPress={() => navigation.navigate('Transfer', { walletId: mainWallet?.id })}
                disabled={!mainWallet}
              />
              <QuickAction
                glyph="＋"
                label="Fund"
                onPress={() => mainWallet && navigation.navigate('Fund', { walletId: mainWallet.id })}
                disabled={!mainWallet}
              />
              <QuickAction
                glyph="↓"
                label="Withdraw"
                onPress={() => mainWallet && navigation.navigate('Withdraw', { walletId: mainWallet.id })}
                disabled={!mainWallet}
              />
              <QuickAction glyph="▦" label="New Wallet" onPress={() => navigation.navigate('CreateWallet')} />
            </View>

            {/* Recent activity */}
            <View className="mt-7 flex-row items-center justify-between">
              <Text className="text-base font-bold text-ink">Recent Activity</Text>
              <Pressable onPress={() => navigation.navigate('Activity')} className="active:opacity-70">
                <Text className="text-sm font-semibold text-brand">View All</Text>
              </Pressable>
            </View>

            <View className="mt-3" style={{ gap: 10 }}>
              {data.recent_transactions.length === 0 ? (
                <EmptyState
                  title="No transactions yet"
                  message="Fund your wallet to see activity here."
                  glyph="⇅"
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
