import React, { useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtSwitch } from '../../components/pt/PtTabScreen';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { useWallets } from '../../api/hooks';
import { useStewardAutoAction } from '../../api/steward';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

type When = 'salary' | 'vendor_chat' | 'bill_due' | 'goal_behind';
type Will = 'tithe' | 'answer_vendor' | 'catchup';
const FITS: Record<When, Will | null> = { salary: 'tithe', vendor_chat: 'answer_vendor', goal_behind: 'catchup', bill_due: null };

/**
 * RUL-09 "Steward auto-action — Steward does it, within your limits": when
 * salary lands set aside my tithe; when a vendor asks in chat answer from
 * project records; when a goal falls behind suggest a catch-up plan.
 */
export function StewardAutoActionScreen({ navigation }: RootScreenProps<'StewardAutoAction'>) {
  const wallets = useWallets();
  const turnOn = useStewardAutoAction();
  const [when, setWhen] = useState<When>('salary');
  const [will, setWill] = useState<Will>('tithe');
  const [limit, setLimit] = useState('60000');
  const [tell, setTell] = useState(true);
  const giving = (wallets.data ?? []).find((w) => w.type === 'giving' && w.my_role === 'owner');

  const pickWhen = (w: When) => {
    setWhen(w);
    const fit = FITS[w];
    if (fit) setWill(fit);
  };

  return (
    <PtPageScreen
      title="Steward auto-action"
      subtitle="Steward does it, within your limits"
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title={when === 'bill_due' ? 'Bills are coming soon' : 'Turn on'}
          disabled={when === 'bill_due' || FITS[when] !== will}
          loading={turnOn.isPending}
          onPress={() =>
            turnOn.mutate(
              { when, will, limit: Number(limit || 0), tell },
              { onSuccess: (r) => { notifySuccess(); showAlert('Turned on', r.line); navigation.goBack(); }, onError: (e) => showAlert('Not turned on', e.message) },
            )
          }
        />
      }
    >
      <PtGroupLabel>When</PtGroupLabel>
      <PtPills
        options={[
          { value: 'salary' as When, label: 'Salary lands' },
          { value: 'vendor_chat' as When, label: 'A vendor asks in chat' },
          { value: 'bill_due' as When, label: 'A bill is due' },
          { value: 'goal_behind' as When, label: 'A goal falls behind' },
        ]}
        value={when}
        onChange={pickWhen}
      />
      <PtGroupLabel>Steward will</PtGroupLabel>
      <View style={{ gap: 10 }}>
        <PtChoiceCard icon="heart" title="Set aside my tithe" subtitle={`10% of the salary to ${giving?.name ?? 'your giving wallet'}`} selected={will === 'tithe'} onPress={() => pickWhen('salary')} />
        <PtChoiceCard icon="message-square" title="Answer the vendor from project records" subtitle="In that project's chat only" selected={will === 'answer_vendor'} onPress={() => pickWhen('vendor_chat')} />
        <PtChoiceCard icon="target" title="Suggest a catch-up plan" subtitle="You decide" selected={will === 'catchup'} onPress={() => pickWhen('goal_behind')} />
      </View>
      <PtPanel>
        {will === 'tithe' ? (
          <>
            <PtSwitchRow title={`Limit: up to ₦${Number(limit || 0).toLocaleString('en-NG')} each time`} right={<PtAmountBox value={limit} onChange={setLimit} label="Limit" width={110} />} />
            <PtDivider />
          </>
        ) : null}
        <PtSwitchRow title="Tell me after it acts" right={<PtSwitch label="Tell me after it acts" value={tell} onChange={setTell} />} />
      </PtPanel>
    </PtPageScreen>
  );
}
