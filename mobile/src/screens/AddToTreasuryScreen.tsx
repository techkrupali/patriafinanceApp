import React, { useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../components/pt/PtPageScreen';
import { PtButton } from '../components/pt/PtButton';
import { PtChoiceCard, PtNote } from '../components/pt/PtForm';
import type { RootScreenProps } from '../navigation/types';

type Way = 'create' | 'join' | 'link' | 'ajo' | 'ajo_start';

/** Not built yet: linking a bank needs an open-banking partner. */
const SOON: Way[] = ['link'];

const WAYS: { key: Way; title: string; subtitle: string; icon: 'plus-circle' | 'user-plus' | 'link' | 'refresh-cw' | 'rotate-cw' }[] = [
  { key: 'create', title: 'Create a new wallet', subtitle: 'Savings, goal, spending, giving, child, emergency, joint, project', icon: 'plus-circle' },
  { key: 'join', title: 'Join a wallet you were invited to', subtitle: 'Invites sent to your number or email', icon: 'user-plus' },
  { key: 'link', title: 'Link another bank account · soon', subtitle: 'See its balance here. Money stays at your bank.', icon: 'link' },
  { key: 'ajo', title: 'Join an ajo circle', subtitle: 'With a code from the organiser', icon: 'refresh-cw' },
  // AJO-01: there is no circle switcher here, so starting a circle lives next to joining one.
  { key: 'ajo_start', title: 'Start an ajo circle', subtitle: 'Rotating savings with people you trust', icon: 'rotate-cw' },
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
          onPress={() =>
            way === 'create'
              ? navigation.replace('CreateWallet')
              : way === 'ajo'
                ? navigation.replace('AjoCode')
                : way === 'ajo_start'
                  ? navigation.replace('AjoSetup')
                  : navigation.replace('Invitations')
          }
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
