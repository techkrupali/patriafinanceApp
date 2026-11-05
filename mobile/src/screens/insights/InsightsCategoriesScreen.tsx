import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard } from '../../components/pt/PtList';
import { CATEGORY_COLOURS, useInsightCategories, type CategoriesData } from '../../api/insights';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';
import { Empty, Loaded, nairaShort } from './parts';

/**
 * INS-02 Spending by category: a ring of the month's spending, then each
 * category with its share and how it moved since the month before.
 */
export function InsightsCategoriesScreen({ navigation, route }: RootScreenProps<'InsightsCategories'>) {
  const [month, setMonth] = useState<string | null>(route.params?.month ?? null);
  const q = useInsightCategories(month);
  const d = q.data;

  return (
    <PtPageScreen title="Spending by category" subtitle={d ? `${d.label} · ${d.scope}` : null} onBack={() => navigation.goBack()}>
      {d ? <MonthSwitch d={d} onChange={setMonth} /> : null}
      <Loaded query={q}>
        {() =>
          !d ? null : d.categories.length === 0 ? (
            <Empty icon="pie-chart" title={`Nothing spent in ${d.label}`} body="Payments out of your wallets show here by what they were for. Moving money between your own wallets doesn't count." />
          ) : (
            <>
              <Donut d={d} />
              <PtCard>
                {d.categories.map((c, i) => {
                  const change = c.change === null || Math.abs(c.change) < 5 ? null : c.change > 0 ? `up ${c.change}%` : `down ${-c.change}%`;
                  return (
                    <View
                      key={c.key}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i === d.categories.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
                    >
                      <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: CATEGORY_COLOURS[c.key] }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{c.name}</Text>
                        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkMuted }}>{[`${c.percent}%`, change].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(c.amount)}</Text>
                    </View>
                  );
                })}
              </PtCard>
            </>
          )
        }
      </Loaded>
    </PtPageScreen>
  );
}

/** ‹ October 2026 › */
function MonthSwitch({ d, onChange }: { d: CategoriesData; onChange: (m: string) => void }) {
  const arrow = (to: string | null, icon: 'chevron-left' | 'chevron-right', label: string) => (
    <Pressable
      onPress={() => {
        if (!to) return;
        selection();
        onChange(to);
      }}
      disabled={!to}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: to ? 1 : 0.3 }}
    >
      <Feather name={icon} size={22} color={pt.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {arrow(d.previous, 'chevron-left', 'Month before')}
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink, minWidth: 140, textAlign: 'center' }}>{`${d.label} ${d.year}`}</Text>
      {arrow(d.next, 'chevron-right', 'Month after')}
    </View>
  );
}

/** The month's spending as a ring, a slice per category, the total in the middle. */
function Donut({ d }: { d: CategoriesData }) {
  const size = 160;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = d.categories.reduce((s, x) => s + parseFloat(x.amount), 0) || 1;
  const gap = d.categories.length > 1 ? 2 : 0;
  let at = 0;

  return (
    <View style={{ alignItems: 'center', paddingVertical: 8 }} accessibilityLabel={`${d.label}: ${formatNaira(d.total)} spent`}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          {d.categories.map((x) => {
            const len = (parseFloat(x.amount) / total) * c;
            const slice = (
              <Circle
                key={x.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={CATEGORY_COLOURS[x.key]}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`}
                strokeDashoffset={-at}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            at += len;
            return slice;
          })}
        </Svg>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{d.label}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{nairaShort(d.total)}</Text>
      </View>
    </View>
  );
}
