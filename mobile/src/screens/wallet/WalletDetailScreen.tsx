import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { TxnRow } from '../../components/TxnRow';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useWallet, useWalletTransactions } from '../../api/hooks';
import { formatMoney, initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { WalletType } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const HERO: Record<WalletType, { label: string }> = {
  main: { label: 'MAIN' },
  shared: { label: 'SHARED' },
  project: { label: 'PROJECT' },
};

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="flex-1 items-center active:opacity-70"
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-lav-soft">
        <Ionicons name={icon} size={22} color={colors.brand} />
      </View>
      <Text className="mt-2 text-xs font-medium text-ink">{label}</Text>
    </Pressable>
  );
}

export function WalletDetailScreen({ navigation, route }: RootScreenProps<'WalletDetail'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const txns = useWalletTransactions(walletId);
  const [copied, setCopied] = useState(false);

  const wallet = detail.data?.wallet;
  const members = detail.data?.members ?? [];
  const allTxns = txns.data?.pages.flatMap((p) => p.transactions) ?? [];
  const hero = wallet ? HERO[wallet.type] ?? HERO.main : HERO.main;

  const refresh = () => {
    void detail.refetch();
    void txns.refetch();
  };

  const copyAccount = async () => {
    if (!wallet?.virtual_account) return;
    selection();
    await Clipboard.setStringAsync(wallet.virtual_account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Screen>
      <Header title={wallet?.name ?? 'Wallet'} />

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={refresh} />
      ) : wallet ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} tintColor={colors.brand} />
          }
        >
          {/* Balance panel */}
          <View className="rounded-[20px] bg-lav-faint p-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] font-medium uppercase tracking-wider text-muted">
                {hero.label} Wallet
              </Text>
              <View className="rounded-full bg-white px-2.5 py-1">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                  {wallet.status}
                </Text>
              </View>
            </View>
            <Text className="mt-2 text-[36px] font-bold leading-tight tracking-tight text-ink">
              {formatMoney(wallet.balance)}
            </Text>

            {wallet.virtual_account ? (
              <Pressable
                onPress={() => void copyAccount()}
                className="mt-4 flex-row items-center self-start rounded-2xl bg-white px-3.5 py-2 active:opacity-80"
              >
                <Ionicons name="card-outline" size={15} color={colors.brand} style={{ marginRight: 7 }} />
                <Text className="text-[13px] font-medium text-ink">
                  {wallet.virtual_account}
                  {wallet.virtual_account_bank ? ` · ${wallet.virtual_account_bank}` : ''}
                </Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={15}
                  color={colors.brand}
                  style={{ marginLeft: 8 }}
                />
              </Pressable>
            ) : null}
          </View>

          {/* Actions */}
          <View className="mt-6 flex-row" style={{ gap: 8 }}>
            <ActionButton icon="add" label="Fund" onPress={() => navigation.navigate('Fund', { walletId })} />
            <ActionButton icon="arrow-down" label="Withdraw" onPress={() => navigation.navigate('Withdraw', { walletId })} />
            <ActionButton icon="paper-plane" label="Transfer" onPress={() => navigation.navigate('Transfer', { walletId })} />
          </View>

          {/* Members */}
          {wallet.type !== 'main' && members.length > 0 ? (
            <>
              <Text className="mt-7 text-xl font-semibold text-ink">Members</Text>
              <Card className="mt-3 py-1">
                {members.map((m, i) => (
                  <View key={m.user_id}>
                    <View className="flex-row items-center py-3">
                      <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-lav-soft">
                        <Text className="text-xs font-semibold text-brand">{initials(m.name)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-[15px] font-medium text-ink">{m.name}</Text>
                        <Text className="text-xs text-muted">{m.email}</Text>
                      </View>
                      <View className="rounded-full bg-white px-2.5 py-1">
                        <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted">{m.role}</Text>
                      </View>
                    </View>
                    {i < members.length - 1 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* Transactions */}
          <Text className="mt-7 text-xl font-semibold text-ink">Transactions</Text>
          <View className="mt-3" style={{ gap: 10 }}>
            {txns.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : txns.error ? (
              <LoadError message={(txns.error as Error).message} onRetry={() => txns.refetch()} />
            ) : allTxns.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                message="Fund this wallet to see its history here."
                icon="swap-vertical-outline"
              />
            ) : (
              <>
                {allTxns.map((t) => (
                  <TxnRow key={t.id} txn={t} />
                ))}
                {txns.hasNextPage ? (
                  <Pressable
                    onPress={() => void txns.fetchNextPage()}
                    disabled={txns.isFetchingNextPage}
                    className="items-center rounded-2xl bg-lav-soft py-3.5 active:opacity-80"
                  >
                    {txns.isFetchingNextPage ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <Text className="text-sm font-semibold text-brand">Load more</Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}
