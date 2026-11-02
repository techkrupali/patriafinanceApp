import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { TwoStepSheet, twoStepAsked } from '../../components/TwoStepSheet';
import { LoadError } from '../../components/LoadError';
import { useTransfer, useWallet, useWallets } from '../../api/hooks';
import { isPendingApproval } from '../../api/types';
import { useAuth } from '../../store/auth';
import { useSendDraft } from '../../store/sendDraft';
import { namesList } from '../../lib/projects';
import { formatAmount, formatNaira, formatYmd } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** SAV-05/BRK-01: half of the fee goes to the charity picked. */
const CHARITY_SHARE = 0.5;

/**
 * BRK-04 Break savings early: how much, the early-break fee (half to the
 * charity picked, half Patriai's), what lands in your Main, who must agree and
 * what's left — then the PIN. With a co-saver it waits for their yes.
 */
export function BreakEarlyScreen({ navigation, route }: RootScreenProps<'BreakEarly'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const q = useWallet(walletId);
  const wallets = useWallets();
  const transfer = useTransfer();
  const draft = useSendDraft();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [twoStep, setTwoStep] = useState<{ asked: ReturnType<typeof twoStepAsked>; pin: string; error: string | null }>({ asked: null, pin: '', error: null });
  const wallet = q.data?.wallet;
  const main = (wallets.data ?? []).find((w) => w.type === 'main' && (w.my_role ?? 'owner') === 'owner');
  const lock = wallet?.lock;
  const feePct = lock?.fee_percent ?? 5;
  const n = parseFloat(amount) || 0;
  const balance = parseFloat(wallet?.available ?? wallet?.balance ?? '0');
  const fee = Math.round(n * feePct) / 100;
  const charityPart = lock?.charity ? Math.floor(fee * CHARITY_SHARE * 100) / 100 : 0;
  const approvers = (q.data?.approval.approvers ?? []).map((a) => a.name.split(' ')[0]);
  const needsYes = approvers.length > 0 && (lock?.approval ?? true);
  const until = lock?.mode === 'date' && lock.until ? `locked until ${formatYmd(lock.until).replace(/ \d{4}$/, '')}` : 'locked until the target';
  const over = n > balance;

  const send = (pin: string, twoFactorCode?: string) => {
    if (!wallet || !main) return;
    setPinError(null);
    transfer.mutate(
      { from_wallet_id: wallet.id, amount: String(n), pin, description: reason.trim() || 'Broke savings early', destination: { kind: 'wallet', wallet_id: main.id }, two_factor_code: twoFactorCode },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          setTwoStep({ asked: null, pin: '', error: null });
          if (isPendingApproval(data)) {
            draft.start(wallet.id);
            draft.setRecipient({ kind: 'wallet', name: main.name, walletId: main.id });
            draft.setAmount(String(n));
            navigation.replace('SendResult', { outcome: 'approval', approvalId: data.approval.id, approvers, at: new Date().toISOString() });
          } else {
            navigation.replace('BreakDone', { reference: data.reference });
          }
        },
        onError: (e) => {
          const asked = twoStepAsked(e);
          if (asked) {
            setPinOpen(false);
            setTwoStep({ asked, pin, error: twoFactorCode ? e.message : null });
            return;
          }
          if (twoFactorCode) return setTwoStep((t) => ({ ...t, error: e.message }));
          setPinError(e.message);
        },
      },
    );
  };

  if (q.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  if (!wallet) return <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />;
  const canBreak = Boolean(q.data?.my_can_spend) && Boolean(lock?.early_break);
  const askLabel = needsYes ? `Ask ${namesList(approvers)} to approve` : 'Break early';

  return (
    <PtPageScreen
      title="Break savings early"
      subtitle={`${wallet.name} · ${until}`}
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title={askLabel} disabled={!canBreak || !main || n <= 0 || over} loading={transfer.isPending} onPress={() => setPinOpen(true)} />
          <PtButton title="Keep saving" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      }
    >
      {!canBreak ? (
        <PtNote tone="attention" icon="lock">
          {lock?.early_break === false ? 'This wallet was set to open only on its date or target. Ask to unlock instead.' : 'Only owners can take money out of this wallet.'}
        </PtNote>
      ) : null}

      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>How much do you need?</Text>
        <PtHeroAmount value={amount} onChange={setAmount} label="How much do you need?" />
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: over ? pt.danger : pt.inkMuted }}>{`${formatNaira(balance)} in the wallet`}</Text>
      </View>

      <PtPanel>
        <PtReviewRow label="You take out" value={formatNaira(n)} />
        <PtReviewRow
          label={`Early-break fee (${feePct}%)`}
          value={`− ${formatAmount(String(fee))}`}
          sub={lock?.charity ? `${formatAmount(String(charityPart))} to ${lock.charity.name} · ${formatAmount(String(fee - charityPart))} Patriai fee` : 'All of it a Patriai fee (no charity picked)'}
        />
        <PtReviewRow label={`You receive in ${main?.name ?? 'Main'}`} value={formatAmount(String(Math.max(0, n - fee)))} />
        {needsYes ? <PtReviewRow label="Also needs" value={`${namesList(approvers)}'s approval`} sub={approvers.length === 1 ? 'They save into this wallet' : 'They save into this wallet too'} /> : null}
        <PtReviewRow label="After this" value={`${formatNaira(Math.max(0, balance - n))} left`} sub="Still locked" last />
      </PtPanel>

      <PtField label={needsYes ? `Reason (${namesList(approvers)} will see it)` : 'Reason (optional)'} value={reason} onChangeText={setReason} placeholder="Hospital bill" maxLength={200} />

      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`Take ${formatNaira(n)} out of ${wallet.name}${needsYes ? `, for ${namesList(approvers)}'s approval` : ''}`}
        amount={formatAmount(String(n))}
        loading={transfer.isPending}
        error={pinError}
        onSubmit={(pin) => send(pin)}
        onClose={() => setPinOpen(false)}
      />
      <TwoStepSheet asked={twoStep.asked} busy={transfer.isPending} error={twoStep.error} onSubmit={(code) => send(twoStep.pin, code)} onClose={() => setTwoStep({ asked: null, pin: '', error: null })} />
    </PtPageScreen>
  );
}
