import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, shadow } from '../../theme';
import { useDisputes } from '../../api/hooks';
import { timeLabel } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { Dispute, DisputeStatus } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface StatusVisual {
  label: string;
  bg: string;
  text: string;
  icon: IconName;
}

const STATUS_VISUAL: Record<DisputeStatus, StatusVisual> = {
  open: { label: 'Open', bg: 'bg-lav-faint', text: 'text-muted', icon: 'time-outline' },
  under_review: { label: 'Under review', bg: 'bg-lav-soft', text: 'text-navy', icon: 'hourglass-outline' },
  resolved: { label: 'Resolved', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-circle' },
  rejected: { label: 'Rejected', bg: 'bg-danger-soft', text: 'text-danger', icon: 'close-circle' },
};

const PILL_ICON: Record<string, string> = {
  'text-muted': colors.muted,
  'text-navy': colors.navy,
  'text-brand': colors.brand,
  'text-danger': colors.danger,
};

function statusVisual(status: DisputeStatus | string): StatusVisual {
  return STATUS_VISUAL[status as DisputeStatus] ?? STATUS_VISUAL.open;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function DisputeCard({ dispute }: { dispute: Dispute }) {
  const v = statusVisual(dispute.status);
  return (
    <Card className="mt-3">
      <View className="flex-row items-start">
        <Text className="flex-1 pr-3 text-[15px] font-bold text-ink">{dispute.subject}</Text>
        <View className={`flex-row items-center rounded-full px-2.5 py-1 ${v.bg}`}>
          <Ionicons name={v.icon} size={12} color={PILL_ICON[v.text] ?? colors.muted} style={{ marginRight: 4 }} />
          <Text className={`text-[10px] font-bold uppercase tracking-wider ${v.text}`}>{v.label}</Text>
        </View>
      </View>

      <View className="mt-2.5 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <View className="rounded-full bg-lav-faint px-2.5 py-1">
          <Text className="text-[11px] font-semibold text-muted">{capitalize(dispute.category)}</Text>
        </View>
        {dispute.reference ? (
          <Text className="text-[12px] tracking-wider text-faded">Ref: {dispute.reference}</Text>
        ) : null}
      </View>

      <Text className="mt-2.5 text-[13px] leading-5 text-muted" numberOfLines={3}>
        {dispute.description}
      </Text>

      {dispute.status === 'resolved' && dispute.resolution ? (
        <View className="mt-3 rounded-2xl bg-success-soft p-3.5">
          <Text className="text-[13px] leading-5 text-navy">
            <Text className="font-bold">Resolution: </Text>
            {dispute.resolution}
          </Text>
        </View>
      ) : null}

      <Text className="mt-3 text-xs text-faded">{timeLabel(dispute.created_at)}</Text>
    </Card>
  );
}

export function DisputesScreen({ navigation }: RootScreenProps<'Disputes'>) {
  const query = useDisputes();
  const items = query.data?.pages.flatMap((p) => p.disputes) ?? [];

  const openRaise = () => {
    selection();
    navigation.navigate('RaiseDispute');
  };

  const right = (
    <Pressable
      onPress={openRaise}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
      style={shadow.soft}
    >
      <Ionicons name="add" size={24} color={colors.navy} />
    </Pressable>
  );

  return (
    <Screen>
      <Header title="Dispute Center" right={right} />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.navy}
          />
        }
      >
        <Text className="text-[15px] leading-5 text-muted">
          Report a problem with a payment or project — we'll look into it.
        </Text>

        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError
            message={(query.error as Error).message}
            onRetry={() => query.refetch()}
            className="mt-6"
          />
        ) : items.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon="checkmark-done-circle-outline"
            title="No disputes"
            message="If something goes wrong with a payment, raise it here."
            action={<Button title="Raise a dispute" icon="add" onPress={openRaise} />}
          />
        ) : (
          <View>
            {items.map((d) => (
              <DisputeCard key={d.id} dispute={d} />
            ))}

            {query.hasNextPage ? (
              <Pressable
                onPress={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="mt-3 items-center rounded-2xl bg-lav-soft py-3.5 active:opacity-80"
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
