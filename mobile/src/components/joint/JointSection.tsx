import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../pt/PtButton';
import { PtField } from '../pt/PtField';
import { PtText } from '../pt/PtText';
import { PtOptionSheet } from '../pt/PtOptionSheet';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../pt/PtForm';
import { PinSheet } from '../PinSheet';
import { useJointActions, useResendInvitation } from '../../api/hooks';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { jointTerms } from '../../lib/joint';
import type { Wallet } from '../../api/types';

const PER_PAYMENT = [20_000, 30_000, 50_000, 75_000, 100_000, 150_000, 200_000];

type Pending =
  | { kind: 'limit'; perPayment: number }
  | { kind: 'answer'; agree: boolean }
  | { kind: 'leave' }
  | { kind: 'close' };

/**
 * A joint wallet after setup: waiting for the partner, a rule change or a close
 * that needs the other's PIN, notice to leave, and the rules both agreed.
 */
export function JointSection({ wallet, myId }: { wallet: Wallet; myId: number | undefined }) {
  const j = wallet.joint;
  const actions = useJointActions(wallet.id);
  const resend = useResendInvitation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [picking, setPicking] = useState(false);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!j || j.state === 'closed') return null;

  const iAmOwner = wallet.owner ? wallet.owner.id === myId : true;
  const other = iAmOwner ? j.partner : wallet.owner ? { id: wallet.owner.id, name: wallet.owner.name } : null;
  const otherName = (other?.name ?? 'your partner').split(/\s+/)[0];
  const terms = jointTerms(j, !iAmOwner);
  const ids = [myId, other?.id].filter((x): x is number => typeof x === 'number');
  const busy = actions.propose.isPending || actions.answer.isPending || actions.leave.isPending || actions.close.isPending;

  const run = (pin: string) => {
    if (!pending) return;
    setError(null);
    const done = (text: string) => () => {
      setPending(null);
      setMessage(text);
    };
    const fail = (e: Error) => setError(e.message);
    if (pending.kind === 'limit') {
      actions.propose.mutate(
        { pin, changes: { per_payment: String(pending.perPayment), per_day: String(Math.max(pending.perPayment, Number(j.limits.per_day))) } },
        { onSuccess: (r) => done(r.applied ? 'Rules changed.' : `Sent to ${otherName} to agree.`)(), onError: fail },
      );
    } else if (pending.kind === 'answer') {
      actions.answer.mutate({ pin, agree: pending.agree }, { onSuccess: done(pending.agree ? 'Rules changed.' : 'You said no to the change.'), onError: fail });
    } else if (pending.kind === 'leave') {
      actions.leave.mutate({ pin }, { onSuccess: done('Notice given. Payments continue until it ends.'), onError: fail });
    } else {
      const body = j.leave.split === 'decide' && !j.closing ? { pin, shares: ids.map((id) => ({ user_id: id, amount: shares[id] || '0' })) } : { pin };
      actions.close.mutate(body, { onSuccess: (r) => done(r.closed ? 'Closed. Each share is in your Main wallets.' : `Waiting for ${otherName} to confirm with their PIN.`)(), onError: fail });
    }
  };

  const banner = (title: string, sub: string, buttons?: React.ReactNode) => (
    <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: '#FFFFFF' }}>{title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.onDarkMuted }}>{sub}</Text>
      </View>
      {buttons}
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      {j.state === 'waiting'
        ? banner(
            `Waiting for ${otherName}`,
            `The account number and both contributions start once they accept the rules.${j.invitation?.expires_at ? ` Invite expires ${formatYmd(j.invitation.expires_at.slice(0, 10))}.` : ''}`,
            j.invitation && iAmOwner ? (
              <PtButton
                title={`Remind ${otherName}`}
                variant="secondary"
                size="sm"
                loading={resend.isPending}
                onPress={() =>
                  j.invitation &&
                  resend.mutate({ walletId: wallet.id, invitationId: j.invitation.id }, { onSuccess: () => setMessage('Reminder sent.'), onError: (e) => setError(e.message) })
                }
              />
            ) : null,
          )
        : null}
      {j.proposal
        ? j.proposal.by === myId
          ? banner(`Waiting for ${otherName} to agree`, j.proposal.summary)
          : banner(
              `${otherName} wants to change the rules`,
              `${j.proposal.summary} It only changes if you agree.`,
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PtButton title="Say no" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setPending({ kind: 'answer', agree: false })} />
                <PtButton title="Agree" size="sm" style={{ flex: 1 }} onPress={() => setPending({ kind: 'answer', agree: true })} />
              </View>,
            )
        : null}
      {j.closing
        ? j.closing.by === myId
          ? banner('Closing', `Waiting for ${otherName} to confirm with their PIN.`)
          : banner(`${otherName} wants to close ${wallet.name}`, 'It closes, and the money splits, when you confirm with your PIN.', <PtButton title="Confirm with PIN" size="sm" onPress={() => setPending({ kind: 'close' })} />)
        : null}
      {j.leaving ? banner(j.leaving.by === myId ? 'You gave notice' : `${otherName} gave notice`, `Payments continue until ${formatYmd(j.leaving.ends_on)}. Then the money splits the way you agreed.`) : null}

      {message ? <PtNote tone="success">{message}</PtNote> : null}
      {error ? (
        <PtText variant="caption" color={pt.danger}>
          {error}
        </PtText>
      ) : null}

      <View style={{ gap: 10 }}>
        <PtGroupLabel>The rules you both agreed</PtGroupLabel>
        <PtPanel>
          {terms.map((t, i) => (
            <PtReviewRow
              key={t.label}
              label={t.label}
              value={t.value}
              sub={t.sub}
              onEdit={t.label === 'Spend alone' && j.state === 'open' && !j.proposal ? () => setPicking(true) : undefined}
              last={i === terms.length - 1}
            />
          ))}
        </PtPanel>
      </View>

      {j.state === 'open' && !j.closing ? (
        <View style={{ gap: 10 }}>
          {j.leave.split === 'decide' ? (
            <PtPanel>
              <View style={{ paddingVertical: 12, gap: 10 }}>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                  You decide the split together. Say what each of you gets (it has to add up to {formatNaira(wallet.balance)}).
                </Text>
                {ids.map((id) => (
                  <PtField
                    key={id}
                    label={id === myId ? 'You get' : `${otherName} gets`}
                    prefix="₦"
                    value={groupAmountInput(shares[id] ?? '')}
                    onChangeText={(t) => setShares((s) => ({ ...s, [id]: sanitizeAmountInput(t) }))}
                    keyboardType="decimal-pad"
                  />
                ))}
              </View>
            </PtPanel>
          ) : null}
          <PtButton title="Close the wallet" variant="secondary" onPress={() => setPending({ kind: 'close' })} />
          {!j.leaving ? <PtButton title="Give notice to leave" variant="ghost" onPress={() => setPending({ kind: 'leave' })} /> : null}
        </View>
      ) : null}

      <PtOptionSheet
        visible={picking}
        title="Spend alone, per payment"
        options={PER_PAYMENT.map((v) => ({ value: v, label: `Up to ${formatNaira(v)}`, hint: j.always.rules ? `${otherName} agrees first` : undefined }))}
        value={Number(j.limits.per_payment)}
        onPick={(v) => {
          setPicking(false);
          setPending({ kind: 'limit', perPayment: v });
        }}
        onClose={() => setPicking(false)}
      />
      <PinSheet
        visible={pending !== null}
        title="Enter your PIN"
        subtitle={
          pending?.kind === 'close'
            ? `To close ${wallet.name}`
            : pending?.kind === 'leave'
              ? `To give ${j.leave.notice_days} days' notice`
              : pending?.kind === 'answer'
                ? pending.agree
                  ? 'To agree to the change'
                  : 'To say no to the change'
                : 'To change the joint rules'
        }
        loading={busy}
        error={error}
        onSubmit={run}
        onClose={() => setPending(null)}
      />
    </View>
  );
}
