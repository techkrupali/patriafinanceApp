import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useCancelLoan, useLoan } from '../../api/hooks';
import { statusIconColor } from '../../lib/governance';
import { dayLabel, formatMoney } from '../../lib/format';
import {
  frequencyLabel,
  isRepayable,
  loanCategoryLabel,
  loanStatusVisual,
  repaymentStatusVisual,
  scheduleDate,
} from '../../lib/loans';
import type { LoanRepayment } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function ScheduleRow({ item, last }: { item: LoanRepayment; last: boolean }) {
  const status = repaymentStatusVisual(item.status);
  return (
    <View
      className="flex-row items-center py-3.5"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-lav-soft">
        <Text className="text-xs font-bold text-navy">{item.sequence}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink">{formatMoney(item.amount_due)}</Text>
        <Text className="mt-0.5 text-xs text-faded">Due {scheduleDate(item.due_date)}</Text>
      </View>
      <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
        <Ionicons name={status.icon} size={12} color={statusIconColor(status)} style={{ marginRight: 4 }} />
        <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
      </View>
    </View>
  );
}

export function LoanDetailScreen({ navigation, route }: RootScreenProps<'LoanDetail'>) {
  const { loanId } = route.params;
  const query = useLoan(loanId);
  const cancel = useCancelLoan(loanId);

  const loan = query.data?.loan;
  const repayments = query.data?.repayments ?? [];
  const status = loan ? loanStatusVisual(loan.status) : null;
  const penalty = parseFloat(loan?.penalty_accrued ?? '0');
  const pct = loan ? Math.max(0, Math.min(loan.progress_pct, 100)) : 0;

  const canRepay = Boolean(loan && isRepayable(loan.status));
  const canCancel = loan?.status === 'pending';

  const confirmCancel = () => {
    Alert.alert('Cancel loan', 'Withdraw this loan application?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel loan',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(undefined, {
            onError: (e) => Alert.alert('Could not cancel', e.message),
          }),
      },
    ]);
  };

  return (
    <Screen withBottomInset>
      <Header title="Loan" />

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : query.error ? (
        <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : loan && status ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
          }
        >
          {/* Hero */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                {loanCategoryLabel(loan.category)}
              </Text>
              <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
                <Ionicons name={status.icon} size={12} color={statusIconColor(status)} style={{ marginRight: 4 }} />
                <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
              </View>
            </View>
            <Text className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight text-white">
              {formatMoney(loan.principal)}
            </Text>
            <Text className="mt-1 text-[13px] text-white/60">
              {formatMoney(loan.total_repayable)} total repayable
            </Text>

            <View className="mt-4">
              <View className="h-2 overflow-hidden rounded-full bg-white/15">
                <View className="h-2 rounded-full bg-brand-mint" style={{ width: `${Math.max(pct, 2)}%` }} />
              </View>
              <View className="mt-1.5 flex-row items-center justify-between">
                <Text className="text-[11px] text-white/70">{Math.floor(pct)}% repaid</Text>
                <Text className="text-[11px] font-semibold text-brand-glow">
                  {formatMoney(loan.outstanding)} left
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Details */}
          <Card className="mt-5 py-1">
            <DetailRow label="Outstanding" value={formatMoney(loan.outstanding)} />
            <Divider />
            <DetailRow label="Total repayable" value={formatMoney(loan.total_repayable)} />
            {penalty > 0 ? (
              <>
                <Divider />
                <DetailRow label="Penalty accrued" value={formatMoney(loan.penalty_accrued)} danger />
              </>
            ) : null}
            <Divider />
            <DetailRow label="Tenor" value={`${loan.tenor_days} days`} />
            <Divider />
            <DetailRow label="Frequency" value={frequencyLabel(loan.repayment_frequency)} />
            {loan.due_at ? (
              <>
                <Divider />
                <DetailRow label="Due date" value={dayLabel(loan.due_at)} />
              </>
            ) : null}
            {loan.disbursed_at ? (
              <>
                <Divider />
                <DetailRow label="Disbursed" value={dayLabel(loan.disbursed_at)} />
              </>
            ) : null}
            {loan.purpose ? (
              <>
                <Divider />
                <DetailRow label="Purpose" value={loan.purpose} />
              </>
            ) : null}
            <Divider />
            <DetailRow label="Reference" value={loan.reference} />
          </Card>

          {/* Actions */}
          {canRepay ? (
            <Button
              title="Repay"
              icon="arrow-up-circle-outline"
              iconPosition="left"
              onPress={() => navigation.navigate('Repay', { loanId })}
              className="mt-6"
            />
          ) : null}
          {canCancel ? (
            <Button
              title="Cancel application"
              variant="danger"
              icon="ban-outline"
              iconPosition="left"
              onPress={confirmCancel}
              loading={cancel.isPending}
              className="mt-3"
            />
          ) : null}

          {/* Repayment schedule */}
          <Text className="mt-8 text-lg font-bold text-ink">Repayment schedule</Text>
          {repayments.length === 0 ? (
            <EmptyState
              title="No schedule yet"
              message="A repayment schedule appears once the loan is disbursed."
              icon="calendar-outline"
              className="mt-1"
            />
          ) : (
            <Card className="mt-3 py-1">
              {repayments.map((r, i) => (
                <ScheduleRow key={r.id} item={r} last={i === repayments.length - 1} />
              ))}
            </Card>
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function DetailRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</Text>
      <Text
        className={`ml-4 flex-1 text-right text-[15px] font-semibold ${danger ? 'text-danger' : 'text-ink'}`}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
