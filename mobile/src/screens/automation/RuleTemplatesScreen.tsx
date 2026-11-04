import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { useWallets } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { RuleDraft } from '../../api/rules';
import type { RootScreenProps } from '../../navigation/types';

type Icon = React.ComponentProps<typeof Feather>['name'];

/**
 * AUT-02 "New rule · Start from a template": "Just say it", six templates,
 * and "See every kind of rule and build from scratch" (RUL-01).
 */
export function RuleTemplatesScreen({ navigation }: RootScreenProps<'RuleTemplates'>) {
  const wallets = useWallets();
  const mine = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active');
  const main = mine.find((w) => w.type === 'main');
  const first = (...types: string[]) => mine.find((w) => types.includes(w.type))?.id ?? null;

  const templates: { icon: Icon; title: string; sub: string; go: () => void }[] = [
    { icon: 'zap', title: 'Save from every salary', sub: 'A share of salary moves to savings', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'salary', percent: 10, from_wallet_id: main?.id, to_wallet_id: first('savings', 'goal'), name: 'Save from every salary' } }) },
    { icon: 'arrow-up', title: 'Top up a budget when it runs low', sub: 'Keep Household above a level', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'balance', watch_wallet_id: first('spending'), threshold: 30000, from_wallet_id: main?.id, to_wallet_id: first('spending'), amount: 50000 } }) },
    { icon: 'calendar', title: 'Weekly allowance', sub: 'Pay a child on a set day', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'schedule', frequency: 'weekly', day_of_week: 1, from_wallet_id: main?.id, to_wallet_id: first('child'), amount: 5000, name: 'Weekly allowance' } }) },
    { icon: 'rotate-cw', title: 'Round up and save', sub: 'Spare change goes to a goal', go: () => navigation.navigate('RoundUpRule') },
    { icon: 'bell', title: 'Remind contributors', sub: 'Nudge people before a due date', go: () => navigation.navigate('ContributionRules', {}) },
    { icon: 'file-text', title: 'Pay a bill on schedule', sub: 'Rent, school, upkeep for parents', go: () => navigation.navigate('SendSchedule') },
  ];

  return (
    <PtPageScreen title="New rule" subtitle="Start from a template" onBack={() => navigation.goBack()}>
      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('DescribeRule');
        }}
        accessibilityRole="button"
        accessibilityLabel="Just say it"
        style={{ borderRadius: ptRadius.md }}
      >
        {/* Fill on a View so it shows on every Android phone. */}
        <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: pt.emerald300, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="mic" size={22} color={pt.emerald900} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: '#fff' }}>Just say it</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: '#D5EDE3' }}>"Top up Household when it falls below ₦30k"</Text>
          </View>
        </View>
      </Pressable>
      <PtCard>
        {templates.map((t, i) => (
          <PtRow
            key={t.title}
            left={<PtIconTile><Feather name={t.icon} size={18} color={pt.brand} /></PtIconTile>}
            title={t.title}
            subtitle={t.sub}
            chevron
            last={i === templates.length - 1}
            onPress={() => {
              selection();
              t.go();
            }}
          />
        ))}
      </PtCard>
      <Pressable onPress={() => navigation.navigate('RuleTypes')} accessibilityRole="button" style={{ paddingVertical: 6 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>See every kind of rule and build from scratch</Text>
      </Pressable>
    </PtPageScreen>
  );
}
