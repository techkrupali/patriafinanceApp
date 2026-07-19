import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useWalletAuditLog } from '../../api/hooks';
import { timeLabel } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface EventVisual {
  icon: IconName;
  tile: string;
  color: string;
}

const EVENT_VISUAL: Record<string, EventVisual> = {
  member_added: { icon: 'person-add', tile: 'bg-success-soft', color: colors.brand },
  member_removed: { icon: 'person-remove-outline', tile: 'bg-danger-soft', color: colors.danger },
  member_role_changed: { icon: 'swap-horizontal', tile: 'bg-lav-soft', color: colors.navy },
  permissions_changed: { icon: 'options-outline', tile: 'bg-lav-soft', color: colors.navy },
  wallet_frozen: { icon: 'lock-closed', tile: 'bg-danger-soft', color: colors.danger },
  wallet_unfrozen: { icon: 'lock-open-outline', tile: 'bg-success-soft', color: colors.brand },
  access_schedule_set: { icon: 'time-outline', tile: 'bg-lav-soft', color: colors.navy },
  settings_changed: { icon: 'settings-outline', tile: 'bg-lav-soft', color: colors.navy },
  wallet_created: { icon: 'add-circle-outline', tile: 'bg-success-soft', color: colors.brand },
  large_spend: { icon: 'cash-outline', tile: 'bg-lav-faint', color: colors.gold },
};

const DEFAULT_VISUAL: EventVisual = {
  icon: 'ellipse-outline',
  tile: 'bg-lav-faint',
  color: colors.muted,
};

export function WalletAuditLogScreen({ route }: RootScreenProps<'WalletAuditLog'>) {
  const { walletId } = route.params;
  const log = useWalletAuditLog(walletId);

  const entries = log.data?.pages.flatMap((p) => p.audit_log) ?? [];

  return (
    <Screen withBottomInset>
      <Header title="Audit log" />

      {log.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : log.error ? (
        <LoadError message={(log.error as Error).message} onRetry={() => log.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={log.isRefetching} onRefresh={() => log.refetch()} tintColor={colors.navy} />
          }
        >
          <Text className="text-sm text-muted">Every change to this wallet, newest first.</Text>

          {entries.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No activity yet"
              message="Changes to members, permissions and locks will appear here."
            />
          ) : (
            <>
              <Card className="mt-3 py-1">
                {entries.map((entry, i) => {
                  const visual = EVENT_VISUAL[entry.event] ?? DEFAULT_VISUAL;
                  return (
                    <View key={entry.id}>
                      <View className="flex-row items-center py-3">
                        <View className={`mr-3 h-11 w-11 items-center justify-center rounded-2xl ${visual.tile}`}>
                          <Ionicons name={visual.icon} size={20} color={visual.color} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-[15px] font-semibold text-ink">{entry.description}</Text>
                          <Text className="mt-0.5 text-xs text-faded">
                            {(entry.actor?.name ?? 'System') + ' · ' + timeLabel(entry.created_at)}
                          </Text>
                        </View>
                      </View>
                      {i < entries.length - 1 ? (
                        <View style={{ height: 1, backgroundColor: colors.border }} />
                      ) : null}
                    </View>
                  );
                })}
              </Card>

              {log.hasNextPage ? (
                <Pressable
                  onPress={() => void log.fetchNextPage()}
                  disabled={log.isFetchingNextPage}
                  className="mt-3 items-center rounded-2xl bg-lav-soft py-3.5 active:opacity-80"
                >
                  {log.isFetchingNextPage ? (
                    <ActivityIndicator color={colors.navy} />
                  ) : (
                    <Text className="text-sm font-semibold text-navy">Load more</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
