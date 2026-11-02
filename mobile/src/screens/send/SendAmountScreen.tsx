import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtNote } from '../../components/pt/PtForm';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtPanel } from '../../components/pt/PtForm';
import { useWallet, useWallets } from '../../api/hooks';
import { useSendOptions } from '../../api/payments';
import { useAuth } from '../../store/auth';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { canSendFrom, feeFor, lockedReason, needsApproval, spendable } from '../../lib/sendRules';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/** SND-07 "Repeat this payment · Like every Saturday" → SND-14. */
export function RepeatRow({ onPress }: { onPress: () => void }) {
  return (
    <PtRow
      title="Repeat this payment"
      subtitle="Like every Saturday"
      left={
        <PtIconTile>
          <Feather name="repeat" size={18} color={pt.brand} />
        </PtIconTile>
      }
      chevron
      onPress={onPress}
      last
    />
  );
}

/**
 * SND-06 How much: who it's to, the amount and fee, which wallet it comes
 * from (Change → SND-02), what it's for, and whether the wallet needs someone's
 * approval first ("House Project needs Emeka's approval for anything over ₦100,000").
 */
export function SendAmountScreen({ navigation }: RootScreenProps<'SendAmount'>) {
  const me = useAuth((s) => s.user);
  const wallets = useWallets();
  const options = useSendOptions();
  const { recipient, fromWalletId, amount, note, setAmount, setNote, setFrom } = useSendDraft();

  const list = (wallets.data ?? []).filter(canSendFrom);
  const from = list.find((w) => w.id === fromWalletId) ?? list.find((w) => w.type === 'main') ?? list[0];
  useEffect(() => {
    if (from && from.id !== fromWalletId) setFrom(from.id);
  }, [from?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromDetail = useWallet(from?.id ?? 0);
  const n = parseFloat(amount) || 0;
  const fee = feeFor(recipient, parseFloat(options.data?.bank_fee ?? '20'));
  const approval = from ? needsApproval(from, n) : false;
  const approvers = useMemo(
    () => (fromDetail.data?.approval.approvers ?? []).map((a) => a.name.split(' ')[0]),
    [fromDetail.data],
  );
  const locked = from ? lockedReason(from) : null;
  const short = from ? n + fee > spendable(from) : false;
  const ok = recipient && from && n > 0 && !short && !locked;

  const next = () => (from?.type === 'spending' ? navigation.navigate('SendNote') : navigation.navigate('SendReview'));

  if (!recipient) return null;

  return (
    <PtPageScreen title="How much?" onBack={() => navigation.goBack()} footer={<PtButton title="Review" onPress={next} disabled={!ok} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PtAvatar initials={initialsOf(recipient.name)} size={48} tone="deep" uri={recipient.kind === 'user' ? recipient.avatarUrl : null} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }} numberOfLines={1}>{recipient.name}</Text>
          {recipient.sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>{recipient.sub}</Text> : null}
        </View>
        {recipient.kind === 'bank' && recipient.verified ? <PtChip label="Verified" tone="success" icon="check" /> : null}
      </View>

      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.lg, paddingVertical: 22, alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 12, letterSpacing: 1, color: pt.inkMuted }}>AMOUNT</Text>
        <PtHeroAmount value={amount} onChange={setAmount} label="Amount" />
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Fee {formatNaira(String(fee))}</Text>
      </View>

      {from ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14 }}>
          <PtIconTile round>
            <Feather name="credit-card" size={18} color={pt.brand} />
          </PtIconTile>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>From</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
              {from.name} · {formatNaira(from.balance)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              selection();
              navigation.navigate('SendFrom');
            }}
            accessibilityRole="button"
            accessibilityLabel="Change wallet"
            hitSlop={8}
          >
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Change</Text>
          </Pressable>
        </View>
      ) : null}

      <PtField label="What's it for?" value={note} onChangeText={setNote} placeholder={recipient.kind === 'user' ? `${recipient.name.split(' ')[0]} will see this` : 'School fees, first term'} maxLength={200} />

      {/* Spending wallets offer it on SND-07 with the category. */}
      {from?.type !== 'spending' && recipient.kind !== 'wallet' && recipient.kind !== 'request' ? (
        <PtPanel>
          <RepeatRow onPress={() => ok && navigation.navigate('SendSchedule')} />
        </PtPanel>
      ) : null}

      {locked ? (
        <PtNote tone="attention" icon="lock">{`${from?.name} can't pay out right now: ${locked}. Choose another wallet.`}</PtNote>
      ) : short ? (
        <PtNote tone="attention" icon="alert-triangle">{`${from?.name} has ${formatNaira(String(from ? spendable(from) : 0))}${fee ? ` and this needs ${formatNaira(String(n + fee))} with the fee` : ''}. Send less or choose another wallet.`}</PtNote>
      ) : approval ? (
        <PtNote tone="warning" icon="clock">
          {`${from?.name} needs ${approvers.length ? `${approvers.join(' and ')}'s` : 'an'} approval for anything over ${formatNaira(from?.approval_threshold ?? '0')}. We'll send it once ${approvers.length === 1 ? `${approvers[0]} approves` : 'they approve'}.`}
        </PtNote>
      ) : null}
    </PtPageScreen>
  );
}
