import React from 'react';
import { Feather } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { useWallets } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type Icon = React.ComponentProps<typeof Feather>['name'];

/** RUL-01 "New rule · What should it do?": every kind of rule. */
export function RuleTypesScreen({ navigation }: RootScreenProps<'RuleTypes'>) {
  const wallets = useWallets();
  const mine = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active');
  const main = mine.find((w) => w.type === 'main');
  const first = (...types: string[]) => mine.find((w) => types.includes(w.type))?.id ?? null;

  const kinds: { icon: Icon; title: string; sub: string; go?: () => void }[] = [
    { icon: 'repeat', title: 'Send on a schedule', sub: 'Pay someone weekly, monthly, quarterly, once', go: () => navigation.navigate('SendSchedule') },
    { icon: 'git-branch', title: 'Split between accounts', sub: 'Like tithe shared by 2 churches', go: () => navigation.navigate('SplitRule', {}) },
    { icon: 'percent', title: 'Share of money coming in', sub: '10% of every salary to a goal', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'salary', percent: 10, from_wallet_id: main?.id, to_wallet_id: first('savings', 'goal') } }) },
    { icon: 'arrow-up', title: 'Top up when low', sub: 'Keep Household above ₦30,000', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'balance', watch_wallet_id: first('spending'), threshold: 30000, from_wallet_id: main?.id, to_wallet_id: first('spending'), amount: 50000 } }) },
    { icon: 'filter', title: "Sweep what's left", sub: 'Month-end leftovers to savings', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'schedule', frequency: 'monthly', day_of_month: 28, action: 'sweep', from_wallet_id: first('spending') ?? main?.id, to_wallet_id: first('savings', 'goal'), amount: 5000, name: "Sweep what's left" } }) },
    { icon: 'rotate-cw', title: 'Round up and save', sub: 'Spare change to a goal', go: () => navigation.navigate('RoundUpRule') },
    { icon: 'bell', title: 'Remind only', sub: 'Nudge people, move no money', go: () => navigation.navigate('RuleBuilder', { preset: { trigger: 'event', event: 'request_made', watch_wallet_id: first('child', 'spending'), action: 'notify' } }) },
    { icon: 'shield', title: 'Steward auto-actions', sub: 'Let Steward act within limits', go: () => navigation.navigate('StewardAutoAction') },
    { icon: 'zap', title: 'Pay a bill', sub: 'Electricity, TV, data · coming soon' },
  ];

  return (
    <PtPageScreen title="New rule" subtitle="What should it do?" onBack={() => navigation.goBack()}>
      <PtCard>
        {kinds.map((k, i) => (
          <PtRow
            key={k.title}
            left={<PtIconTile><Feather name={k.icon} size={18} color={pt.brand} /></PtIconTile>}
            title={k.title}
            subtitle={k.sub}
            chevron={Boolean(k.go)}
            disabled={!k.go}
            last={i === kinds.length - 1}
            onPress={k.go ? () => { selection(); k.go?.(); } : undefined}
          />
        ))}
      </PtCard>
    </PtPageScreen>
  );
}
