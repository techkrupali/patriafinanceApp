import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../../theme';
import { PtPageScreen } from '../../../components/pt/PtPageScreen';
import { PtStepScreen } from '../../../components/pt/PtStepScreen';
import { PtButton } from '../../../components/pt/PtButton';
import { PtField } from '../../../components/pt/PtField';
import { PtText } from '../../../components/pt/PtText';
import { PtNote, PtPanel, PtReviewRow } from '../../../components/pt/PtForm';
import { PtSheet } from '../../../components/pt/PtSheet';
import { PersonRow } from '../../../components/project/ProjectUi';
import { clock } from '../../../components/emergency/EmergencyUi';
import { AVATAR_CYCLE } from '../../../components/pt/PtAvatar';
import { BankPicker } from '../../../components/BankPicker';
import { PinSheet } from '../../../components/PinSheet';
import { useEmergency, useEmergencyActions, useVerifyAccount, useWallet } from '../../../api/hooks';
import { useAuth } from '../../../store/auth';
import { pickFile, type PickedFile } from '../../../lib/upload';
import { formatMoney, formatNaira, groupAmountInput, initials, sanitizeAmountInput } from '../../../lib/format';
import { notifySuccess } from '../../../lib/haptics';
import type { Bank, EmergencyRequest } from '../../../api/types';
import type { RootScreenProps } from '../../../navigation/types';

const first = (name: string | null | undefined) => (name ?? '').split(' ')[0];

/**
 * WAL-17 Release money: how much, what happened, who's paid (the hospital's
 * verified account when the fund pays bills directly, otherwise your Main),
 * the proof, and the keyholders who'll be asked. Within the fast-release limit
 * with proof it goes at once; otherwise it waits for the keyholders (SND-10).
 */
export function EmergencyReleaseScreen({ navigation, route }: RootScreenProps<'EmergencyRelease'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const q = useEmergency(walletId);
  const detail = useWallet(walletId);
  const { release } = useEmergencyActions(walletId);
  const verify = useVerifyAccount();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<PickedFile | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState<Bank | null>(null);
  const [account, setAccount] = useState('');
  const [payee, setPayee] = useState<{ account_name: string; bank_name: string } | null>(null);
  const [payeeError, setPayeeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [done, setDone] = useState<EmergencyRequest | null>(null);
  const e = q.data;
  const wallet = detail.data?.wallet;

  useEffect(() => {
    setPayee(null);
    setPayeeError(null);
    if (!bank || account.length !== 10) return;
    verify.mutate({ account_number: account, bank_code: bank.bank_code }, { onSuccess: (d) => setPayee(d), onError: (err) => setPayeeError(err.message) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank?.bank_code, account]);

  if (!e || !wallet) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;

  const n = parseFloat(amount) || 0;
  const owner = wallet.owner ?? { id: detail.data?.members.find((m) => m.role === 'owner')?.user_id ?? 0, name: detail.data?.members.find((m) => m.role === 'owner')?.name ?? '' };
  // The owner holds a key too; then the people they chose.
  const keyholders = [{ id: owner.id, name: owner.name }, ...(e.rules.keyholders ?? []).map((k) => ({ id: k.id, name: k.name }))];
  // You first, as the one asking (WAL-17 "Ngozi (you)").
  const listed = [...keyholders.filter((k) => k.id === me?.id), ...keyholders.filter((k) => k.id !== me?.id)];
  const need = e.rules.required_keyholders || 1;
  const fast = e.rules.fast_release;
  const fastLimit = fast ? parseFloat(fast.limit) : 0;
  const direct = Boolean(e.rules.pay_directly);
  const iHoldAKey = keyholders.some((k) => k.id === me?.id);
  // Goes at once: a keyholder, within the limit, with proof, and fast release open.
  const goesNow = Boolean(e.me.can_fast_release && fast && n > 0 && n <= fastLimit && proof);
  const others = keyholders.filter((k) => k.id !== me?.id).map((k) => first(k.name));
  const hint =
    fast && e.me.can_fast_release && n <= fastLimit
      ? n > 0 && proof
        ? `Up to ${formatNaira(fastLimit)} with proof, so it goes now`
        : `Up to ${formatNaira(fastLimit)} goes now with proof. Over that, ${need} of ${keyholders.length} must agree`
      : fast && n > fastLimit
        ? `Over ${formatNaira(fastLimit)}, so ${need} of ${keyholders.length} keyholders must agree`
        : fast?.next_at && iHoldAKey
          ? `Fast release opens again on ${new Date(fast.next_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, so ${need} of ${keyholders.length} keyholders must agree`
          : `${need} of ${keyholders.length} keyholders must agree`;
  const payTo = direct ? payee?.account_name ?? null : 'Your Main wallet';

  const send = () => {
    setError(null);
    if (!(n > 0)) return setError('Enter how much is needed.');
    if (n > parseFloat(e.balance)) return setError(`The fund holds ${formatNaira(e.balance)}.`);
    if (direct && !payee) return setError("Add the hospital or clinic's account.");
    setPinOpen(true);
  };

  const submit = (pin: string) => {
    setPinError(null);
    release.mutate(
      {
        amount,
        pin,
        note: note.trim() || undefined,
        proof,
        payee: direct && bank && payee ? { bank_code: bank.bank_code, bank_name: payee.bank_name || bank.bank_name, account_number: account, account_name: payee.account_name } : undefined,
      },
      {
        onSuccess: (d) => {
          notifySuccess();
          setPinOpen(false);
          setDone(d.request);
        },
        onError: (err) => setPinError(err.message),
      },
    );
  };

  // SND-10 "Waiting for Emeka", or released at once.
  if (done) {
    const released = done.status === 'released';
    const to = done.payee?.account_name ?? 'your Main wallet';
    // "Waiting for Emeka", "Emeka or Ada", "Emeka and Ada", "2 of Emeka, Ada, Obi".
    const left = Math.max(1, (done.required_approvals ?? need) - (done.approvals ?? 0));
    const and = (sep: string) => (others.length > 1 ? `${others.slice(0, -1).join(', ')} ${sep} ${others[others.length - 1]}` : others[0] ?? 'the keyholders');
    const waitingOn = left >= others.length ? and('and') : left === 1 ? and('or') : `${left} of ${others.join(', ')}`;
    return (
      <PtStepScreen footer={<PtButton title="Done" onPress={() => navigation.goBack()} />}>
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: released ? pt.brandSoft : '#FDEBC8', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={released ? 'check' : 'clock'} size={28} color={released ? pt.brand : '#8F5400'} />
          </View>
          <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">
            {released ? `${formatNaira(done.amount)} released` : done.status === 'rejected' ? 'Not paid' : `Waiting for ${waitingOn}`}
          </PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
            {released
              ? `Sent to ${to}. The other keyholders can see the proof and check it.`
              : done.status === 'rejected'
                ? done.review_note ?? 'The release could not be paid.'
                : `We've asked them to agree to ${formatNaira(done.amount)} to ${to}. The money stays in ${wallet.name} until ${need} of ${keyholders.length} say yes.`}
          </PtText>
        </View>
        {released ? null : (
          <PtPanel>
            <PtReviewRow label="You sent the request" value={clock(done.created_at ?? new Date(), true) ?? ''} sub={`${done.approvals ?? 0} of ${done.required_approvals ?? need} said yes`} />
            <PtReviewRow label="The keyholders answer" value="Notified on Patriai" sub={e.rules.request_expiry_hours ? `Expires in ${e.rules.request_expiry_hours} hours` : null} />
            <PtReviewRow label="Then" value={`Money goes to ${to}`} last />
          </PtPanel>
        )}
      </PtStepScreen>
    );
  }

  return (
    <PtPageScreen
      title="Release money"
      subtitle={wallet.name}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={goesNow ? 'Release now' : 'Send for release'} loading={release.isPending} onPress={send} />}
    >
      <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" hint={hint} />
      <PtField label="What happened?" value={note} onChangeText={setNote} placeholder="Papa admitted at Mercy Hospital" maxLength={500} />
      <PtPanel>
        <PtReviewRow
          label="Pay to"
          value={payTo ?? "Add the hospital's account"}
          sub={direct ? (payee ? `Verified account · ${bank?.bank_name ?? payee.bank_name}` : 'This fund pays bills directly') : 'Paid to you, then you pay the bill'}
          onEdit={direct ? () => setPayOpen(true) : undefined}
        />
        <PtReviewRow
          label="Proof"
          value={proof ? proof.fileName ?? 'Photo added' : 'None yet'}
          sub={proof ? 'Uploaded just now' : "A photo of the bill or doctor's note"}
          onEdit={async () => {
            const f = await pickFile('library');
            if (f) setProof(f);
          }}
          last
        />
      </PtPanel>
      <PtPanel>
        {listed.map((k, i) => (
          <PersonRow
            key={k.id}
            initials={initials(k.name)}
            name={k.id === me?.id ? `${first(k.name)} (you)` : first(k.name)}
            sub={k.id === me?.id ? 'Your yes counts once you send' : 'Gets a push alert'}
            tone={k.id === me?.id ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
            chip={k.id === me?.id ? { label: 'Yes', tone: 'success', icon: 'check' } : null}
            last={i === listed.length - 1}
          />
        ))}
      </PtPanel>
      {!iHoldAKey ? <PtNote tone="info">{`You're not a keyholder, so ${need} of ${keyholders.length} of them must agree.`}</PtNote> : null}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}

      <PtSheet
        visible={payOpen && !bankOpen}
        title="Pay to"
        subtitle="The hospital or clinic's bank account"
        onClose={() => setPayOpen(false)}
        footer={<PtButton title="Use this account" disabled={!payee} onPress={() => setPayOpen(false)} />}
      >
        <PtField label="Bank" value={bank?.bank_name ?? ''} placeholder="Choose the bank" onPressBox={() => setBankOpen(true)} editable={false} />
        <PtField label="Account number" value={account} onChangeText={(t) => setAccount(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="0123456789" maxLength={10} error={payeeError} />
        {verify.isPending ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Checking the account…</Text>
        ) : payee ? (
          <PtNote tone="success">{payee.account_name}</PtNote>
        ) : null}
      </PtSheet>
      <BankPicker
        visible={bankOpen}
        selectedCode={bank?.bank_code}
        onSelect={(b) => {
          setBank(b);
          setBankOpen(false);
        }}
        onClose={() => setBankOpen(false)}
      />
      <PinSheet
        visible={pinOpen}
        title={goesNow ? 'Release now' : 'Send for release'}
        subtitle="Enter your PIN"
        amount={formatMoney(amount || '0')}
        recipient={payTo ? `To ${payTo}` : undefined}
        loading={release.isPending}
        error={pinError}
        onSubmit={submit}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
