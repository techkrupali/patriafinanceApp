import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, shadow } from '../../theme';
import { useApprovals } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import {
  approvalActionIcon,
  approvalActionLabel,
  approvalStatusVisual,
  statusIconColor,
} from '../../lib/governance';
import { selection } from '../../lib/haptics';
import type { ApprovalRequest } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Scope = 'to_me' | 'mine';

function ApprovalCard({ approval, scope, onPress }: { approval: ApprovalRequest; scope: Scope; onPress: () => void }) {
  const status = approvalStatusVisual(approval.status);
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="rounded-3xl bg-white p-4 active:opacity-90"
      style={shadow.soft}
    >
      <View className="flex-row items-center">
        <View className="mr-3.5 h-11 w-11 items-center justify-center rounded-2xl bg-lav">
          <Ionicons name={approvalActionIcon(approval.action)} size={22} color={colors.navy} />
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {approvalActionLabel(approval.action)}
          </Text>
          <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
            {approval.wallet?.name}
            {scope === 'to_me' && approval.initiator?.name ? ` · by ${approval.initiator.name}` : ''}
          </Text>
        </View>
        <Text className="text-[15px] font-extrabold text-ink">{formatMoney(approval.amount)}</Text>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
          <Ionicons name={status.icon} size={12} color={statusIconColor(status)} style={{ marginRight: 4 }} />
          <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
        </View>
        <Text className="text-xs font-semibold text-muted">
          {approval.approvals_count}/{approval.required_approvals} approvals
        </Text>
      </View>
    </Pressable>
  );
}

export function ApprovalsScreen({ navigation, route }: RootScreenProps<'Approvals'>) {
  const [scope, setScope] = useState<Scope>(route.params?.scope ?? 'to_me');
  const query = useApprovals(scope);
  const approvals = query.data ?? [];

  return (
    <Screen>
      <Header title="Approvals" />

      {/* Segments */}
      <View className="mx-5 mt-1 flex-row rounded-2xl bg-lav-faint p-1">
        {(['to_me', 'mine'] as Scope[]).map((s) => {
          const active = scope === s;
          return (
            <Pressable
              key={s}
              onPress={() => {
                selection();
                setScope(s);
              }}
              className={`flex-1 items-center rounded-xl py-2.5 ${active ? 'bg-white' : ''}`}
              style={active ? shadow.soft : undefined}
            >
              <Text className={`text-[13px] font-bold ${active ? 'text-navy' : 'text-muted'}`}>
                {s === 'to_me' ? 'To approve' : 'Mine'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
        }
      >
        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : approvals.length === 0 ? (
          <EmptyState
            title={scope === 'to_me' ? 'Nothing to approve' : 'No requests yet'}
            message={
              scope === 'to_me'
                ? 'Spends that need your approval will show up here.'
                : "Spends you submit that need approval will show up here."
            }
            icon="shield-checkmark-outline"
          />
        ) : (
          <View style={{ gap: 12 }}>
            {approvals.map((a) => (
              <ApprovalCard
                key={a.id}
                approval={a}
                scope={scope}
                onPress={() => navigation.navigate('ApprovalDetail', { approvalId: a.id })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
