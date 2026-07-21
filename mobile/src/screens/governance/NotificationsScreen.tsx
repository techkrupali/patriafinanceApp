import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, shadow } from '../../theme';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../api/hooks';
import { timeLabel } from '../../lib/format';
import { notificationVisual, numFromData } from '../../lib/governance';
import { selection } from '../../lib/haptics';
import type { AppNotification } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

export function NotificationsScreen({ navigation }: RootScreenProps<'Notifications'>) {
  const query = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const notifications = query.data?.pages.flatMap((p) => p.notifications) ?? [];
  const hasUnread = notifications.some((n) => !n.read);

  const onPress = (n: AppNotification) => {
    selection();
    if (!n.read) markRead.mutate(n.id);

    const approvalId = numFromData(n.data, ['approval_request_id', 'approval_id']);
    const invitationId = numFromData(n.data, ['invitation_id']);
    const walletId = numFromData(n.data, ['wallet_id']);
    const type = String(n.type);

    if (approvalId || type.startsWith('approval')) {
      if (approvalId) navigation.navigate('ApprovalDetail', { approvalId });
      else navigation.navigate('Approvals');
      return;
    }
    if (invitationId || type.startsWith('invitation')) {
      navigation.navigate('Invitations');
      return;
    }
    // The user was removed from this wallet — it's no longer accessible, so never
    // deep-link into it. Send them to their wallets list instead.
    if (type === 'wallet_member_removed') {
      navigation.navigate('Tabs', { screen: 'Treasury' });
      return;
    }
    // A transfer landed: open the receiving wallet if we know it, else Activity.
    if (type === 'transfer_received') {
      if (walletId) navigation.navigate('WalletDetail', { walletId });
      else navigation.navigate('Activity');
      return;
    }
    // admin_message / transaction_reversed / admin_adjustment and any other
    // wallet-scoped notice: open the wallet when there is one, otherwise no-op.
    if (walletId) {
      navigation.navigate('WalletDetail', { walletId });
    }
  };

  const markAllRight = hasUnread ? (
    <Pressable
      onPress={() => {
        selection();
        markAll.mutate();
      }}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
      style={shadow.soft}
    >
      <Ionicons name="checkmark-done" size={20} color={colors.brand} />
    </Pressable>
  ) : undefined;

  return (
    <Screen>
      <Header title="Notifications" right={markAllRight} />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
        }
      >
        {hasUnread ? (
          <Pressable
            onPress={() => {
              selection();
              markAll.mutate();
            }}
            className="mb-3 flex-row items-center justify-end active:opacity-70"
            hitSlop={6}
          >
            <Ionicons name="checkmark-done" size={15} color={colors.brand} style={{ marginRight: 5 }} />
            <Text className="text-[13px] font-semibold text-brand">Mark all read</Text>
          </Pressable>
        ) : null}

        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            message="Approvals, invitations and transfers will show up here."
            icon="notifications-outline"
          />
        ) : (
          <View style={{ gap: 10 }}>
            {notifications.map((n) => {
              const v = notificationVisual(n.type, colors);
              return (
                <Pressable
                  key={n.id}
                  onPress={() => onPress(n)}
                  className={`flex-row items-center rounded-3xl p-4 active:opacity-90 ${
                    n.read ? 'bg-white' : 'bg-lav-faint'
                  }`}
                  style={shadow.soft}
                >
                  <View className={`mr-3.5 h-11 w-11 items-center justify-center rounded-2xl ${v.tile}`}>
                    <Ionicons name={v.icon} size={22} color={v.color} />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text
                      className={`text-[15px] ${n.read ? 'font-semibold text-ink' : 'font-bold text-ink'}`}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    {n.body ? (
                      <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={2}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text className="mt-1 text-[11px] text-faded">{timeLabel(n.created_at)}</Text>
                  </View>
                  {!n.read ? <View className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
                </Pressable>
              );
            })}

            {query.hasNextPage ? (
              <Pressable
                onPress={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="items-center rounded-2xl bg-lav py-3.5 active:opacity-80"
              >
                {query.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.navy} />
                ) : (
                  <Text className="text-sm font-semibold text-navy">Load more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
