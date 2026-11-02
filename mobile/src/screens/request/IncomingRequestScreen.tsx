import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtField } from '../../components/pt/PtField';
import { PtNote, PtPanel, PtReviewRow, PtSegmented } from '../../components/pt/PtForm';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useWallets } from '../../api/hooks';
import { useMoneyRequest, useMoneyRequestAction, type MoneyRequest } from '../../api/requests';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { canSendFrom, lockedReason } from '../../lib/sendRules';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import { dueLabel } from './RequestMoneyScreen';
import { lowerFirst, requestSummary } from './RequestSentScreen';
import type { RootScreenProps } from '../../navigation/types';

const STATUS: Record<Exclude<MoneyRequest['status'], 'pending'>, { icon: React.ComponentProps<typeof Feather>['name']; bg: string; fg: string; title: (r: MoneyRequest) => string }> = {
  paid: { icon: 'check', bg: pt.brandSoft, fg: pt.brand, title: (r) => (r.mine ? `${(r.payer.name ?? 'They').split(' ')[0]} paid` : 'You paid this') },
  declined: { icon: 'x', bg: pt.dangerSoft, fg: pt.danger, title: (r) => (r.mine ? `${(r.payer.name ?? 'They').split(' ')[0]} declined` : 'You declined this') },
  cancelled: { icon: 'slash', bg: pt.sunken, fg: pt.inkMuted, title: (r) => (r.mine ? 'You cancelled this request' : `${r.requester.first_name} cancelled this request`) },
};

/**
 * REQ-03 Incoming request: who asked, how much and why, which wallet it goes
 * to (and whether you're in it), when it's due and which wallet you pay from →
 * SND-08/09 with your PIN; or pay part, or decline. The one who asked sees
 * where it stands instead: remind, share the link or cancel.
 */
export function IncomingRequestScreen({ navigation, route }: RootScreenProps<'IncomingRequest'>) {
  const { code } = route.params;
  const q = useMoneyRequest(code);
  const wallets = useWallets();
  const draft = useSendDraft();
  const decline = useMoneyRequestAction(code, 'decline');
  const cancel = useMoneyRequestAction(code, 'cancel');
  const remind = useMoneyRequestAction(code, 'remind');
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<'part' | 'decline'>('part');
  const [part, setPart] = useState('');
  const [reason, setReason] = useState('');
  const r = q.data;
  const left = parseFloat(r?.left ?? '0');
  // "Main wallet" alone reads like the payer's own: "Ngozi's Main wallet".
  const goesTo = r ? (r.wallet.type === 'main' && !r.mine ? `${r.requester.first_name}'s ${r.wallet.name}` : r.wallet.name) : '';

  // The payment is put together in the send draft, so SND-02 (Edit) and SND-08 read it.
  const sources = (wallets.data ?? []).filter((w) => canSendFrom(w) && !lockedReason(w));
  const from = sources.find((w) => w.id === draft.fromWalletId) ?? sources.find((w) => w.type === 'main') ?? sources[0];
  useEffect(() => {
    if (!r || r.mine || r.status !== 'pending') return;
    draft.start(from?.id ?? null);
    draft.setRecipient({ kind: 'request', name: r.requester.name, code: r.code, sub: goesTo });
    draft.setAmount(r.left);
    draft.setNote(r.note ?? '');
  }, [r?.code, r?.status, from?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = (naira: number) => {
    if (!r || !from) return;
    setSheet(false);
    draft.setRecipient({ kind: 'request', name: r.requester.name, code: r.code, sub: goesTo });
    draft.setFrom(from.id);
    draft.setAmount(String(naira));
    navigation.navigate(from.type === 'spending' ? 'SendNote' : 'SendReview');
  };

  if (q.isLoading) {
    return (
      <PtStepScreen onBack={() => navigation.goBack()}>
        <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />
      </PtStepScreen>
    );
  }
  if (!r) {
    return (
      <PtStepScreen onBack={() => navigation.goBack()}>
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      </PtStepScreen>
    );
  }

  const paidSoFar = parseFloat(r.paid_amount) > 0 ? <PtReviewRow label="Paid so far" value={`${formatNaira(r.paid_amount)} of ${formatNaira(r.amount)}`} /> : null;

  // Finished: paid, declined or cancelled.
  if (r.status !== 'pending') {
    const s = STATUS[r.status];
    return (
      <PtStepScreen
        onBack={() => navigation.goBack()}
        footer={
          <View style={{ gap: 4 }}>
            {r.mine && r.split ? <PtButton title="See the split" variant="secondary" onPress={() => navigation.navigate('SplitBill', { key: r.split!.key })} /> : null}
            <PtButton title="Done" onPress={() => navigation.goBack()} />
          </View>
        }
      >
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={s.icon} size={28} color={s.fg} />
          </View>
          <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">{s.title(r)}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>{`${formatNaira(r.amount)}${r.note ? ` · ${r.note}` : ''}`}</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label={r.mine ? 'From' : 'Asked by'} value={r.mine ? r.payer.name ?? '—' : r.requester.name} />
          <PtReviewRow label="Goes to" value={goesTo} />
          {paidSoFar}
          {r.decline_reason ? <PtReviewRow label="Why" value={`"${r.decline_reason}"`} /> : null}
          <PtReviewRow label="Link" value={`…/r/${r.code}`} last />
        </PtPanel>
      </PtStepScreen>
    );
  }

  // The one who asked: where it stands.
  if (r.mine) {
    const first = (r.payer.name ?? 'them').split(' ')[0];
    return (
      <PtStepScreen
        onBack={() => navigation.goBack()}
        footer={
          <View style={{ gap: 4 }}>
            <PtButton
              title={`Remind ${first}`}
              variant="secondary"
              loading={remind.isPending}
              onPress={() => remind.mutate(undefined, { onSuccess: () => showAlert('Reminder sent', `We nudged ${first}.`), onError: (e) => showAlert('Not sent', e.message) })}
            />
            <PtButton title="Share the link" onPress={() => void Share.share({ message: `${r.requester.first_name} asked you for ${formatNaira(r.left)}${r.note ? ` for ${lowerFirst(r.note)}` : ''}. Pay here: ${r.link}` })} />
            <PtButton
              title="Cancel request"
              variant="ghost"
              loading={cancel.isPending}
              onPress={() =>
                showAlert('Cancel this request?', `${first} won't be able to pay it any more.`, [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel request', style: 'destructive', onPress: () => cancel.mutate(undefined, { onError: (e) => showAlert('Not cancelled', e.message) }) },
                ])
              }
            />
          </View>
        }
      >
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 16 }}>
          <PtAvatar initials={initialsOf(r.payer.name ?? '?')} size={64} tone={r.payer.on_patriai ? 'brand' : 'gold'} />
          <PtText color={pt.inkMuted}>
            You asked <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{r.payer.name}</Text> for
          </PtText>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, letterSpacing: -1, color: pt.ink }}>{formatNaira(r.left)}</Text>
          <View>
            <PtChip label={r.payer.on_patriai ? 'Waiting' : 'Not on Patriai · link sent'} tone="warning" icon="clock" />
          </View>
        </View>
        <PtPanel>
          {r.note ? <PtReviewRow label="What for" value={r.note} /> : null}
          <PtReviewRow label="Pays into" value={r.wallet.name} last={!paidSoFar && !r.due_on} />
          {paidSoFar}
          {r.due_on ? <PtReviewRow label="Due" value={dueLabel(r.due_on)} last /> : null}
        </PtPanel>
        {r.split ? <PtButton title={`See the split · ${r.split.title}`} variant="ghost" onPress={() => navigation.navigate('SplitBill', { key: r.split!.key })} /> : null}
        <PtNote tone="info">{requestSummary(r).replace(/^[^.]*\.\s*/, '') || 'Anyone with the link can pay it, even without the app.'}</PtNote>
      </PtStepScreen>
    );
  }

  // REQ-03 asked of you.
  const n = parseFloat(part) || 0;
  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title={`Pay ${formatNaira(r.left)}`} disabled={!from} onPress={() => pay(left)} />
          <PtButton title="Pay part, or decline" variant="ghost" onPress={() => setSheet(true)} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 16 }}>
        <PtAvatar initials={initialsOf(r.requester.name)} size={64} tone="brand" />
        <PtText color={pt.inkMuted}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{r.requester.name}</Text> asked you for
        </PtText>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, letterSpacing: -1, color: pt.ink }}>{formatNaira(r.left)}</Text>
        {r.note ? <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>{`"${r.note}"`}</PtText> : null}
      </View>
      <PtPanel>
        <PtReviewRow label="Goes to" value={goesTo} sub={r.payer_is_member ? "You're a contributor" : r.wallet.type === 'main' ? null : `${r.requester.first_name}'s wallet`} />
        {paidSoFar}
        {r.due_on ? <PtReviewRow label="Due" value={dueLabel(r.due_on)} /> : null}
        <PtReviewRow label="Pay from" value={from ? `${from.name} · ${formatNaira(from.balance)}` : 'No wallet can pay right now'} onEdit={from ? () => navigation.navigate('SendFrom') : undefined} last />
      </PtPanel>

      <PtSheet
        visible={sheet}
        title="Pay part, or decline"
        subtitle={`${formatNaira(r.left)} from ${r.requester.first_name}`}
        onClose={() => setSheet(false)}
        footer={
          mode === 'part' ? (
            <PtButton title={n ? `Pay ${formatNaira(String(n))}` : 'Pay'} disabled={!n || n > left} onPress={() => pay(n)} />
          ) : (
            <PtButton
              title="Decline"
              loading={decline.isPending}
              onPress={() =>
                decline.mutate(
                  { reason: reason.trim() || undefined },
                  {
                    onSuccess: () => {
                      notifySuccess();
                      setSheet(false);
                    },
                    onError: (e) => showAlert('Not declined', e.message),
                  },
                )
              }
            />
          )
        }
      >
        <View style={{ gap: 14 }}>
          <PtSegmented
            options={[
              { value: 'part', label: 'Pay part' },
              { value: 'decline', label: 'Decline' },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'part' ? (
            <PtField
              label="How much now?"
              prefix="₦"
              value={groupAmountInput(part)}
              onChangeText={(t) => setPart(sanitizeAmountInput(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              hint={n > left ? `No more than ${formatNaira(r.left)}` : `The rest, ${formatNaira(String(Math.max(0, left - n)))}, stays asked`}
            />
          ) : (
            <PtField label="Tell them why (optional)" value={reason} onChangeText={setReason} placeholder="I paid Mama directly" maxLength={200} />
          )}
        </View>
      </PtSheet>
    </PtStepScreen>
  );
}
