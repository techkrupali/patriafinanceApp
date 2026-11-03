import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtSwitch } from '../../components/pt/PtTabScreen';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtDivider, PtGroupLabel, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useWallets } from '../../api/hooks';
import { useContributionRules, useSaveContributionRules } from '../../api/contributionRules';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * AUT-11 "Contribution rules · School fees 2027": if someone is late — remind
 * them, a late fee (off by default), tell the owners after 7 days; interest
 * and the on-time bonus need a partner bank, so they say so. Ajo circles set
 * their stricter rules when the circle is made.
 */
export function ContributionRulesScreen({ navigation, route }: RootScreenProps<'ContributionRules'>) {
  const wallets = useWallets();
  const shared = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && ['savings', 'goal', 'project', 'emergency'].includes(w.type));
  const [walletId, setWalletId] = useState<number | null>(route.params?.walletId ?? null);
  const id = walletId ?? shared.find((w) => w.is_shared)?.id ?? shared[0]?.id ?? null;
  const q = useContributionRules(id);
  const save = useSaveContributionRules(id);
  const [remind, setRemind] = useState<'day' | 'before_and_day' | 'off'>('before_and_day');
  const [feeOn, setFeeOn] = useState(false);
  const [fee, setFee] = useState('1000');
  const [after, setAfter] = useState<number | null>(7);
  const [shareBy, setShareBy] = useState<'contributions' | 'equal'>('contributions');
  const [sheet, setSheet] = useState<null | 'remind' | 'after' | 'wallet' | 'share'>(null);
  const d = q.data;

  useEffect(() => {
    if (!d) return;
    setRemind(d.remind);
    setFeeOn(d.late_fee_on);
    setFee(String(d.late_fee / 100));
    setAfter(d.tell_owners_after);
    setShareBy(d.share_by);
  }, [d]);

  if (!id) {
    return (
      <PtPageScreen title="Contribution rules" onBack={() => navigation.goBack()}>
        <PtNote>Make a savings or goal wallet and invite people to it first. Its contribution rules show here.</PtNote>
      </PtPageScreen>
    );
  }
  if (!d) {
    return (
      <PtPageScreen title="Contribution rules" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const REMIND = { day: 'On the day', before_and_day: '2 days before, and on the day', off: 'Off' } as const;

  return (
    <PtPageScreen
      title="Contribution rules"
      subtitle={d.wallet.name}
      onBack={() => navigation.goBack()}
      right={shared.length > 1 ? <Text onPress={() => setSheet('wallet')} style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Change</Text> : undefined}
      footer={
        d.can_edit ? (
          <PtButton
            title="Save"
            loading={save.isPending}
            onPress={() =>
              save.mutate(
                { remind, late_fee_on: feeOn, late_fee: Number(fee || 0), tell_owners_after: after, share_by: shareBy },
                { onSuccess: () => { notifySuccess(); showAlert('Saved', `Everyone saving into ${d.wallet.name} follows these rules.`); }, onError: (e) => showAlert('Not saved', e.message) },
              )
            }
          />
        ) : undefined
      }
    >
      <PtGroupLabel>If someone is late</PtGroupLabel>
      <PtPanel>
        <PtReviewRow label="Remind them" value={REMIND[remind]} sub={d.reminder_day ? `Due on the ${d.reminder_day}${d.reminder_day === 1 || d.reminder_day === 21 ? 'st' : d.reminder_day === 2 || d.reminder_day === 22 ? 'nd' : d.reminder_day === 3 || d.reminder_day === 23 ? 'rd' : 'th'}` : 'Set a reminder day in the wallet first'} onEdit={d.can_edit ? () => setSheet('remind') : undefined} />
        <PtSwitchRow
          title="Late fee"
          subtitle={feeOn ? `Moves from their Main after ${after ?? 7} days late` : 'Off · families usually keep this friendly'}
          right={<PtSwitch label="Late fee" value={feeOn} disabled={!d.can_edit} onChange={setFeeOn} />}
        />
        {feeOn ? <PtAmountBox value={fee} onChange={setFee} label="Late fee" /> : null}
        <PtDivider />
        <PtReviewRow label={after ? `After ${after} days late` : 'When someone is late'} value={after ? 'Tell the owners' : "Don't tell anyone"} onEdit={d.can_edit ? () => setSheet('after') : undefined} last />
      </PtPanel>

      <PtGroupLabel>Interest and bonuses</PtGroupLabel>
      <PtPanel>
        <PtReviewRow label="Interest earned" value="Not available yet" sub="Comes when Patriai has a partner bank" />
        <PtReviewRow label="Shared by" value={shareBy === 'equal' ? 'Equally' : 'What each person put in'} sub={shareBy === 'equal' ? null : d.shares} onEdit={d.can_edit ? () => setSheet('share') : undefined} last />
      </PtPanel>
      <PtNote tone="info">Ajo circles use stricter rules (late fee and losing your turn). You set those when you create the circle.</PtNote>

      <PtOptionSheet visible={sheet === 'remind'} title="Remind them" options={(Object.keys(REMIND) as (keyof typeof REMIND)[]).map((k) => ({ value: k, label: REMIND[k] }))} value={remind} onPick={(v) => { setRemind(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'after'} title="Tell the owners" options={[{ value: 3, label: 'After 3 days late' }, { value: 7, label: 'After 7 days late' }, { value: 14, label: 'After 14 days late' }, { value: 0, label: "Don't tell anyone" }]} value={after ?? 0} onPick={(v) => { setAfter(v || null); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'share'} title="Shared by" options={[{ value: 'contributions' as const, label: 'What each person put in' }, { value: 'equal' as const, label: 'Equally' }]} value={shareBy} onPick={(v) => { setShareBy(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'wallet'} title="Which wallet?" options={shared.map((w) => ({ value: w.id, label: w.name }))} value={id} onPick={(v) => { setWalletId(v); setSheet(null); }} onClose={() => setSheet(null)} />
    </PtPageScreen>
  );
}
