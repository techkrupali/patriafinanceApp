import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCard } from '../../components/pt/PtList';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtPills, PtSegmented } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { useStatementWallets, type BatchPeriod } from '../../api/insights';
import { formatNaira, formatYmd, toYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';
import { Loaded } from './parts';

/**
 * STM-01 Download statements: tick wallets, choose the period, one combined
 * file or one per wallet, then "Make 4 statements".
 */
export function StatementsPickScreen({ navigation, route }: RootScreenProps<'StatementsPick'>) {
  const wallets = useStatementWallets();
  const list = wallets.data?.wallets ?? [];
  const today = toYmd(new Date());
  const preset = route.params;
  const [chosen, setChosen] = useState<number[] | null>(preset?.walletIds ?? null);
  const [period, setPeriod] = useState<BatchPeriod>(preset?.from ? 'custom' : 'this_year');
  const [from, setFrom] = useState(preset?.from ?? toYmd(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(preset?.to ?? today);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [combined, setCombined] = useState(false);

  // Until something is ticked: Main and the three open wallets holding the most.
  const ids =
    chosen ??
    [
      ...list.filter((w) => w.type === 'main'),
      ...list
        .filter((w) => w.type !== 'main' && w.status !== 'closed')
        .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))
        .slice(0, 3),
    ].map((w) => w.id);
  const all = list.length > 0 && ids.length === list.length;
  const toggle = (id: number) => setChosen(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const files = combined ? Math.min(1, ids.length) : ids.length;

  const make = () =>
    navigation.navigate('StatementsReady', {
      walletIds: list.filter((w) => ids.includes(w.id)).map((w) => w.id),
      period,
      from: period === 'custom' ? from : null,
      to: period === 'custom' ? to : null,
      combined: combined && ids.length > 1,
    });

  return (
    <PtPageScreen
      title="Download statements"
      subtitle="Per wallet or all together"
      onBack={() => navigation.goBack()}
      footer={<PtButton title={files === 1 ? 'Make 1 statement' : `Make ${files} statements`} onPress={make} disabled={ids.length === 0} />}
    >
      <Loaded query={wallets}>
        {() => (
          <>
            <View style={{ gap: 10 }}>
              <PtGroupLabel>Wallets</PtGroupLabel>
              <PtCard>
                {list.map((w, i) => {
                  const on = ids.includes(w.id);
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => {
                        selection();
                        toggle(w.id);
                      }}
                      // A "checkbox" role stops the gesture-handler press on the web; ApprovalRules ticks the same way.
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={w.name}
                    >
                      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                        <PtCheckbox checked={on} />
                        <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }} numberOfLines={1}>
                          {w.name}
                        </Text>
                        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{w.status === 'closed' ? 'Closed' : formatNaira(w.balance)}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </PtCard>
              {list.length > 1 ? (
                <Pressable
                  onPress={() => {
                    selection();
                    setChosen(all ? [] : list.map((w) => w.id));
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{all ? 'Clear all' : `Select all ${list.length}`}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ gap: 12 }}>
              <PtGroupLabel>Period</PtGroupLabel>
              <PtPills
                options={[
                  { value: 'last_month', label: 'Last month' },
                  { value: 'last_3_months', label: 'Last 3 months' },
                  { value: 'this_year', label: 'This year' },
                  { value: 'custom', label: 'Pick dates' },
                ]}
                value={period}
                onChange={setPeriod}
              />
              {period === 'custom' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <PtField label="From" value={formatYmd(from)} editable={false} onPressBox={() => setPicking('from')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PtField label="To" value={formatYmd(to)} editable={false} onPressBox={() => setPicking('to')} />
                  </View>
                </View>
              ) : null}
            </View>

            {ids.length > 1 ? (
              <PtSegmented
                options={[
                  { value: 'combined', label: 'One combined file' },
                  { value: 'each', label: 'One per wallet' },
                ]}
                value={combined ? 'combined' : 'each'}
                onChange={(v) => setCombined(v === 'combined')}
              />
            ) : null}
          </>
        )}
      </Loaded>

      <PtDateSheet
        visible={picking !== null}
        title={picking === 'from' ? 'From' : 'To'}
        value={picking === 'from' ? from : to}
        minYear={2024}
        maxYear={new Date().getFullYear()}
        doneLabel="Done"
        onDone={(ymd) => {
          if (picking === 'from') setFrom(ymd > to ? to : ymd);
          else setTo(ymd > today ? today : ymd < from ? from : ymd);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </PtPageScreen>
  );
}
