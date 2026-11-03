import React, { useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPills } from '../../components/pt/PtForm';
import { useWallets } from '../../api/hooks';
import { useBuildRule } from '../../api/rules';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** RUL-01 "Round up and save": every payment from Main rounds up; the change goes to a goal. */
export function RoundUpRuleScreen({ navigation }: RootScreenProps<'RoundUpRule'>) {
  const wallets = useWallets();
  const build = useBuildRule();
  const goals = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && ['savings', 'goal', 'emergency'].includes(w.type));
  const [to, setTo] = useState<number | null>(null);
  const [step, setStep] = useState(100);
  const chosen = to ?? goals[0]?.id ?? null;

  return (
    <PtPageScreen
      title="Round up and save"
      subtitle="Spare change goes to a goal"
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Turn on"
          disabled={!chosen}
          loading={build.isPending}
          onPress={() =>
            chosen &&
            build.mutate(
              { trigger: 'roundup', to_wallet_id: chosen, roundup_to: step },
              { onSuccess: (r) => { notifySuccess(); navigation.replace('RuleDetail', { ruleId: r.automation.id }); }, onError: (e) => showAlert('Not turned on', e.message) },
            )
          }
        />
      }
    >
      <PtGroupLabel>Round each payment up to</PtGroupLabel>
      <PtPills options={[{ value: 100, label: '₦100' }, { value: 500, label: '₦500' }, { value: 1000, label: '₦1,000' }]} value={step} onChange={setStep} />
      <PtGroupLabel>Save the change in</PtGroupLabel>
      <View style={{ gap: 10 }}>
        {goals.map((w) => (
          <PtChoiceCard key={w.id} title={w.name} selected={chosen === w.id} onPress={() => setTo(w.id)} />
        ))}
      </View>
      <PtNote>{`Pay ₦2,350 from Main and ₦${step === 100 ? 50 : step === 500 ? 150 : 650} goes to your goal. We move it once a day.`}</PtNote>
    </PtPageScreen>
  );
}
