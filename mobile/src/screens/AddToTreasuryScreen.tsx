import React, { useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../components/pt/PtPageScreen';
import { PtButton } from '../components/pt/PtButton';
import { PtChoiceCard, PtNote } from '../components/pt/PtForm';
import type { RootScreenProps } from '../navigation/types';

type Way = 'create' | 'join' | 'link' | 'ajo';

/** Not built yet: linking a bank needs an open-banking partner; ajo circles come with their own sheet. */
const SOON: Way[] = ['link', 'ajo'];

const WAYS: { key: Way; title: string; subtitle: string; icon: 'plus-circle' | 'user-plus' | 'link' | 'refresh-cw' }[] = [
  { key: 'create', title: 'Create a new wallet', subtitle: 'Savings, goal, spending, giving, child, emergency, joint, project', icon: 'plus-circle' },
  { key: 'join', title: 'Join a wallet you were invited to', subtitle: 'Invites sent to your number or email', icon: 'user-plus' },
  { key: 'link', title: 'Link another bank account · soon', subtitle: 'See its balance here. Money stays at your bank.', icon: 'link' },
  { key: 'ajo', title: 'Join an ajo circle · soon', subtitle: 'With a code from the organiser', icon: 'refresh-cw' },
];

/** TRS-03 Add to Treasury: a new wallet, one you were invited to, a linked bank, an ajo circle. */
export function AddToTreasuryScreen({ navigation }: RootScreenProps<'AddToTreasury'>) {
  const [way, setWay] = useState<Way>('create');
  return (
    <PtPageScreen
      title="Add to Treasury"
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Continue"
          disabled={SOON.includes(way)}
          onPress={() => (way === 'create' ? navigation.replace('CreateWallet') : navigation.replace('Invitations'))}
        />
      }
    >
      <View style={{ gap: 10 }}>
        {WAYS.map((w) => (
          <PtChoiceCard key={w.key} title={w.title} subtitle={w.subtitle} icon={w.icon} selected={way === w.key} onPress={() => setWay(w.key)} />
        ))}
      </View>
      <PtNote tone="info">Linked bank accounts are read-only. Patriai can show the balance but never moves money from them without you.</PtNote>
    </PtPageScreen>
  );
}
