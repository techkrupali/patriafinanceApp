import React, { useState } from 'react';
import { Text } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { useAuth } from '../../store/auth';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChoiceCard, PtNote } from '../../components/pt/PtForm';
import { selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * VON-01 "How will you use Patriai?": a family account, or a business that
 * families pay through milestones. Either way it starts with the phone number;
 * a business goes on to its account setup once signed in.
 */
export function AccountTypeScreen({ navigation }: AuthScreenProps<'AccountType'>) {
  const setPostAuthRoute = useAuth((s) => s.setPostAuthRoute);
  const [kind, setKind] = useState<'family' | 'business'>('family');

  const go = (business: boolean) => {
    setPostAuthRoute(business ? 'BusinessSetup' : null);
    navigation.navigate('Phone');
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      title="How will you use Patriai?"
      subtitle="You can add the other later from the same phone number."
      gap={18}
      footer={
        <>
          <PtButton title={kind === 'business' ? 'Continue as a business' : 'Continue for my family'} onPress={() => go(kind === 'business')} />
          <Pressable onPress={() => { selection(); go(kind !== 'business'); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{kind === 'business' ? 'Continue for my family' : 'Continue as a business'}</Text>
          </Pressable>
        </>
      }
    >
      <PtChoiceCard icon="home" title="For my family" subtitle="Shared wallets, goals, ajo, children" selected={kind === 'family'} onPress={() => setKind('family')} />
      <PtChoiceCard
        icon="briefcase"
        title="For my business"
        subtitle="Get paid by families through milestones. Builders, schools, caterers, suppliers, planners."
        selected={kind === 'business'}
        onPress={() => setKind('business')}
      />
      <PtNote>If a family invited you to a project, use the same phone number they invited, and we'll link it.</PtNote>
    </PtStepScreen>
  );
}
