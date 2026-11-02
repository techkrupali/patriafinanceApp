import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel } from '../../components/pt/PtForm';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PinSheet } from '../../components/PinSheet';
import { TwoStepSheet, twoStepAsked } from '../../components/TwoStepSheet';
import { useBudget, useTransfer, useWallet, useWallets } from '../../api/hooks';
import { useSendOptions } from '../../api/payments';
import { ApiError } from '../../api/client';
import { isPendingApproval, type TransferDestination } from '../../api/types';
import { useAuth } from '../../store/auth';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { feeFor, needsApproval } from '../../lib/sendRules';
import { formatMoney, formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

function Row({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 52, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={{ flexShrink: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink, textAlign: 'right' }} numberOfLines={2}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/**
 * SND-08 Check before you send, then SND-09 the PIN (and the two-step code
 * over ₦500,000). The answer opens SND-12 sent, SND-10 waiting for approval,
 * SND-11 processing, or SND-13 failed with the money back.
 */
export function SendReviewScreen({ navigation }: RootScreenProps<'SendReview'>) {
  const me = useAuth((s) => s.user);
  const wallets = useWallets();
  const options = useSendOptions();
  const transfer = useTransfer();
  const { recipient, fromWalletId, amount, note, categoryId } = useSendDraft();
  const from = (wallets.data ?? []).find((w) => w.id === fromWalletId);
  const budget = useBudget(from?.id ?? 0, from?.type === 'spending');
  const fromDetail = useWallet(from?.id ?? 0);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [twoStep, setTwoStep] = useState<{ asked: ReturnType<typeof twoStepAsked>; pin: string; error: string | null }>({ asked: null, pin: '', error: null });

  const n = parseFloat(amount) || 0;
  const fee = feeFor(recipient, parseFloat(options.data?.bank_fee ?? '20'));
  const approval = from ? needsApproval(from, n) : false;
  // Who the server would ask: owners, co-owners, anyone given a yes (or only the named people).
  const approvers = useMemo(() => fromDetail.data?.approval.approvers ?? [], [fromDetail.data]);
  const category = budget.data?.categories.find((c) => c.id === categoryId)?.name;

  const destination: TransferDestination | null = !recipient
    ? null
    : recipient.kind === 'user'
      ? { kind: 'user', identifier: recipient.identifier }
      : recipient.kind === 'wallet'
        ? { kind: 'wallet', wallet_id: recipient.walletId }
        : recipient.kind === 'group'
          ? { kind: 'group', group_id: recipient.groupId }
          : recipient.kind === 'request'
            ? { kind: 'request', code: recipient.code }
            : { kind: 'bank', bank_code: recipient.bankCode, account_number: recipient.accountNumber, account_name: recipient.name, bank_name: recipient.bankName };

  const send = (pin: string, twoFactorCode?: string) => {
    if (!from || !destination) return;
    setPinError(null);
    transfer.mutate(
      { from_wallet_id: from.id, amount: String(n), pin, description: note.trim() || undefined, budget_category_id: categoryId ?? undefined, destination, two_factor_code: twoFactorCode },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          setTwoStep({ asked: null, pin: '', error: null });
          if (isPendingApproval(data)) {
            navigation.replace('SendResult', { outcome: 'approval', approvalId: data.approval.id, approvers: approvers.map((a) => a.name.split(' ')[0]), at: new Date().toISOString() });
          } else {
            navigation.replace('SendResult', { outcome: 'sent', reference: data.reference, balance: data.balance, at: new Date().toISOString() });
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
          const code = e instanceof ApiError ? (e.data as { code?: string; reference?: string; reason?: string } | undefined) : undefined;
          if (code?.code === 'processing' || code?.code === 'bank_failed') {
            setPinOpen(false);
            navigation.replace('SendResult', { outcome: code.code === 'processing' ? 'processing' : 'failed', reference: code.reference, reason: code.reason, at: new Date().toISOString() });
            return;
          }
          setPinError(e.message);
        },
      },
    );
  };

  if (!recipient || !from) return null;
  const account =
    recipient.kind === 'bank'
      ? `${recipient.name} · ••• ${recipient.accountNumber.slice(-4)}`
      : recipient.kind === 'user'
        ? recipient.sub ?? recipient.identifier
        : recipient.kind === 'group' || recipient.kind === 'request'
          ? recipient.sub ?? recipient.name
          : recipient.name;
  const firstApprover = approvers[0]?.name.split(' ')[0];

  return (
    <PtPageScreen
      title="Check before you send"
      onBack={() => navigation.goBack()}
      footer={<PtButton title={approval ? 'Send for approval' : 'Send'} onPress={() => setPinOpen(true)} loading={transfer.isPending} />}
    >
      <View style={{ alignItems: 'center', gap: 2, paddingVertical: 6 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>You're sending</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, letterSpacing: -1, color: pt.ink }}>{formatNaira(String(n))}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>
          to <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{recipient.name}</Text>
        </Text>
      </View>
      <PtPanel>
        <Row label={recipient.kind === 'user' ? 'On Patriai' : recipient.kind === 'group' ? 'Group' : recipient.kind === 'request' ? 'Goes to' : 'Account'} value={account} />
        <Row label="From" value={from.name} />
        {note.trim() ? <Row label="For" value={note.trim()} /> : null}
        {category ? <Row label="Category" value={category} /> : null}
        <Row label="Fee" value={formatNaira(String(fee))} />
        <Row label="Balance after" value={formatNaira(String(Math.max(0, parseFloat(from.balance) - n - fee)))} last={!approval} />
        {approval ? (
          <Row
            label="Needs approval"
            last
            value={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {approvers.slice(0, 2).map((a) => (
                  <PtAvatar key={a.user_id} initials={initialsOf(a.name)} size={30} tone="mint" />
                ))}
                <PtChip label={approvers.length === 1 ? firstApprover ?? 'Approver' : `${approvers.length} people`} tone="warning" icon="clock" />
              </View>
            }
          />
        ) : null}
      </PtPanel>

      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`${formatNaira(String(n))} to ${recipient.name}${approval ? `, for ${approvers.length === 1 ? `${firstApprover}'s` : 'their'} approval` : ''}`}
        amount={formatMoney(String(n + fee))}
        loading={transfer.isPending}
        error={pinError}
        onSubmit={(pin) => send(pin)}
        onClose={() => setPinOpen(false)}
      />
      <TwoStepSheet asked={twoStep.asked} busy={transfer.isPending} error={twoStep.error} onSubmit={(code) => send(twoStep.pin, code)} onClose={() => setTwoStep({ asked: null, pin: '', error: null })} />
    </PtPageScreen>
  );
}
