import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PinSheet } from '../../components/PinSheet';
import { TwoStepSheet, twoStepAsked } from '../../components/TwoStepSheet';
import { useChildView } from '../../api/child';
import { useTransfer, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { canSendFrom, lockedReason, spendable } from '../../lib/sendRules';
import { formatMoney, formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * WPV-05 "Send a gift" / "Add to the bike": a relative gives into a child's
 * wallet or straight into the child's goal, from one of their own wallets. The
 * child gets a note saying who it's from; the parents see it.
 */
export function ChildGiftScreen({ navigation, route }: RootScreenProps<'ChildGift'>) {
  const { walletId, into } = route.params;
  const me = useAuth((s) => s.user);
  const view = useChildView(walletId);
  const wallets = useWallets();
  const transfer = useTransfer();
  const [amount, setAmount] = useState('');
  const [fromId, setFromId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [twoStep, setTwoStep] = useState<{ asked: ReturnType<typeof twoStepAsked>; pin: string; error: string | null }>({ asked: null, pin: '', error: null });
  const v = view.data;
  // The giver's own wallets.
  const sources = (wallets.data ?? []).filter((w) => (w.my_role ?? 'owner') === 'owner').filter((w) => canSendFrom(w) && !lockedReason(w) && w.type !== 'child');
  const from = sources.find((w) => w.id === fromId) ?? sources.find((w) => w.type === 'main') ?? sources[0];
  const n = parseFloat(amount) || 0;
  const target = into === 'goal' ? v?.goal?.wallet_id : walletId;
  const what = into === 'goal' && v?.goal ? `${v.first_name}'s ${v.goal.name.toLowerCase().replace(/^new /, '')}` : `${v?.first_name ?? 'their'}'s wallet`;

  const send = (pin: string, code?: string) => {
    if (!from || !target) return;
    setPinError(null);
    transfer.mutate(
      { from_wallet_id: from.id, amount: String(n), pin, description: `A gift from ${me?.first_name ?? 'family'}`, destination: { kind: 'wallet', wallet_id: target }, two_factor_code: code },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          setTwoStep({ asked: null, pin: '', error: null });
          showAlert('Sent', `${formatNaira(n)} is in ${what}. ${v?.first_name} gets a note saying it's from you.`);
          navigation.goBack();
        },
        onError: (e) => {
          const asked = twoStepAsked(e);
          if (asked) {
            setPinOpen(false);
            setTwoStep({ asked, pin, error: code ? e.message : null });
            return;
          }
          if (code) return setTwoStep((t) => ({ ...t, error: e.message }));
          setPinError(e.message);
        },
      },
    );
  };

  if (!v) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;

  return (
    <PtPageScreen
      title={into === 'goal' ? `Add to the ${v.goal?.name.split(' ').slice(-1)[0].toLowerCase() ?? 'goal'}` : 'Send a gift'}
      subtitle={`For ${v.first_name}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={n ? `Send ${formatNaira(n)}` : 'Send'} disabled={!from || !target || !n || n > (from ? spendable(from) : 0) || !v.gifts} onPress={() => setPinOpen(true)} loading={transfer.isPending} />}
    >
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <PtHeroAmount value={amount} onChange={setAmount} label="Amount" />
      </View>
      <PtPanel>
        <PtReviewRow label="Into" value={what} sub={into === 'goal' && v.goal ? `${formatNaira(v.goal.saved)} of ${formatNaira(v.goal.target)} so far` : null} />
        <PtReviewRow label="From" value={from ? `${from.name} · ${formatNaira(from.balance)}` : 'No wallet to give from'} onEdit={sources.length > 1 ? () => setPicking(true) : undefined} last />
      </PtPanel>
      {!v.gifts ? <PtNote tone="attention">{`${v.parents[0]?.first_name ?? 'The parents'} turned gifts off for now.`}</PtNote> : <PtNote tone="info">{`${v.parents.map((p) => p.first_name).join(' and ')} see your gift. ${v.first_name} gets a note saying it's from you.`}</PtNote>}
      <PtOptionSheet
        visible={picking}
        title="Give from"
        options={sources.map((w) => ({ value: w.id, label: `${w.name} · ${formatNaira(w.balance)}` }))}
        value={from?.id ?? null}
        onPick={(id) => {
          setFromId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
      <PinSheet visible={pinOpen} title="Enter your PIN" subtitle={`${formatNaira(n)} for ${what}`} amount={formatMoney(String(n))} loading={transfer.isPending} error={pinError} onSubmit={(pin) => send(pin)} onClose={() => setPinOpen(false)} />
      <TwoStepSheet asked={twoStep.asked} busy={transfer.isPending} error={twoStep.error} onSubmit={(c) => send(twoStep.pin, c)} onClose={() => setTwoStep({ asked: null, pin: '', error: null })} />
    </PtPageScreen>
  );
}
