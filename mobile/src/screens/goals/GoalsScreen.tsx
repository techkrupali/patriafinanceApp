import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useWallets } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import type { Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const GOAL_TYPES = ['savings', 'goal', 'emergency', 'giving'];

function GoalCard({ wallet, onPress }: { wallet: Wallet; onPress: () => void }) {
  const visual = walletVisual(wallet.type);
  const balance = parseFloat(wallet.balance || '0');
  const target = parseFloat(wallet.target_amount ?? '');
  const hasTarget = Number.isFinite(target) && target > 0;
  const rawPct = hasTarget ? (balance / target) * 100 : 0;
  const pct = Math.min(100, rawPct);
  const fillWidth = Math.max(3, pct);
  const reached = hasTarget && rawPct >= 100;

  return (
    <Card className="mt-3" onPress={onPress}>
      <View className="flex-row items-center">
        <LinearGradient
          colors={visual.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { height: 44, width: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
            shadow.soft,
          ]}
        >
          <Ionicons name={visual.icon} size={20} color={colors.white} />
        </LinearGradient>
        <View className="ml-3 flex-1 pr-2">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {wallet.name}
          </Text>
        </View>
        <View className="rounded-full bg-lav-faint px-2.5 py-1">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">{visual.label}</Text>
        </View>
      </View>

      {hasTarget ? (
        <View className="mt-4">
          <View className="h-2.5 overflow-hidden rounded-full bg-lav">
            <View className="h-2.5 rounded-full bg-brand" style={{ width: `${fillWidth}%` }} />
          </View>
          <View className="mt-2.5 flex-row items-center justify-between">
            <Text className="flex-1 pr-2 text-[13px] text-muted" numberOfLines={1}>
              {formatMoney(wallet.balance)} of {formatMoney(wallet.target_amount)}
            </Text>
            <Text className="text-[13px] font-bold text-brand">{Math.floor(pct)}%</Text>
          </View>
          {reached ? (
            <View className="mt-2.5 flex-row items-center self-start rounded-full bg-success-soft px-3 py-1.5">
              <Ionicons name="checkmark-circle" size={14} color={colors.brand} style={{ marginRight: 5 }} />
              <Text className="text-[11px] font-bold text-brand">Goal reached 🎉</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View className="mt-4">
          <Text className="text-[15px] font-extrabold tracking-tight text-ink">
            Saved {formatMoney(wallet.balance)}
          </Text>
          <Text className="mt-1 text-[13px] text-muted">No target set</Text>
        </View>
      )}
    </Card>
  );
}

export function GoalsScreen({ navigation }: RootScreenProps<'Goals'>) {
  const { data, isLoading, error, refetch, isRefetching } = useWallets();

  const goals = useMemo(
    () => (data ?? []).filter((w) => GOAL_TYPES.includes(w.type)),
    [data],
  );

  const totalSaved = useMemo(
    () => goals.reduce((sum, w) => sum + parseFloat(w.balance || '0'), 0),
    [goals],
  );

  const addAction = (
    <Pressable
      onPress={() => {
        selection();
        navigation.navigate('CreateGoal');
      }}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
      style={shadow.soft}
    >
      <Ionicons name="add" size={24} color={colors.navy} />
    </Pressable>
  );

  return (
    <Screen withBottomInset>
      <Header title="Savings goals" right={addAction} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={() => refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />
          }
        >
          {goals.length === 0 ? (
            <EmptyState
              icon="flag-outline"
              title="No savings goals yet"
              message="Create a goal and watch it grow."
              action={
                <Button title="Create a goal" icon="add" onPress={() => navigation.navigate('CreateGoal')} />
              }
            />
          ) : (
            <>
              <LinearGradient
                colors={gradients.navy}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
              >
                <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                  Total saved
                </Text>
                <Text className="mt-2 text-[40px] font-extrabold leading-tight tracking-tight text-white">
                  {formatMoney(totalSaved)}
                </Text>
                <Text className="mt-1 text-[13px] text-white/50">
                  across {goals.length} goal{goals.length === 1 ? '' : 's'}
                </Text>
              </LinearGradient>

              {goals.map((w) => (
                <GoalCard
                  key={w.id}
                  wallet={w}
                  onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
