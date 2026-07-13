import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { WalletCard } from '../components/WalletCard';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { colors } from '../theme';
import { useWallets } from '../api/hooks';
import { formatMoney } from '../lib/format';
import type { TabScreenProps } from '../navigation/types';

export function WalletsScreen({ navigation }: TabScreenProps<'Wallets'>) {
  const { data: wallets, isLoading, error, refetch, isRefetching } = useWallets();

  const total = useMemo(
    () => (wallets ?? []).reduce((sum, w) => sum + parseFloat(w.balance || '0'), 0),
    [wallets],
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />
        }
      >
        <Text className="text-3xl font-extrabold tracking-tight text-ink">Wallets</Text>
        <Text className="mt-1 text-[15px] text-muted">Your family's money, organized.</Text>

        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : (wallets ?? []).length === 0 ? (
          <>
            <EmptyState
              title="No wallets yet"
              message="Create a shared or project wallet to get started."
              icon="wallet-outline"
            />
            <Button
              title="New Wallet"
              icon="add"
              iconPosition="left"
              onPress={() => navigation.navigate('CreateWallet')}
              className="mt-2"
            />
          </>
        ) : (
          <>
            <View className="mt-5 flex-row items-center rounded-2xl bg-lav-faint p-4">
              <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white">
                <Ionicons name="albums-outline" size={20} color={colors.navy} />
              </View>
              <View className="ml-3">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Across {wallets!.length} wallet{wallets!.length === 1 ? '' : 's'}
                </Text>
                <Text className="text-xl font-extrabold tracking-tight text-ink">{formatMoney(total)}</Text>
              </View>
            </View>

            <View className="mt-5" style={{ gap: 14 }}>
              {wallets!.map((w) => (
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

            <Button
              title="New Wallet"
              icon="add"
              iconPosition="left"
              variant="secondary"
              onPress={() => navigation.navigate('CreateWallet')}
              className="mt-6"
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
