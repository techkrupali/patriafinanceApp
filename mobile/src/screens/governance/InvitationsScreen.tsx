import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { ErrorText } from '../../components/ErrorText';
import { colors, shadow } from '../../theme';
import { useAcceptInvitation, useDeclineInvitation, useMyInvitations } from '../../api/hooks';
import { walletVisual } from '../../lib/walletVisual';
import { roleLabel } from '../../lib/governance';
import { selection } from '../../lib/haptics';
import type { WalletInvitation } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

export function InvitationsScreen({ navigation }: RootScreenProps<'Invitations'>) {
  const query = useMyInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const [actingId, setActingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invitations = query.data ?? [];

  const onAccept = (inv: WalletInvitation) => {
    selection();
    setError(null);
    setActingId(inv.id);
    accept.mutate(inv.id, {
      onSuccess: (data) => {
        setActingId(null);
        navigation.navigate('WalletDetail', { walletId: data.wallet.id });
      },
      onError: (e) => {
        setActingId(null);
        setError(e.message);
      },
    });
  };

  const onDecline = (inv: WalletInvitation) => {
    selection();
    setError(null);
    setActingId(inv.id);
    decline.mutate(inv.id, {
      onSettled: () => setActingId(null),
      onError: (e) => setError(e.message),
    });
  };

  return (
    <Screen>
      <Header title="Invitations" />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
        }
      >
        <ErrorText message={error} className="mb-3" />

        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : invitations.length === 0 ? (
          <EmptyState
            title="No invitations"
            message="When someone invites you to a wallet, it'll appear here."
            icon="mail-open-outline"
          />
        ) : (
          <View style={{ gap: 14 }}>
            {invitations.map((inv) => {
              const v = walletVisual(inv.wallet?.type);
              const busy = actingId === inv.id;
              return (
                <View key={inv.id} className="rounded-3xl bg-white p-5" style={shadow.card}>
                  <View className="flex-row items-center">
                    <LinearGradient
                      colors={v.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ height: 46, width: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name={v.icon} size={22} color={v.onDark ? colors.white : colors.navy} />
                    </LinearGradient>
                    <View className="ml-3 flex-1">
                      <Text className="text-[16px] font-bold text-ink" numberOfLines={1}>
                        {inv.wallet?.name ?? 'A wallet'}
                      </Text>
                      <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
                        {inv.inviter?.name ? `Invited by ${inv.inviter.name}` : 'You have an invitation'}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                    <View className="rounded-full bg-lav-faint px-2.5 py-1">
                      <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
                        {roleLabel(inv.role)}
                      </Text>
                    </View>
                    {inv.can_approve ? (
                      <View className="flex-row items-center rounded-full bg-success-soft px-2.5 py-1">
                        <Ionicons name="shield-checkmark" size={12} color={colors.brand} style={{ marginRight: 4 }} />
                        <Text className="text-[11px] font-bold text-brand">Approver</Text>
                      </View>
                    ) : null}
                  </View>

                  <View className="mt-4 flex-row" style={{ gap: 10 }}>
                    <Pressable
                      onPress={() => onDecline(inv)}
                      disabled={busy}
                      className={`flex-1 items-center justify-center rounded-2xl bg-lav py-3.5 ${
                        busy ? 'opacity-50' : 'active:opacity-80'
                      }`}
                    >
                      <Text className="text-[15px] font-semibold text-navy">Decline</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onAccept(inv)}
                      disabled={busy}
                      className={`flex-1 items-center justify-center rounded-2xl bg-navy py-3.5 ${
                        busy ? 'opacity-60' : 'active:opacity-90'
                      }`}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text className="text-[15px] font-semibold text-white">Accept</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
