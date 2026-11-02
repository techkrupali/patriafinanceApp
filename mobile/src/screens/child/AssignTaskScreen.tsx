import React, { useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtDivider, PtGroupLabel, PtNote, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { useChildView, useTaskActions } from '../../api/child';
import { useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatYmd, groupAmountInput, sanitizeAmountInput, toYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/** The coming Saturday (today if it's Saturday). */
const saturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return toYmd(d);
};

/**
 * CHD-12 New task: what to do, the reward ("paid from Main into Tolu's wallet
 * when you approve"), when, repeat every week, ask for a photo, and whether
 * the co-parent can approve it too.
 */
export function AssignTaskScreen({ navigation, route }: RootScreenProps<'AssignTask'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const view = useChildView(walletId);
  const wallets = useWallets();
  const { add } = useTaskActions(walletId);
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('');
  const [when, setWhen] = useState<'today' | 'saturday' | 'pick'>('saturday');
  const [day, setDay] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [photo, setPhoto] = useState(true);
  const [coparent, setCoparent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const kid = view.data?.first_name ?? 'them';
  const other = (view.data?.parents ?? []).find((p) => p.id !== me?.id)?.first_name;
  const main = (wallets.data ?? []).find((w) => w.type === 'main' && (w.my_role ?? 'owner') === 'owner');
  const due = when === 'today' ? toYmd(new Date()) : when === 'saturday' ? saturday() : day;

  return (
    <PtPageScreen
      title="New task"
      subtitle={`For ${kid}`}
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title={`Send to ${kid}`}
          disabled={!title.trim() || !(parseFloat(reward) > 0) || !due}
          loading={add.isPending}
          onPress={() =>
            add.mutate(
              { title: title.trim(), reward, due_on: due ?? undefined, repeat_weekly: repeat, needs_photo: photo, coparent_can_approve: coparent },
              { onSuccess: () => { notifySuccess(); navigation.goBack(); }, onError: (e) => setError(e.message) },
            )
          }
        />
      }
    >
      <PtField label="Task" value={title} onChangeText={setTitle} placeholder="Wash the car" maxLength={120} />
      <PtField
        label="Reward"
        prefix="₦"
        value={groupAmountInput(reward)}
        onChangeText={(t) => setReward(sanitizeAmountInput(t))}
        keyboardType="decimal-pad"
        placeholder="1,000"
        hint={`Paid from ${main?.name ?? 'Main'} into ${kid}'s wallet when you approve`}
      />
      <View style={{ gap: 10 }}>
        <PtGroupLabel>When</PtGroupLabel>
        <PtPills
          options={[
            { value: 'today', label: 'Today' },
            { value: 'saturday', label: 'Saturday' },
            { value: 'pick', label: day && when === 'pick' ? formatYmd(day).replace(/ \d{4}$/, '') : 'Pick a day' },
          ]}
          value={when}
          onChange={(v) => {
            setWhen(v as typeof when);
            if (v === 'pick') setPicking(true);
          }}
        />
      </View>
      <PtPanel>
        <PtSwitchRow title="Repeat every week" value={repeat} onChange={setRepeat} />
        <PtDivider />
        <PtSwitchRow title="Ask for a photo" subtitle={`${kid} snaps it when done`} value={photo} onChange={setPhoto} />
        {other ? (
          <>
            <PtDivider />
            <PtSwitchRow title={`${other} can approve too`} value={coparent} onChange={setCoparent} />
          </>
        ) : null}
      </PtPanel>
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
      <PtDateSheet
        visible={picking}
        title="Pick a day"
        value={day ?? saturday()}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 1}
        doneLabel="Done"
        onDone={(ymd) => {
          setDay(ymd < toYmd(new Date()) ? toYmd(new Date()) : ymd);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
