import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard } from '../../components/pt/PtList';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { useForecast, type ForecastGoal } from '../../api/insights';
import { formatYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';
import { Empty, Loaded, nairaShort } from './parts';

function Status({ g }: { g: ForecastGoal }) {
  switch (g.status) {
    case 'reached':
      return <PtChip label="Reached" tone="success" icon="check" />;
    case 'on_track':
    case 'no_date':
      return <PtChip label="On track" tone="success" icon="check" />;
    case 'short':
      return <PtChip label={`${nairaShort(g.short)} short`} tone="warning" icon="clock" />;
    default:
      return <PtChip label={parseFloat(g.balance) > 0 ? 'No date' : 'Not started'} />;
  }
}

/**
 * INS-05 Savings forecast: "If you keep saving like this", where each goal
 * lands by its date, and what Steward would do about the one that's short.
 */
export function InsightsForecastScreen({ navigation }: RootScreenProps<'InsightsForecast'>) {
  const q = useForecast();
  const d = q.data;
  const short = d?.goals.find((g) => g.wallet_id === d.short_wallet_id);

  const planner = () =>
    navigation.navigate('Tabs', {
      screen: 'Steward',
      params: {
        ask: short
          ? `Help me plan ${short.name}. I need ${nairaShort(short.target)} by ${formatYmd(short.target_date)} and I'm about ${nairaShort(short.short)} short.`
          : 'Look at my savings goals and help me plan the next few months.',
      },
    });

  return (
    <PtPageScreen
      title="Savings forecast"
      subtitle="If you keep saving like this"
      onBack={() => navigation.goBack()}
      footer={d && d.goals.length ? <PtButton title="Open the planner" onPress={planner} /> : undefined}
    >
      <Loaded query={q}>
        {() =>
          !d ? null : d.goals.length === 0 ? (
            <Empty
              icon="target"
              title="No goals yet"
              body="Give a savings wallet a target and a date, and we'll show where it lands if you keep saving like you do."
              action="See your goals"
              onAction={() => navigation.navigate('Goals')}
            />
          ) : (
            <>
              <PtCard>
                {d.goals.map((g, i) => (
                  <Pressable
                    key={g.wallet_id}
                    onPress={() => {
                      selection();
                      navigation.navigate('WalletDetail', { walletId: g.wallet_id });
                    }}
                    accessibilityRole="button"
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === d.goals.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{g.name}</Text>
                        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{g.line}</Text>
                      </View>
                      <Status g={g} />
                    </View>
                  </Pressable>
                ))}
              </PtCard>
              {d.tip ? (
                <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 16 }}>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: '#FFFFFF' }}>
                    <Text style={{ fontFamily: ptFont.bold, color: pt.emerald300 }}>Steward: </Text>
                    {d.tip}
                  </Text>
                </View>
              ) : null}
            </>
          )
        }
      </Loaded>
    </PtPageScreen>
  );
}
