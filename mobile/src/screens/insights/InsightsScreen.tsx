import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtSegmented } from '../../components/pt/PtForm';
import { useInsights, type InsightsOverview, type InsightsRange } from '../../api/insights';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { Legend, Loaded, StatPair } from './parts';

const IN = pt.emerald500;
const OUT = pt.gold500;
const OVER = pt.danger;

/**
 * INS-01 Insights: Month · 6 months · Year; what came in and went out, a bar
 * for each month (or week), and the four insights under it.
 */
export function InsightsScreen({ navigation }: RootScreenProps<'Insights'>) {
  const [range, setRange] = useState<InsightsRange>('6m');
  const q = useInsights(range);
  const d = q.data;

  const when = range === 'month' ? ' this month' : range === 'year' ? ' this year' : ', last 6 months';
  const left = d ? parseFloat(d.left) : 0;

  return (
    <PtPageScreen title="Insights" subtitle={d ? `${d.scope} · ${d.period}` : null} onBack={() => navigation.goBack()}>
      <PtSegmented
        options={[
          { value: 'month', label: 'Month' },
          { value: '6m', label: '6 months' },
          { value: 'year', label: 'Year' },
        ]}
        value={range}
        onChange={setRange}
      />

      <Loaded query={q}>
        {() =>
          d ? (
            <>
              <StatPair
                dark={{ label: `In${when}`, value: formatNaira(d.in), note: d.in_note }}
                light={{
                  label: `Out${when}`,
                  value: formatNaira(d.out),
                  note: left >= 0 ? `${formatNaira(left)} left over` : `${formatNaira(-left)} more out than in`,
                  noteColor: left >= 0 ? pt.inkMuted : pt.danger,
                }}
              />
              <Legend
                items={[
                  { color: IN, label: 'Money in' },
                  { color: OUT, label: 'Money out' },
                  { color: OVER, label: 'Out more than in' },
                ]}
              />
              <Bars bars={d.bars} />

              <PtCard>
                <PtRow
                  title="Where the money went"
                  subtitle={d.lines.categories}
                  left={<PtIconTile><Feather name="pie-chart" size={18} color={pt.brand} /></PtIconTile>}
                  chevron
                  onPress={() => navigation.navigate('InsightsCategories')}
                />
                <PtRow
                  title="Budget vs actual"
                  subtitle={d.lines.budget ?? 'No budget yet'}
                  left={<PtIconTile><Feather name="sliders" size={18} color={pt.brand} /></PtIconTile>}
                  chevron
                  onPress={() => navigation.navigate('InsightsBudget')}
                />
                <PtRow
                  title="Savings forecast"
                  subtitle={d.lines.forecast}
                  left={<PtIconTile><Feather name="trending-up" size={18} color={pt.brand} /></PtIconTile>}
                  chevron
                  onPress={() => navigation.navigate('InsightsForecast')}
                />
                <PtRow
                  title="Who put in what"
                  subtitle={d.lines.contributions ?? 'No shared wallets yet'}
                  left={<PtIconTile><Feather name="users" size={18} color={pt.brand} /></PtIconTile>}
                  chevron
                  onPress={() => navigation.navigate('InsightsContributions')}
                />
                <PtRow
                  title="Wallet report"
                  subtitle="One wallet since it opened"
                  left={<PtIconTile><Feather name="clipboard" size={18} color={pt.brand} /></PtIconTile>}
                  chevron
                  last
                  onPress={() => navigation.navigate('InsightsWallet')}
                />
              </PtCard>
            </>
          ) : null
        }
      </Loaded>
    </PtPageScreen>
  );
}

/** Money in and out side by side for each month; out turns red when it's more than in. */
function Bars({ bars }: { bars: InsightsOverview['bars'] }) {
  const values = bars.flatMap((b) => [parseFloat(b.in), parseFloat(b.out)]);
  const max = Math.max(0, ...values);
  const height = 132;
  const many = bars.length > 8;

  return (
    <View
      style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 8 }}
      accessibilityLabel={bars.map((b) => `${b.label}: ${formatNaira(b.in)} in, ${formatNaira(b.out)} out`).join('. ')}
    >
      {max === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center', paddingVertical: 48 }}>No money moved in this time.</Text>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          {/* The baseline under the bars. */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: height, height: 1, backgroundColor: pt.line }} />
          {bars.map((b) => {
            const i = parseFloat(b.in);
            const o = parseFloat(b.out);
            const h = (v: number) => (v > 0 ? Math.max(3, Math.round((v / max) * (height - 6))) : 0);
            return (
              <View key={b.key} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
                <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: many ? 2 : 4 }}>
                  <View style={{ width: many ? 7 : 16, height: h(i), backgroundColor: IN, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                  <View style={{ width: many ? 7 : 16, height: h(o), backgroundColor: o > i ? OVER : OUT, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                </View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: many ? 10 : 12, color: pt.inkMuted, textAlign: 'center' }} numberOfLines={1}>
                  {many ? b.label.slice(0, 1) : b.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
