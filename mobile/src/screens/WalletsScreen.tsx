import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { WalletCard } from '../components/WalletCard';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { colors, gradients, shadow } from '../theme';
import { useMe, useWallets } from '../api/hooks';
import { formatMoney, initials } from '../lib/format';
import { selection } from '../lib/haptics';
import type { Wallet } from '../api/types';
import type { TabScreenProps } from '../navigation/types';

type TreasuryFilter = 'active' | 'locked' | 'archived';

const FILTERS: { key: TreasuryFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'locked', label: 'Locked' },
  { key: 'archived', label: 'Archived' },
];

/** Which filter strip bucket a wallet falls into, from its real status. */
function bucketOf(w: Wallet): TreasuryFilter {
  const st = (w.status || 'active').toLowerCase();
  if (st === 'active') return 'active';
  if (st === 'archived' || st === 'closed') return 'archived';
  return 'locked';
}

function isGoalWallet(w: Wallet): boolean {
  const target = parseFloat(w.target_amount ?? '');
  return (Number.isFinite(target) && target > 0) || w.type === 'goal' || w.type === 'savings';
}

export function WalletsScreen({ navigation }: TabScreenProps<'Treasury'>) {
  const { data: wallets, isLoading, error, refetch, isRefetching } = useWallets();
  const me = useMe();
  const [filter, setFilter] = useState<TreasuryFilter>('active');

  const stats = useMemo(() => {
    const list = wallets ?? [];
    let total = 0;
    let available = 0;
    let locked = 0;
    let goals = 0;
    let goalCount = 0;
    for (const w of list) {
      const bal = parseFloat(w.balance || '0');
      const safe = Number.isFinite(bal) ? bal : 0;
      total += safe;
      if (bucketOf(w) !== 'active') {
        locked += safe;
      } else if (isGoalWallet(w)) {
        goals += safe;
        goalCount += 1;
      } else {
        available += safe;
      }
    }
    return { total, available, locked, goals, goalCount };
  }, [wallets]);

  const visible = useMemo(
    () => (wallets ?? []).filter((w) => bucketOf(w) === filter),
    [wallets, filter],
  );

  const walletCount = wallets?.length ?? 0;
  const commitLine =
    stats.goalCount > 0
      ? `You’re on track with ${stats.goalCount} active commitment${stats.goalCount === 1 ? '' : 's'}`
      : `${walletCount} wallet${walletCount === 1 ? '' : 's'} in your family treasury`;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />
        }
      >
        {/* Greeting header */}
        <View className="flex-row items-center">
          <LinearGradient
            colors={gradients.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              height: 44,
              width: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#FFCC00',
            }}
          >
            <Text className="text-[13px] font-bold text-white">{initials(me.data?.full_name)}</Text>
          </LinearGradient>
          <View className="ml-3 flex-1">
            <Text className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Family Treasury
            </Text>
            <Text className="text-[22px] font-extrabold leading-tight tracking-tight text-ink" numberOfLines={1}>
              {me.data?.first_name ? `Hello, ${me.data.first_name}` : 'Treasury'}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : (wallets ?? []).length === 0 ? (
          <EmptyState
            title="No wallets yet"
            message="Create a shared or project wallet to get started."
            icon="wallet-outline"
            action={
              <Button
                title="New Wallet"
                icon="add"
                iconPosition="left"
                onPress={() => navigation.navigate('CreateWallet')}
              />
            }
          />
        ) : (
          <>
            {/* Total Family Treasury — refined navy balance card */}
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ marginTop: 20, borderRadius: 28, padding: 24, overflow: 'hidden' }, shadow.hero]}
            >
              {/* Decorative gold wash */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -64,
                  right: -64,
                  height: 192,
                  width: 192,
                  borderRadius: 96,
                  backgroundColor: 'rgba(241,193,0,0.10)',
                }}
              />

              <View className="flex-row items-center">
                <Ionicons name="wallet-outline" size={15} color="rgba(255,255,255,0.9)" style={{ marginRight: 8 }} />
                <Text className="text-sm font-medium text-white/80">Total Family Treasury</Text>
              </View>

              <Text className="mt-4 text-[34px] font-extrabold leading-tight tracking-tight text-white">
                {formatMoney(stats.total)}
              </Text>

              {/* Breakdown row */}
              <View
                className="mt-7 flex-row items-center justify-between py-4"
                style={{
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: 'rgba(255,255,255,0.10)',
                }}
              >
                <View>
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-white/60">Available</Text>
                  <Text className="mt-1 text-sm font-bold text-white">{formatMoney(stats.available)}</Text>
                </View>
                <View className="items-center">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-white/60">Locked</Text>
                  <Text className="mt-1 text-sm font-bold text-white/60">{formatMoney(stats.locked)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-[10px] font-bold uppercase tracking-wider text-white/60">Goals</Text>
                  <Text className="mt-1 text-sm font-bold text-white">{formatMoney(stats.goals)}</Text>
                </View>
              </View>

              <View className="mt-5 flex-row items-center">
                <View className="mr-2 h-2 w-2 rounded-full bg-brand-glow" />
                <Text className="text-xs font-medium italic text-white/90" numberOfLines={1}>
                  {commitLine}
                </Text>
              </View>
            </LinearGradient>

            {/* Filter strip */}
            <View className="mt-6 flex-row" style={{ gap: 10 }}>
              {FILTERS.map((f) => {
                const selected = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => {
                      selection();
                      setFilter(f.key);
                    }}
                    className={`rounded-full px-6 py-2.5 active:opacity-80 ${
                      selected ? 'bg-[#FFCC00]' : 'bg-lav-soft'
                    }`}
                    style={selected ? shadow.soft : undefined}
                  >
                    <Text className={`text-xs font-bold ${selected ? 'text-[#6F5700]' : 'text-muted'}`}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Wallet list */}
            {visible.length === 0 ? (
              <View className="mt-5 items-center rounded-2xl bg-lav-faint p-6">
                <Text className="text-sm font-medium text-muted">No {filter} wallets.</Text>
              </View>
            ) : (
              <View className="mt-5" style={{ gap: 14 }}>
                {visible.map((w) => (
                  <WalletCard
                    key={w.id}
                    wallet={w}
                    onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                    onFund={() => navigation.navigate('Fund', { walletId: w.id })}
                    onWithdraw={() => navigation.navigate('Withdraw', { walletId: w.id })}
                    onSend={() => navigation.navigate('Transfer', { walletId: w.id })}
                  />
                ))}
              </View>
            )}

            {/* Create New Wallet CTA */}
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('CreateWallet');
              }}
              className="mt-8 flex-row items-center justify-center rounded-2xl bg-[#FFCC00] py-5 active:opacity-90"
              style={shadow.gold}
            >
              <Ionicons name="add" size={20} color="#6F5700" style={{ marginRight: 8 }} />
              <Text className="text-[15px] font-extrabold text-[#6F5700]">Create New Wallet</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
