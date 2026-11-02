import React, { useState } from 'react';
import { Platform, ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { PtRadio } from '../../components/pt/PtCheck';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PinSheet } from '../../components/PinSheet';
import { useTransfer, useWallets } from '../../api/hooks';
import { isPendingApproval, type Wallet } from '../../api/types';
import { useAuth } from '../../store/auth';
import { useSendDraft } from '../../store/sendDraft';
import { canSendFrom, lockedReason, needsApproval, spendable } from '../../lib/sendRules';
import { formatMoney, formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/** RNGH's Pressable ignores taps on role=radio elements on web; native keeps the radio role. */
const RADIO_ROLE = Platform.OS === 'web' ? 'button' : 'radio';

const TYPE: Record<string, string> = { goal: 'Goal', savings: 'Savings', spending: 'Spending', joint: 'Joint', project: 'Project', child: 'Child', emergency: 'Emergency', giving: 'Giving', main: 'Main' };

/** "Goal · ₦170,000 to go" · "Savings · locked" · "Spending" · "Ngozi" */
function sub(w: Wallet, me: string | undefined): string {
  if (w.type === 'main') return w.owner?.name?.split(' ')[0] ?? me ?? '';
  const left = w.target_amount ? parseFloat(w.target_amount) - parseFloat(w.balance) : 0;
  if (w.type === 'goal' && left > 0) return `Goal · ${formatNaira(String(left))} to go`;
  if (w.lock?.locked || w.goal_locked) return `${TYPE[w.type] ?? w.type} · locked`;
  return TYPE[w.type] ?? w.type;
}

/**
 * ADD-07 Move money between your wallets: from one (Main by default) into
 * another — free and instant — then the PIN. Into a locked savings wallet is
 * fine; out of one isn't.
 */
export function MoveMoneyScreen({ navigation, route }: RootScreenProps<'MoveMoney'>) {
  const me = useAuth((s) => s.user);
  const wallets = useWallets();
  const transfer = useTransfer();
  const draft = useSendDraft();
  const list = (wallets.data ?? []).filter((w) => !w.closed && w.status !== 'suspended');
  const sources = list.filter((w) => canSendFrom(w) && !lockedReason(w));
  const [fromId, setFromId] = useState<number | null>(route.params?.fromWalletId ?? null);
  const from = sources.find((w) => w.id === fromId) ?? sources.find((w) => w.type === 'main') ?? sources[0];
  // TRS-04 "Top up": the wallet it was opened for comes first, already chosen.
  const targets = list.filter((w) => w.id !== from?.id).sort((a, b) => Number(b.id === route.params?.toWalletId) - Number(a.id === route.params?.toWalletId));
  const [toId, setToId] = useState<number | null>(route.params?.toWalletId ?? null);
  const to = targets.find((w) => w.id === toId);
  const [amount, setAmount] = useState('');
  const [picking, setPicking] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const n = parseFloat(amount) || 0;
  const short = from ? n > spendable(from) : false;
  const approval = from ? needsApproval(from, n) : false;

  const move = (pin: string) => {
    if (!from || !to) return;
    setPinError(null);
    transfer.mutate(
      { from_wallet_id: from.id, amount: String(n), pin, destination: { kind: 'wallet', wallet_id: to.id } },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          draft.start(from.id);
          draft.setRecipient({ kind: 'wallet', name: to.name, walletId: to.id });
          draft.setAmount(String(n));
          if (isPendingApproval(data)) navigation.replace('SendResult', { outcome: 'approval', approvalId: data.approval.id, at: new Date().toISOString() });
          else navigation.replace('SendResult', { outcome: 'moved', reference: data.reference, balance: data.balance, at: new Date().toISOString() });
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Move money"
      subtitle="Between your wallets"
      onBack={() => navigation.goBack()}
      footer={<PtButton title={n ? `Move ${formatNaira(String(n))}` : 'Move'} disabled={!from || !to || !n || short} onPress={() => setPinOpen(true)} loading={transfer.isPending} />}
    >
      {wallets.isLoading ? <ActivityIndicator color={pt.brand} /> : null}
      {from ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>From</PtGroupLabel>
          <Pressable
            onPress={() => {
              selection();
              setPicking(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`From ${from.name}. Change`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{from.name}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{sub(from, me?.first_name)}</Text>
            </View>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{formatNaira(from.balance)}</Text>
            <PtRadio checked />
          </Pressable>
          <View style={{ alignSelf: 'center', width: 40, height: 40, borderRadius: 20, backgroundColor: pt.emerald700, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="arrow-down" size={20} color="#FFFFFF" />
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <PtGroupLabel>To</PtGroupLabel>
        <PtPanel>
          {targets.map((w, i) => (
            <Pressable
              key={w.id}
              onPress={() => {
                selection();
                setToId(w.id);
              }}
              accessibilityRole={RADIO_ROLE}
              accessibilityState={{ checked: w.id === toId }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: i === targets.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{w.name}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{sub(w, me?.first_name)}</Text>
              </View>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{formatNaira(w.balance)}</Text>
              <PtRadio checked={w.id === toId} />
            </Pressable>
          ))}
        </PtPanel>
      </View>

      <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" hint={short ? undefined : 'Free and instant'} />
      {short ? <PtNote tone="attention">{`${from?.name} has ${formatNaira(String(from ? spendable(from) : 0))} to move.`}</PtNote> : approval ? <PtNote tone="warning" icon="clock">{`${from?.name} needs an approval for this much. We'll move it once they say yes.`}</PtNote> : null}

      <PtOptionSheet
        visible={picking}
        title="Move from"
        options={sources.map((w) => ({ value: w.id, label: `${w.name} · ${formatNaira(w.balance)}` }))}
        value={from?.id ?? null}
        onPick={(v) => {
          setFromId(v);
          if (v === toId) setToId(null);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={to ? `Move ${formatNaira(String(n))} to ${to.name}` : undefined}
        amount={formatMoney(String(n))}
        loading={transfer.isPending}
        error={pinError}
        onSubmit={move}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
