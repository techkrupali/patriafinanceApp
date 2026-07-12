import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { WalletCard } from '../components/WalletCard';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { useWallets } from '../api/hooks';
import type { TabScreenProps } from '../navigation/types';

export function WalletsScreen({ navigation }: TabScreenProps<'Wallets'>) {
  const { data: wallets, isLoading, error, refetch, isRefetching } = useWallets();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor="#001736" />
        }
      >
        <Text className="text-2xl font-bold text-ink">Wallets</Text>
        <Text className="mt-1 text-sm text-muted">Your family's money, organized.</Text>

        {isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color="#001736" />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : (
          <>
            <View className="mt-5" style={{ gap: 12 }}>
              {(wallets ?? []).length === 0 ? (
                <EmptyState
                  title="No wallets yet"
                  message="Create a shared or project wallet to get started."
                  glyph="▤"
                />
              ) : (
                (wallets ?? []).map((w) => (
                  <WalletCard
                    key={w.id}
                    wallet={w}
                    onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                  />
                ))
              )}
            </View>

            <Button
              title="+ New Wallet"
              onPress={() => navigation.navigate('CreateWallet')}
              className="mt-6"
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
