import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtRadio } from '../../components/pt/PtCheck';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtChoiceCard, PtNote, PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { LoadError } from '../../components/LoadError';
import { StateNotice } from '../../components/wallet/WalletManageUi';
import { useWallet } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useLockWallet, useRemoveLock } from '../../api/walletManage';
import { formatNaira, formatYmd, ymdMonthsFromNow } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

type Mode = 'date' | 'target' | 'agree';
const join = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/**
 * WAL-10 Lock this wallet: until a date, until the goal is reached, or until
 * the owners agree; a goal's payee can still be paid on time. While locked,
 * money comes in and nothing goes out — asking to unlock is WAL-11.
 */
export function LockWalletScreen({ navigation, route }: RootScreenProps<'LockWallet'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const lockIt = useLockWallet(walletId);
  const unlock = useRemoveLock(walletId);
  const d = detail.data;
  const wallet = d?.wallet;
  const others = d?.governance?.others ?? [];
  const ownerName = (wallet?.owner?.name ?? '').split(' ')[0];
  const myName = useAuth((s) => s.user?.first_name) ?? '';
  const owners = [...new Set([ownerName, myName, ...others].filter(Boolean))];
  const target = parseFloat(wallet?.target_amount ?? '');
  const hasTarget = Number.isFinite(target) && target > 0 && parseFloat(wallet?.balance ?? '0') < target;
  const payee = wallet?.goal?.payout?.to ?? null;

  const [mode, setMode] = useState<Mode>('date');
  const [until, setUntil] = useState<string>(ymdMonthsFromNow(3));
  const [picking, setPicking] = useState(false);
  const [payPayee, setPayPayee] = useState(true);

  const locked = Boolean(wallet?.lock?.locked);
  const state = d?.state?.kind === 'locked' ? d.state : null;

  const submit = () =>
    lockIt.mutate(
      { mode, until: mode === 'date' ? until : null, pay_payee: payPayee },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => showAlert('Could not lock', e.message),
      },
    );

  const askUnlock = () =>
    showAlert(
      'Unlock the wallet?',
      others.length ? `${join(others)} must say yes. Then money can go out again under the approval rules.` : 'The lock comes off now.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: others.length ? `Ask ${join(others)}` : 'Unlock',
          onPress: () =>
            unlock.mutate(undefined, {
              onSuccess: (res) => {
                notifySuccess();
                if (res.approval) showAlert('Sent for approval', `${join(res.approval.approver_names ?? others)} will see it in their approvals.`);
                navigation.goBack();
              },
              onError: (e) => showAlert('Could not unlock', e.message),
            }),
        },
      ],
    );

  return (
    <PtPageScreen
      title="Lock"
      subtitle={wallet?.name}
      onBack={() => navigation.goBack()}
      footer={wallet && !locked ? <PtButton title="Lock wallet" onPress={submit} loading={lockIt.isPending} disabled={mode === 'target' && !hasTarget} /> : undefined}
    >
      {detail.isLoading || !wallet ? (
        detail.error ? <LoadError message={(detail.error as Error).message} onRetry={() => void detail.refetch()} /> : <ActivityIndicator color={pt.brand} />
      ) : locked ? (
        <>
          {state ? <StateNotice state={state} /> : null}
          {wallet.lock?.pay_payee && payee ? <PtNote tone="success" icon="check">{payee} is still paid on time.</PtNote> : null}
          {state?.can_ask ? <PtButton title="Ask to unlock" onPress={() => navigation.navigate('AskToUnlock', { walletId })} /> : null}
          {others.length ? (
            <PtButton title={wallet.lock?.mode === 'agree' ? 'Unlock it together' : 'Unlock early'} variant="secondary" onPress={askUnlock} loading={unlock.isPending} />
          ) : (
            <PtNote tone="info" icon="lock">
              {wallet.lock?.mode === 'date' && wallet.lock.until ? `It opens on ${formatYmd(wallet.lock.until)}.` : `It opens at ${formatNaira(wallet.target_amount)}.`} Only you hold this wallet, so nothing comes out before then.
            </PtNote>
          )}
        </>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 28, lineHeight: 34, color: pt.ink }} accessibilityRole="header">
              Lock this wallet
            </Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted }}>While locked, money can come in but nothing goes out.</Text>
          </View>

          {mode === 'date' ? (
            // The chosen card holds its date field (WAL-10); the field is beside the card's tap area, not inside it.
            <View style={{ borderRadius: ptRadius.md, borderWidth: 2, borderColor: pt.brand, backgroundColor: pt.brandSoft, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} accessibilityRole="button" accessibilityState={{ selected: true }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.brand }}>Until a date</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>Opens on the day you pick.</Text>
                </View>
                <PtRadio checked />
              </View>
              <PtField label="Opens on" value={formatYmd(until)} editable={false} onPressBox={() => setPicking(true)} />
            </View>
          ) : (
            <PtChoiceCard title="Until a date" subtitle="Opens on the day you pick." selected={false} onPress={() => setMode('date')} />
          )}
          {hasTarget ? (
            <PtChoiceCard title="Until the goal is reached" subtitle={`Opens at ${formatNaira(target)}.`} selected={mode === 'target'} onPress={() => setMode('target')} />
          ) : null}
          {others.length ? (
            <PtChoiceCard title={others.length === 1 ? 'Until we both agree' : 'Until we all agree'} subtitle={`${join(owners)} unlock it together.`} selected={mode === 'agree'} onPress={() => setMode('agree')} />
          ) : null}

          {payee ? (
            <PtPanel>
              <PtSwitchRow title="Still pay the school on time" subtitle={`${payee} can be paid while locked`} value={payPayee} onChange={setPayPayee} />
            </PtPanel>
          ) : null}

          {!others.length ? (
            <PtNote tone="info" icon="lock">
              Only you hold this wallet, so nothing comes out before it opens.
            </PtNote>
          ) : (
            <PtNote tone="info" icon="users">
              To take money out early, anyone can ask, and everyone who approves must say yes.
            </PtNote>
          )}
        </>
      )}

      <PtDateSheet
        visible={picking}
        title="Opens on"
        value={until}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 10}
        doneLabel="Done"
        onDone={(ymd) => {
          setUntil(ymd);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
