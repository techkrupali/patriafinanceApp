import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useApproval, useRespondApproval } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtPills, PtSwitchRow, PtPanel } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const REASONS = ["Let's talk first", 'Ask for less', 'Already paid', 'Not this time'];

/**
 * APR-04 Decline with reason: "Tolu will see your reason. Pick one or write
 * your own." — and "Offer ₦10,000 instead".
 */
export function ApprovalDeclineScreen({ navigation, route }: RootScreenProps<'ApprovalDecline'>) {
  const { approvalId } = route.params;
  const q = useApproval(approvalId);
  const respond = useRespondApproval(approvalId);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [offering, setOffering] = useState(false);
  const [offer, setOffer] = useState('');
  const a = q.data;

  if (!a) {
    return (
      <PtPageScreen title="Decline" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  const first = (a.initiator?.name ?? 'them').split(' ')[0];
  const amount = Number(a.amount);
  const offerOk = !offering || (Number(offer) > 0 && Number(offer) < amount);
  const text = [reason, note.trim()].filter(Boolean).join(' · ');

  const decline = () =>
    respond.mutate(
      { decision: 'reject', note: text || undefined, offer: offering && offer ? offer : undefined },
      {
        onSuccess: () => navigation.replace('ApprovalOutcome', { approvalId }),
        onError: (e) => showAlert('Not declined', (e as Error).message),
      },
    );

  return (
    <PtPageScreen
      title={a.governance ? 'Say no' : formatNaira(a.amount)}
      subtitle={a.wallet?.name}
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PtButton title="Go back" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.goBack()} />
          <PtButton title="Decline" style={{ flex: 1, backgroundColor: pt.danger }} disabled={!offerOk} loading={respond.isPending} onPress={decline} />
        </View>
      }
    >
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, lineHeight: 28, color: pt.ink }}>{a.governance ? `Say no to ${first}'s change?` : `Decline ${first}'s ${formatNaira(a.amount)}?`}</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>{`${first} will see your reason. Pick one or write your own.`}</Text>
      <PtPills options={REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={(r) => setReason(reason === r ? null : r)} />
      <PtField label={`Note to ${first} (optional)`} value={note} onChangeText={setNote} maxLength={150} placeholder="We can talk about it tonight." />
      {!a.governance && amount > 1 ? (
        <PtPanel>
          <PtSwitchRow title="Offer less instead" subtitle={`${first} can ask again for that amount`} value={offering} onChange={setOffering} />
        </PtPanel>
      ) : null}
      {offering ? (
        <PtField
          label="Offer"
          prefix="₦"
          value={groupAmountInput(offer)}
          onChangeText={(t) => setOffer(sanitizeAmountInput(t))}
          keyboardType="decimal-pad"
          placeholder={String(Math.round(amount * 0.66))}
          error={offerOk ? undefined : `Less than ${formatNaira(amount)}`}
        />
      ) : null}
    </PtPageScreen>
  );
}
