import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
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
import {
  useAutomations,
  useUpdateAutomation,
  useRunAutomation,
  useDeleteAutomation,
} from '../../api/hooks';
import { formatMoney, timeLabel } from '../../lib/format';
import { selection, notifySuccess } from '../../lib/haptics';
import type { AutomationRule } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function AutomationCard({ rule }: { rule: AutomationRule }) {
  const update = useUpdateAutomation(rule.id);
  const run = useRunAutomation();
  const remove = useDeleteAutomation();

  const toggleEnabled = (v: boolean) => {
    selection();
    update.mutate({ enabled: v });
  };

  const runNow = () => {
    run.mutate(rule.id, {
      onSuccess: (d) => {
        notifySuccess();
        Alert.alert(
          d.result.status === 'ran' ? 'Automation ran' : 'Skipped',
          d.result.status === 'ran'
            ? `Moved ${d.result.amount ? '₦' + d.result.amount : ''} to ${rule.to_wallet.name}.`
            : d.result.reason || 'Nothing to do.',
        );
      },
      onError: (e) => Alert.alert('Could not run', e.message),
    });
  };

  const confirmDelete = () => {
    selection();
    Alert.alert('Delete automation', `Remove "${rule.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(rule.id, {
            onSuccess: () => notifySuccess(),
            onError: (e) => Alert.alert('Could not delete', e.message),
          }),
      },
    ]);
  };

  return (
    <Card className="mt-3">
      {/* Header row */}
      <View className="flex-row items-center">
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { height: 44, width: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
            shadow.soft,
          ]}
        >
          <Ionicons name="flash" size={20} color={colors.white} />
        </LinearGradient>
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {rule.name}
          </Text>
          <Text className="text-xs text-faded" numberOfLines={1}>
            {rule.enabled ? 'Active' : 'Paused'}
          </Text>
        </View>
        <Switch
          value={rule.enabled}
          onValueChange={toggleEnabled}
          trackColor={{ false: colors.border, true: colors.brand }}
          thumbColor={colors.white}
        />
      </View>

      {/* Route */}
      <View className="mt-4 flex-row items-center rounded-2xl bg-lav-faint px-4 py-3">
        <View className="flex-1 pr-2">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-faded">From</Text>
          <Text className="mt-0.5 text-[13px] font-semibold text-ink" numberOfLines={1}>
            {rule.from_wallet.name}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={colors.brand} style={{ marginHorizontal: 6 }} />
        <View className="flex-1 items-end pl-2">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-faded">To</Text>
          <Text className="mt-0.5 text-[13px] font-semibold text-ink" numberOfLines={1}>
            {rule.to_wallet.name}
          </Text>
        </View>
      </View>

      {/* Amount + schedule */}
      <View className="mt-4 flex-row items-end justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">
            {formatMoney(rule.amount)}
          </Text>
          <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
            {rule.next_run_hint}
          </Text>
        </View>
      </View>

      {/* Meta chips */}
      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
        {rule.min_balance ? (
          <View className="flex-row items-center rounded-full bg-lav-faint px-2.5 py-1">
            <Ionicons name="shield-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Keep ≥ {formatMoney(rule.min_balance)}
            </Text>
          </View>
        ) : null}
        {rule.last_run_at ? (
          <View className="flex-row items-center rounded-full bg-lav-faint px-2.5 py-1">
            <Ionicons name="time-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Last run {timeLabel(rule.last_run_at)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Actions */}
      <View className="mt-4 flex-row items-center" style={{ gap: 10 }}>
        <View className="flex-1">
          <Button title="Run now" icon="play" variant="secondary" onPress={runNow} loading={run.isPending} />
        </View>
        <Pressable
          onPress={confirmDelete}
          hitSlop={8}
          disabled={remove.isPending}
          className="h-14 w-14 items-center justify-center rounded-[18px] bg-danger-soft active:opacity-80"
        >
          {remove.isPending ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          )}
        </Pressable>
      </View>
    </Card>
  );
}

export function AutomationsScreen({ navigation }: RootScreenProps<'Automations'>) {
  const { data, isLoading, error, refetch, isRefetching } = useAutomations();
  const rules = data ?? [];

  const addAction = (
    <Pressable
      onPress={() => {
        selection();
        navigation.navigate('CreateAutomation');
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
      <Header title="Rules" right={addAction} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.navy} />
          }
        >
          <Text className="text-[15px] leading-5 text-muted">
            Move money automatically on a schedule — allowances, savings, auto-funding.
          </Text>

          {rules.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon="flash-outline"
              title="No automations yet"
              message="Create a rule to move money on a schedule."
              action={
                <Button
                  title="New automation"
                  icon="add"
                  onPress={() => navigation.navigate('CreateAutomation')}
                />
              }
            />
          ) : (
            rules.map((rule) => <AutomationCard key={rule.id} rule={rule} />)
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
