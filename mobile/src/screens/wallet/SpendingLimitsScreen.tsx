import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtChip } from '../../components/pt/PtChip';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtGroupLabel, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useBudget, useBudgetActions, useWallet } from '../../api/hooks';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { joinNames } from '../../lib/goalPlan';
import { selection } from '../../lib/haptics';
import type { BudgetCategoryRow, BudgetDetail } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const firstName = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/**
 * WAL-09 "Spending limits": what's gone from each category this period, which
 * are nearly or fully used, and each spender's daily limit — owners edit both.
 */
export function SpendingLimitsScreen({ navigation, route }: RootScreenProps<'SpendingLimits'>) {
  const { walletId } = route.params;
  const wallet = useWallet(walletId);
  const budget = useBudget(walletId);
  const b = budget.data;
  const canEdit = ['owner', 'co_owner'].includes(wallet.data?.wallet.my_role ?? '');
  const [category, setCategory] = useState<BudgetCategoryRow | null>(null);
  const [spender, setSpender] = useState<BudgetDetail['spenders'][number] | null>(null);

  const start = b ? new Date(`${b.period_start}T00:00:00`) : null;
  const periodName = b?.period === 'monthly' && start ? MONTHS[(start.getMonth() + (start.getDate() > 15 ? 1 : 0)) % 12] : b?.period === 'weekly' ? 'This week' : 'So far';

  return (
    <PtPageScreen title="Spending limits" subtitle={wallet.data ? `${wallet.data.wallet.name} · ${periodName}` : null} onBack={() => navigation.goBack()}>
      {budget.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : budget.isError || !b ? (
        <LoadError message={(budget.error as Error | null)?.message} onRetry={() => void budget.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 15, color: pt.inkMuted }}>Spent so far</Text>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>
              {formatNaira(b.spent)} <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>of {formatNaira(b.amount)}</Text>
            </Text>
          </View>

          <PtPanel>
            {b.categories.map((c, i) => {
              const spent = parseFloat(c.spent);
              const limit = parseFloat(c.limit);
              const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
              const used = pct >= 100;
              const near = !used && pct >= 80;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => canEdit && setCategory(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}, ${formatNaira(spent)} of ${formatNaira(limit)}`}
                  style={{ paddingVertical: 12, gap: 8, borderBottomWidth: i === b.categories.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }}>{c.name}</Text>
                    {used ? <PtChip label="Used up" tone="danger" icon="x" /> : near ? <PtChip label={`${pct}%`} tone="warning" icon="clock" /> : null}
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.line, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, pct)}%`, height: 6, backgroundColor: used ? pt.danger : near ? '#8F5400' : pt.emerald700 }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{formatNaira(spent)} spent</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Limit {formatNaira(limit)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </PtPanel>

          <View style={{ gap: 10 }}>
            <PtGroupLabel>Daily limits</PtGroupLabel>
            <PtPanel>
              {b.spenders
                .filter((s) => s.daily_limit || s.categories)
                .map((s) => (
                  <PtReviewRow
                    key={`${s.user_id ?? s.name}`}
                    label={`${s.name ?? 'Someone'}${s.pending ? ' · invited' : ''}`}
                    value={`${s.daily_limit ? `${formatNaira(s.daily_limit)} a day` : 'No daily limit'}${s.categories ? ` · ${s.categories.join(', ')} only` : ''}`}
                    onEdit={canEdit && !s.pending ? () => setSpender(s) : undefined}
                  />
                ))}
              <PtReviewRow
                label={joinNames(
                  [firstName(wallet.data?.wallet.owner?.name ?? 'You'), ...b.spenders.filter((s) => !s.daily_limit && !s.categories && !s.pending).map((s) => firstName(s.name))].filter(
                    (n, i, all) => n && all.indexOf(n) === i,
                  ),
                )}
                value="No daily limit"
                last
              />
            </PtPanel>
          </View>
          {b.over_limit === 'approve' ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Over a limit, a payment waits for an owner's yes.</Text>
          ) : (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Nothing goes over a limit.</Text>
          )}
        </>
      )}

      {b ? <CategoryLimitSheet walletId={walletId} category={category} budget={b} onClose={() => setCategory(null)} /> : null}
      {b ? <SpenderLimitSheet walletId={walletId} spender={spender} budget={b} onClose={() => setSpender(null)} /> : null}
    </PtPageScreen>
  );
}

function CategoryLimitSheet({ walletId, category, budget, onClose }: { walletId: number; category: BudgetCategoryRow | null; budget: BudgetDetail; onClose: () => void }) {
  const actions = useBudgetActions(walletId);
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<BudgetCategoryRow | null>(null);
  if (category !== openedFor) {
    setOpenedFor(category);
    setLimit(category ? String(parseFloat(category.limit)) : '');
    setError(null);
  }
  const others = budget.categories.filter((c) => c.id !== category?.id).reduce((sum, c) => sum + parseFloat(c.limit), 0);
  return (
    <PtSheet
      visible={Boolean(category)}
      title={category?.name ?? ''}
      subtitle={`Up to ${formatNaira(parseFloat(budget.amount) - others)} fits in the budget`}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtButton
            title="Save limit"
            loading={actions.setLimit.isPending}
            onPress={() =>
              category &&
              actions.setLimit.mutate({ categoryId: category.id, limit }, { onSuccess: onClose, onError: (e) => setError(e.message) })
            }
          />
        </>
      }
    >
      <PtField label="Limit" prefix="₦" value={groupAmountInput(limit)} onChangeText={(t) => setLimit(sanitizeAmountInput(t))} keyboardType="decimal-pad" />
    </PtSheet>
  );
}

function SpenderLimitSheet({
  walletId,
  spender,
  budget,
  onClose,
}: {
  walletId: number;
  spender: BudgetDetail['spenders'][number] | null;
  budget: BudgetDetail;
  onClose: () => void;
}) {
  const actions = useBudgetActions(walletId);
  const [allowed, setAllowed] = useState<number[] | null>(null);
  const [daily, setDaily] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<typeof spender>(null);
  if (spender !== openedFor) {
    setOpenedFor(spender);
    setAllowed(spender?.categories ? budget.categories.filter((c) => spender.categories?.includes(c.name)).map((c) => c.id) : null);
    setDaily(spender?.daily_limit ? String(parseFloat(spender.daily_limit)) : '');
    setError(null);
  }
  const all = budget.categories.map((c) => c.id);
  const toggle = (id: number) => {
    const current = allowed ?? all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setAllowed(next.length === all.length ? null : next);
  };
  return (
    <PtSheet
      visible={Boolean(spender)}
      title={spender?.name ?? ''}
      subtitle="What they can spend on, and how much a day"
      onClose={onClose}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtButton
            title="Save"
            loading={actions.setSpender.isPending}
            onPress={() =>
              spender &&
              spender.user_id !== null &&
              actions.setSpender.mutate(
                { userId: spender.user_id, categories: allowed, daily_limit: Number(daily) > 0 ? daily : null },
                { onSuccess: onClose, onError: (e) => setError(e.message) },
              )
            }
          />
        </>
      }
    >
      <PtPanel>
        {budget.categories.map((c, i) => {
          const on = (allowed ?? all).includes(c.id);
          return (
            <View key={c.id} style={{ borderBottomWidth: i === budget.categories.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <Pressable
                onPress={() => {
                  selection();
                  toggle(c.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.name}
                style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: ptRadius.sm }}
              >
                <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{c.name}</Text>
                <PtCheckbox checked={on} />
              </Pressable>
            </View>
          );
        })}
      </PtPanel>
      <PtField label="Daily limit (optional)" prefix="₦" value={groupAmountInput(daily)} onChangeText={(t) => setDaily(sanitizeAmountInput(t))} placeholder="No daily limit" keyboardType="decimal-pad" />
    </PtSheet>
  );
}
