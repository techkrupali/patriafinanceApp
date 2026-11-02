import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtDivider, PtGroupLabel, PtNote, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { useChildView, useUpdateChild } from '../../api/child';
import { groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const AUTO = [
  { value: '0', label: 'Never' },
  { value: '1000', label: '₦1,000' },
  { value: '2000', label: '₦2,000' },
  { value: '5000', label: '₦5,000' },
];

/** WPV-04 "Change limits" (CHW-02/03/04 after setup): pocket money, the daily limit, what the child can do, auto-approval. */
export function ChildLimitsScreen({ navigation, route }: RootScreenProps<'ChildLimits'>) {
  const { walletId } = route.params;
  const q = useChildView(walletId);
  const save = useUpdateChild(walletId);
  const v = q.data;
  const [f, setF] = useState<{ allowance: string; daily: string; auto: string; perWeek: string; reason: boolean; shops: boolean; friends: boolean; online: boolean; cash: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (v && !f && v.controls && v.requests) {
      setF({
        allowance: String(parseFloat(v.allowance?.amount ?? '0')),
        daily: String(parseFloat(v.daily_limit ?? '0')),
        auto: String(parseFloat(v.requests.auto_limit)),
        perWeek: String(v.requests.auto_per_week),
        reason: v.requests.reason_required,
        ...v.controls,
      });
    }
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v || !f) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const kid = v.first_name;

  return (
    <PtPageScreen
      title="Change limits"
      subtitle={`${kid}'s wallet`}
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Save"
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              { allowance: f.allowance || '0', daily_limit: f.daily || '0', auto_limit: f.auto, auto_per_week: Number(f.perWeek) || 0, reason_required: f.reason, shops: f.shops, friends: f.friends, online: f.online, cash: f.cash },
              { onSuccess: () => { notifySuccess(); navigation.goBack(); }, onError: (e) => setError(e.message) },
            )
          }
        />
      }
    >
      <PtField label="Pocket money" prefix="₦" value={groupAmountInput(f.allowance)} onChangeText={(t) => set({ allowance: sanitizeAmountInput(t) })} keyboardType="decimal-pad" hint="From the next payday" />
      <PtField label="Daily spending limit" prefix="₦" value={groupAmountInput(f.daily)} onChangeText={(t) => set({ daily: sanitizeAmountInput(t) })} keyboardType="decimal-pad" />
      <PtPanel>
        <PtSwitchRow title="Pay at shops and the school tuck shop" subtitle="With a pay code or spending card" value={f.shops} onChange={(x) => set({ shops: x })} />
        <PtDivider />
        <PtSwitchRow title="Send money to friends" subtitle="Only to children you approve" value={f.friends} onChange={(x) => set({ friends: x })} />
        <PtDivider />
        <PtSwitchRow title="Pay online" subtitle="Games, apps and websites" value={f.online} onChange={(x) => set({ online: x })} />
        <PtDivider />
        <PtSwitchRow title="Withdraw cash" subtitle="At agents and ATMs" value={f.cash} onChange={(x) => set({ cash: x })} />
      </PtPanel>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>Approve automatically up to</PtGroupLabel>
        <PtPills options={AUTO} value={AUTO.some((a) => a.value === f.auto) ? f.auto : null} onChange={(x) => set({ auto: x })} />
      </View>
      <PtField label="Automatic approvals a week" value={f.perWeek} onChangeText={(t) => set({ perWeek: t.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" hint="After that, every request comes to you" />
      <PtPanel>
        <PtSwitchRow title={`${kid} must give a reason`} subtitle={'Like "school trip" or "birthday gift"'} value={f.reason} onChange={(x) => set({ reason: x })} />
      </PtPanel>
      <PtNote tone="info">Betting, lottery and adult sites are always blocked for children. This can't be turned off.</PtNote>
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtPageScreen>
  );
}
