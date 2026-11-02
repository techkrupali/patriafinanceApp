import React, { useState } from 'react';
import { View } from 'react-native';
import { useJointActions, useWallet } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { splitShort } from '../../lib/joint';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * JNT-05 "If one of you leaves", from WPV-03 Leave: the split you agreed and
 * what it comes to today, notice to leave (payments continue), and closing,
 * which needs both PINs. "Money is never released by one person alone."
 */
export function JointLeaveScreen({ navigation, route }: RootScreenProps<'JointLeave'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const q = useWallet(walletId);
  const actions = useJointActions(walletId);
  const [pending, setPending] = useState<'leave' | 'close' | null>(null);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [pinError, setPinError] = useState<string | null>(null);
  const wallet = q.data?.wallet;
  const j = wallet?.joint;

  if (!wallet || !j) {
    return (
      <PtPageScreen title="If one of you leaves" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const iAmOwner = wallet.owner ? wallet.owner.id === me?.id : true;
  const other = iAmOwner ? j.partner : wallet.owner ? { id: wallet.owner.id, name: wallet.owner.name } : null;
  const otherName = (other?.name ?? 'your partner').split(/\s+/)[0];
  const balance = Number(wallet.balance);
  const ids = [me?.id, other?.id].filter((x): x is number => typeof x === 'number');
  // What the agreed split gives each of you today.
  const put = (id: number | undefined) => Number(j.put_in?.find((p) => p.user_id === id)?.amount ?? 0);
  const totalPut = put(me?.id) + put(other?.id);
  const myShare = j.leave.split === 'equal' || totalPut <= 0 ? balance / 2 : (balance * put(me?.id)) / totalPut;
  const decide = j.leave.split === 'decide';
  const closingByOther = j.closing && j.closing.by !== me?.id;
  const closingByMe = j.closing && j.closing.by === me?.id;
  const sharesOk = !decide || closingByOther || Math.round(ids.reduce((t, id) => t + Number(shares[id] || 0), 0)) === Math.round(balance);

  const run = (pin: string) => {
    setPinError(null);
    if (pending === 'leave') {
      actions.leave.mutate(
        { pin },
        {
          onSuccess: () => {
            notifySuccess();
            setPending(null);
            showAlert('Notice given', `Payments continue for ${j.leave.notice_days} days. ${otherName} has been told.`);
          },
          onError: (e) => setPinError(e.message),
        },
      );
      return;
    }
    const body = decide && !closingByOther ? { pin, shares: ids.map((id) => ({ user_id: id, amount: shares[id] || '0' })) } : { pin };
    actions.close.mutate(body, {
      onSuccess: (r) => {
        notifySuccess();
        setPending(null);
        if (r.closed) {
          showAlert('Closed', 'Each share is in your Main wallets.');
          navigation.goBack();
        } else showAlert(`Waiting for ${otherName}`, `It closes when ${otherName} confirms with their PIN.`);
      },
      onError: (e) => setPinError(e.message),
    });
  };

  return (
    <PtPageScreen
      title="If one of you leaves"
      subtitle={wallet.name}
      onBack={() => navigation.goBack()}
      footer={
        j.state === 'open' || j.state === 'leaving' ? (
          <>
            {closingByOther ? (
              <PtButton title="Confirm closing with PIN" onPress={() => setPending('close')} />
            ) : (
              <PtButton title={closingByMe ? `Waiting for ${otherName}` : 'Close the wallet'} disabled={Boolean(closingByMe) || !sharesOk} onPress={() => setPending('close')} />
            )}
            {!j.leaving && !j.closing ? (
              <PtButton title={j.leave.notice_days ? `Give ${j.leave.notice_days} days' notice` : 'Leave now'} variant="ghost" onPress={() => setPending('leave')} />
            ) : null}
          </>
        ) : null
      }
    >
      {j.leaving ? <PtNote tone="attention">{`${j.leaving.by === me?.id ? 'You' : otherName} gave notice. Payments continue until ${formatYmd(j.leaving.ends_on)}, then the money splits the way you agreed.`}</PtNote> : null}
      {closingByOther ? <PtNote tone="attention">{`${otherName} wants to close ${wallet.name}. It closes, and the money splits, when you confirm with your PIN.`}</PtNote> : null}
      <PtPanel>
        <PtReviewRow label="The split you agreed" value={splitShort(j.leave.split)} sub={decide ? 'Money stays locked until you both agree' : `Today that's ${formatNaira(Math.round(myShare))} for you, ${formatNaira(Math.round(balance - myShare))} for ${otherName}`} />
        <PtReviewRow label="Notice to leave" value={j.leave.notice_days ? `${j.leave.notice_days} days` : 'None'} sub="Payments continue during notice" />
        <PtReviewRow label="Closing the wallet" value="Both must confirm with PIN" sub="Each share goes to your own Main wallet" last />
      </PtPanel>
      {decide && !closingByOther && !closingByMe && (j.state === 'open' || j.state === 'leaving') ? (
        <View style={{ gap: 12 }}>
          {ids.map((id) => (
            <PtField
              key={id}
              label={id === me?.id ? 'You get' : `${otherName} gets`}
              prefix="₦"
              value={groupAmountInput(shares[id] ?? '')}
              onChangeText={(t) => setShares((s) => ({ ...s, [id]: sanitizeAmountInput(t) }))}
              keyboardType="decimal-pad"
            />
          ))}
          {!sharesOk ? <PtNote tone="attention">{`It has to add up to ${formatNaira(balance)}.`}</PtNote> : null}
        </View>
      ) : null}
      <PtNote icon="shield">{"If you can't agree, Patriai support helps you resolve it. Money is never released by one person alone."}</PtNote>

      <PinSheet
        visible={pending !== null}
        title="Enter your PIN"
        subtitle={pending === 'leave' ? (j.leave.notice_days ? `To give ${j.leave.notice_days} days' notice` : 'To leave now') : closingByOther ? `To close ${wallet.name} with ${otherName}` : `To close ${wallet.name}`}
        loading={actions.leave.isPending || actions.close.isPending}
        error={pinError}
        onSubmit={run}
        onClose={() => setPending(null)}
      />
    </PtPageScreen>
  );
}
