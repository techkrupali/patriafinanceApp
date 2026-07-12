import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { TxnRow } from '../../components/TxnRow';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { useWallet, useWalletTransactions } from '../../api/hooks';
import { formatMoney, initials } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

const typeLabel: Record<string, string> = { main: 'MAIN', shared: 'SHARED', project: 'PROJECT' };

function ActionButton({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center active:opacity-70">
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-lav">
        <Text className="text-xl text-navy">{glyph}</Text>
      </View>
      <Text className="mt-2 text-xs font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

export function WalletDetailScreen({ navigation, route }: RootScreenProps<'WalletDetail'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const txns = useWalletTransactions(walletId);

  const wallet = detail.data?.wallet;
  const members = detail.data?.members ?? [];
  const allTxns = txns.data?.pages.flatMap((p) => p.transactions) ?? [];

  const refresh = () => {
    void detail.refetch();
    void txns.refetch();
  };

  return (
    <Screen>
      <Header title={wallet?.name ?? 'Wallet'} />

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#001736" />
        </View>
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={refresh} />
      ) : wallet ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={detail.isRefetching}
              onRefresh={refresh}
              tintColor="#001736"
            />
          }
        >
          {/* Balance hero */}
          <View
            className="rounded-3xl bg-navy p-5"
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
                {typeLabel[wallet.type] ?? wallet.type.toUpperCase()} WALLET
              </Text>
              <View className="rounded-full bg-white/10 px-2.5 py-1">
                <Text className="text-[10px] font-bold tracking-wider text-brand-glow">
                  {wallet.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text className="mt-2 text-4xl font-bold text-white">{formatMoney(wallet.balance)}</Text>

            {wallet.virtual_account ? (
              <View className="mt-4 flex-row items-center self-start rounded-full bg-white/10 px-3.5 py-1.5">
                <Text className="text-xs font-semibold text-white">
                  {wallet.virtual_account}
                  {wallet.virtual_account_bank ? ` · ${wallet.virtual_account_bank}` : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Actions */}
          <View className="mt-6 flex-row" style={{ gap: 8 }}>
            <ActionButton glyph="＋" label="Fund" onPress={() => navigation.navigate('Fund', { walletId })} />
            <ActionButton glyph="↓" label="Withdraw" onPress={() => navigation.navigate('Withdraw', { walletId })} />
            <ActionButton glyph="↗" label="Transfer" onPress={() => navigation.navigate('Transfer', { walletId })} />
          </View>

          {/* Members */}
          {wallet.type !== 'main' && members.length > 0 ? (
            <>
              <Text className="mt-7 text-base font-bold text-ink">Members</Text>
              <Card className="mt-3 px-4 py-1">
                {members.map((m, i) => (
                  <View key={m.user_id}>
                    <View className="flex-row items-center py-3">
                      <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-lav-soft">
                        <Text className="text-xs font-bold text-navy">{initials(m.name)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-[15px] font-semibold text-ink">{m.name}</Text>
                        <Text className="text-xs text-faded">{m.email}</Text>
                      </View>
                      <View className="rounded-full bg-lav-faint px-2.5 py-1">
                        <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
                          {m.role}
                        </Text>
                      </View>
                    </View>
                    {i < members.length - 1 ? (
                      <View style={{ height: 1, backgroundColor: '#eff4ff' }} />
                    ) : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* Transactions */}
          <Text className="mt-7 text-base font-bold text-ink">Transactions</Text>
          <View className="mt-3" style={{ gap: 10 }}>
            {txns.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#001736" />
              </View>
            ) : txns.error ? (
              <LoadError message={(txns.error as Error).message} onRetry={() => txns.refetch()} />
            ) : allTxns.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                message="Fund this wallet to see its history here."
                glyph="⇅"
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
                    className="items-center rounded-2xl bg-lav py-3.5 active:opacity-80"
                  >
                    {txns.isFetchingNextPage ? (
                      <ActivityIndicator color="#001736" />
                    ) : (
                      <Text className="text-sm font-semibold text-navy">Load more</Text>
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
