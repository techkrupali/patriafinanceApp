import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard } from '../../components/pt/PtList';
import { PtPills } from '../../components/pt/PtForm';
import { PtRing } from '../../components/pt/PtRing';
import { useBudgetActual, type BudgetActual } from '../../api/insights';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { Empty, Legend, Loaded, Track } from './parts';

const STATE_COLOUR = { within: pt.emerald700, close: '#8F5400', used: pt.danger } as const;

/**
 * INS-04 Budget vs actual: how much of a spending wallet's budget is used
 * against how much of the month has gone, then each category with a "today" tick.
 */
export function InsightsBudgetScreen({ navigation, route }: RootScreenProps<'InsightsBudget'>) {
  const q = useBudgetActual();
  const budgets = q.data?.budgets ?? [];
  const [picked, setPicked] = useState<number | null>(route.params?.walletId ?? null);
  const b = budgets.find((x) => x.wallet_id === picked) ?? budgets[0];

  const subtitle = b
    ? `${b.name} · ${b.days_total ? `${b.days_gone} of ${b.days_total} days` : 'one budget'}`
    : null;

  return (
    <PtPageScreen title="Budget vs actual" subtitle={subtitle} onBack={() => navigation.goBack()}>
      <Loaded query={q}>
        {() =>
          !b ? (
            <Empty
              icon="sliders"
              title="No budget yet"
              body="A spending wallet with a budget shows here: each category against what's been spent, and how much of the month has gone."
              action="Make a spending wallet"
              onAction={() => navigation.navigate('SpendingWalletSetup')}
            />
          ) : (
            <>
              {budgets.length > 1 ? (
                <PtPills compact options={budgets.map((x) => ({ value: x.wallet_id, label: x.name }))} value={b.wallet_id} onChange={setPicked} />
              ) : null}
              <Summary b={b} />
              <Legend
                items={[
                  { color: STATE_COLOUR.within, label: 'Within budget' },
                  { color: STATE_COLOUR.close, label: 'Close to limit' },
                  { color: STATE_COLOUR.used, label: 'Used up' },
                  ...(b.time_percent !== null ? [{ color: pt.ink, label: 'Today' }] : []),
                ]}
              />
              <PtCard>
                {b.categories.map((c, i) => {
                  const limit = parseFloat(c.limit);
                  const spent = parseFloat(c.spent);
                  return (
                    <View key={c.id} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: i === b.categories.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`${formatNaira(c.spent)} / ${formatNaira(c.limit)}`}</Text>
                      </View>
                      <Track percent={limit > 0 ? (spent / limit) * 100 : 0} color={STATE_COLOUR[c.state]} marker={b.time_percent} />
                    </View>
                  );
                })}
                {b.categories.length === 0 ? (
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 16 }}>This budget has no categories.</Text>
                ) : null}
              </PtCard>
            </>
          )
        }
      </Loaded>
    </PtPageScreen>
  );
}

function Summary({ b }: { b: BudgetActual }) {
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <PtRing percent={b.percent} size={64} stroke={7} color={b.percent >= 100 ? pt.danger : pt.gold500} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{`${formatNaira(b.spent)} of ${formatNaira(b.amount)} spent`}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{b.pace}</Text>
      </View>
    </View>
  );
}
