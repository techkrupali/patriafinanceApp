import React, { useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow } from '../../components/pt/PtForm';
import { useApproval, useSaveAccount, useWallets } from '../../api/hooks';
import { useRemindApproval, useSavePayee, useSendOptions } from '../../api/payments';
import { feeFor } from '../../lib/sendRules';
import { useSendDraft } from '../../store/sendDraft';
import { PAYEE_CATEGORIES } from './SendBankScreen';
import { formatMoney, formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** "24 Oct 2026, 10:02 am" */
function stamp(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const h = d.getHours() % 12 || 12;
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

function Badge({ icon, bg, fg }: { icon: React.ComponentProps<typeof Feather>['name']; bg: string; fg: string }) {
  return (
    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={icon} size={28} color={fg} />
    </View>
  );
}

/** SND-17 "Save Kelechi for next time?" — after paying someone not saved yet. */
function SaveAfter({ onSaved }: { onSaved: () => void }) {
  const r = useSendDraft((s) => s.recipient);
  const saveBank = useSaveAccount();
  const savePerson = useSavePayee();
  const [nickname, setNickname] = useState(r && r.kind !== 'wallet' && r.kind !== 'group' && r.kind !== 'request' ? r.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');
  const [category, setCategory] = useState('family');
  const [error, setError] = useState<string | null>(null);
  // Only someone new: not a wallet or group, not saved already.
  if (!r || r.kind === 'wallet' || r.kind === 'group' || r.kind === 'request' || r.savedId || (r.kind === 'bank' && r.saved)) return null;
  const first = r.name.split(' ')[0].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const save = () => {
    setError(null);
    const done = { onSuccess: () => { notifySuccess(); onSaved(); }, onError: (e: Error) => setError(e.message) };
    if (r.kind === 'bank') saveBank.mutate({ account_number: r.accountNumber, bank_code: r.bankCode, nickname: nickname.trim() || undefined, category }, done);
    else savePerson.mutate({ identifier: r.identifier, nickname: nickname.trim() || undefined, category }, done);
  };
  return (
    <View style={{ gap: 12, backgroundColor: pt.raised, borderRadius: 18, padding: 16 }}>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{`Save ${first} for next time?`}</Text>
      <PtField label="Nickname" value={nickname} onChangeText={setNickname} maxLength={80} />
      <PtPills compact options={PAYEE_CATEGORIES} value={category} onChange={setCategory} />
      {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}
      <PtButton title="Save account" variant="secondary" onPress={save} loading={saveBank.isPending || savePerson.isPending} />
    </View>
  );
}

/**
 * SND-12 Sent (with the receipt and, for someone new, SND-17 save them),
 * SND-10 Waiting for approval (Remind), SND-11 Processing, SND-13 Failed with
 * the money back.
 */
export function SendResultScreen({ navigation, route }: RootScreenProps<'SendResult'>) {
  const p = route.params;
  const { recipient, amount, note, fromWalletId } = useSendDraft();
  const wallets = useWallets();
  const from = (wallets.data ?? []).find((w) => w.id === fromWalletId);
  const approval = useApproval(p.outcome === 'approval' ? p.approvalId ?? 0 : 0);
  const remind = useRemindApproval(p.approvalId ?? 0);
  const options = useSendOptions();
  const fee = feeFor(recipient, parseFloat(options.data?.bank_fee ?? '20'));
  const [saved, setSaved] = useState(false);
  const n = formatNaira(amount || '0');
  const to = recipient?.name ?? 'them';
  const done = () => navigation.popToTop();

  if (p.outcome === 'processing') {
    return (
      <PtStepScreen footer={<PtButton title="Done" onPress={done} />}>
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 80 }}>
          <ActivityIndicator size="large" color={pt.brand} />
          <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">{`Sending ${n}`}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>{`To ${to}. Banks sometimes take a moment. You can leave this screen.`}</PtText>
        </View>
      </PtStepScreen>
    );
  }

  if (p.outcome === 'failed') {
    return (
      <PtStepScreen
        footer={
          <View style={{ gap: 4 }}>
            <PtButton title="Try again" onPress={() => navigation.replace('SendReview')} />
            {recipient && recipient.kind !== 'wallet' && recipient.kind !== 'request' ? (
              <PtButton title="Try automatically in 1 hour" variant="secondary" onPress={() => navigation.replace('SendSchedule', { retryInHour: true })} />
            ) : null}
            <PtButton title="Done" variant="ghost" onPress={done} />
          </View>
        }
      >
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <Badge icon="x" bg={pt.dangerSoft} fg={pt.danger} />
          <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">This payment didn't go through</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>{`${p.reason ? `${p.reason}. ` : `${to}'s bank isn't responding. `}Your money is back in ${from?.name ?? 'your wallet'}.`}</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="Amount" value={n} />
          <PtReviewRow label="To" value={recipient?.kind === 'bank' ? `${to} · ${recipient.bankName}` : to} />
          <PtReviewRow label="Refunded" value="Instantly · ₦0 fee" last />
        </PtPanel>
      </PtStepScreen>
    );
  }

  if (p.outcome === 'approval') {
    const waiting = approval.data?.waiting_on?.length ? approval.data.waiting_on : p.approvers ?? [];
    const who = waiting.length === 1 ? waiting[0] : waiting.length ? `${waiting.length} people` : 'approval';
    const expires = approval.data?.expires_at ? Math.max(1, Math.round((new Date(approval.data.expires_at).getTime() - Date.now()) / 3_600_000)) : 48;
    return (
      <PtStepScreen
        footer={
          <View style={{ gap: 4 }}>
            <PtButton
              title={waiting.length === 1 ? `Remind ${waiting[0]}` : 'Remind them'}
              variant="secondary"
              loading={remind.isPending}
              onPress={() => remind.mutate(undefined, { onSuccess: () => showAlert('Reminder sent', `We nudged ${who}.`), onError: (e) => showAlert('Not sent', e.message) })}
            />
            <PtButton title="Done" onPress={done} />
          </View>
        }
      >
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <Badge icon="clock" bg="#FDEBC8" fg="#8F5400" />
          <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">{`Waiting for ${who}`}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
            {`We've asked ${who} to approve ${n} to ${to}. The money stays in ${from?.name ?? 'the wallet'} until ${waiting.length === 1 ? 'they do' : 'they answer'}.`}
          </PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="You sent the request" value={stamp(p.at)} />
          <PtReviewRow label={`${waiting.length === 1 ? waiting[0] : 'They'} approve${waiting.length === 1 ? 's' : ''}`} value="Notified on Patriai" sub={`Expires in ${expires} hours`} />
          <PtReviewRow label="Then" value={`Money goes to ${to}`} last />
        </PtPanel>
      </PtStepScreen>
    );
  }

  // ADD-07 → ADD-08: moved between your own wallets.
  if (p.outcome === 'moved') {
    return (
      <PtStepScreen footer={<PtButton title="Done" onPress={done} />}>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
          <Badge icon="check" bg={pt.brandSoft} fg={pt.brand} />
          <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">Money moved</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>{`${formatMoney(amount || '0')} is in ${to}.`}</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="Amount" value={formatMoney(amount || '0')} />
          <PtReviewRow label="From" value={from?.name ?? '—'} sub={p.balance ? `${formatMoney(p.balance)} left` : null} />
          <PtReviewRow label="Fee" value="Free" />
          <PtReviewRow label="Reference" value={p.reference ?? '—'} last />
        </PtPanel>
      </PtStepScreen>
    );
  }

  // SND-12 Sent.
  const receipt = `Patriai receipt\n${n} to ${to}\nFrom ${from?.name ?? ''}${note ? `\nFor ${note}` : ''}\n${stamp(p.at)}\nReference ${p.reference ?? ''}`;
  return (
    <PtStepScreen
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Share receipt" variant="secondary" onPress={() => void Share.share({ message: receipt })} />
          <PtButton title="Done" onPress={done} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
        <Badge icon="check" bg={pt.brandSoft} fg={pt.brand} />
        <PtText color={pt.inkMuted}>{`Sent to ${to}`}</PtText>
        <PtText variant="headline" style={{ fontSize: 34, textAlign: 'center' }} accessibilityRole="header">{formatMoney(amount || '0')}</PtText>
      </View>
      <PtPanel>
        <PtReviewRow label="From" value={from?.name ?? '—'} />
        {note ? <PtReviewRow label="For" value={note} /> : null}
        <PtReviewRow label="Date" value={stamp(p.at)} />
        <PtReviewRow label="Fee" value={formatNaira(String(fee))} />
        <PtReviewRow label="Reference" value={p.reference ?? '—'} last />
      </PtPanel>
      {saved ? <PtNote tone="success">Saved. You'll find them in Saved accounts.</PtNote> : <SaveAfter onSaved={() => setSaved(true)} />}
    </PtStepScreen>
  );
}
