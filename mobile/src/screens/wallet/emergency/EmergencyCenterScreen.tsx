import React, { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollView } from '../../../components/KeyboardAwareScrollView';
import { Screen } from '../../../components/Screen';
import { Header } from '../../../components/Header';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { ErrorText } from '../../../components/ErrorText';
import { LoadError } from '../../../components/LoadError';
import { PinSheet } from '../../../components/PinSheet';
import { PersonAvatar } from '../../../components/PersonPicker';
import { ACCESS_TYPE_LABEL } from '../../../components/RecipientSheet';
import { colors, outline } from '../../../theme';
import { useEmergency, useEmergencyActions } from '../../../api/hooks';
import { dayLabel, formatMoney, groupAmountInput, sanitizeAmountInput, timeLabel } from '../../../lib/format';
import { notifySuccess, selection } from '../../../lib/haptics';
import { purposeLabel } from '../../../lib/walletGuides';
import { beneficiaryRank } from '../../../lib/emergencyRules';
import type { EmergencyDocumentType, EmergencyRequest, EmergencyUnlockVia } from '../../../api/types';
import type { RootScreenProps } from '../../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const VIA_LABEL: Record<EmergencyUnlockVia, string> = {
  manual: 'the owner\'s custom PIN',
  dual_approval: 'dual approval',
  document: 'a verified document',
  high_balance: 'the high-balance override',
  national_crisis: 'a national-crisis override',
};

const DOC_LABEL: Record<EmergencyDocumentType, string> = {
  death_certificate: 'Death Certificate',
  legal_notice: 'Legal Notice',
};

const STATUS_STYLE: Record<EmergencyRequest['status'], { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-lav', text: 'text-navy' },
  approved: { label: 'Approved', bg: 'bg-success-soft', text: 'text-brand' },
  rejected: { label: 'Declined', bg: 'bg-danger-soft', text: 'text-danger' },
  cancelled: { label: 'Cancelled', bg: 'bg-lav-faint', text: 'text-muted' },
  expired: { label: 'Expired', bg: 'bg-lav-faint', text: 'text-muted' },
  released: { label: 'Released', bg: 'bg-success-soft', text: 'text-brand' },
  flagged: { label: 'Flagged', bg: 'bg-danger-soft', text: 'text-danger' },
};

type PinMode = 'unlock' | 'override' | 'withdraw' | 'fast' | null;

/** Title for a request card. */
function requestTitle(r: EmergencyRequest): string {
  if (r.method === 'fast_release') return `Fast release${r.amount ? ` · ${formatMoney(r.amount)}` : ''}`;
  if (r.method === 'document' && r.document_type && r.document_type !== 'proof') return DOC_LABEL[r.document_type];
  return 'Release request';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-7">
      <Text className="text-sm font-extrabold text-ink">{title}</Text>
      <View className="mt-3" style={{ gap: 10 }}>
        {children}
      </View>
    </View>
  );
}

function RuleRow({ icon, on, title, detail }: { icon: IconName; on: boolean; title: string; detail?: string | null }) {
  return (
    <View className="flex-row items-start">
      <Ionicons name={on ? icon : 'remove-circle-outline'} size={18} color={on ? colors.brand : colors.faded} style={{ marginRight: 10, marginTop: 1 }} />
      <View className="flex-1">
        <Text className={`text-[14px] font-semibold ${on ? 'text-ink' : 'text-faded'}`}>{title}</Text>
        {on && detail ? <Text className="text-[12px] text-muted">{detail}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Emergency access for one wallet: the lock state, every unlock path the
 * viewer may use (owner PIN, override, dual-approval request/approval, document
 * submission), recipients' payouts, and the rules the owner set up.
 */
export function EmergencyCenterScreen({ navigation, route }: RootScreenProps<'EmergencyCenter'>) {
  const { walletId } = route.params;
  const detail = useEmergency(walletId);
  const actions = useEmergencyActions(walletId);
  const e = detail.data;

  const [pinMode, setPinMode] = useState<PinMode>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState('');
  // Manual unlock needs a reason (prefilled from setup) as well as the custom PIN.
  const [unlockReason, setUnlockReason] = useState<string | null>(null);
  const [docType, setDocType] = useState<EmergencyDocumentType>('death_certificate');
  const [docNote, setDocNote] = useState('');
  const [amount, setAmount] = useState('');
  // EMG-04 Release now: amount, what happened, and a photo of the bill.
  const [fastAmount, setFastAmount] = useState('');
  const [fastNote, setFastNote] = useState('');
  const [proof, setProof] = useState<{ uri: string; fileName?: string | null; mimeType?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = e?.me;
  const reasonForUnlock = (unlockReason ?? e?.rules.unlock_reason ?? '').trim();
  const mine = me?.beneficiary;
  const pinBusy = actions.unlock.isPending || actions.override.isPending || actions.withdraw.isPending || actions.fastRelease.isPending;
  const fast = e?.rules.fast_release ?? null;
  const keyholders = e ? [...(e.rules.keyholders ?? [])] : [];

  const submitPin = (pin: string) => {
    setPinError(null);
    const done = {
      onSuccess: () => {
        notifySuccess();
        setPinMode(null);
        if (pinMode === 'withdraw') setAmount('');
        if (pinMode === 'fast') {
          setFastAmount('');
          setFastNote('');
          setProof(null);
        }
      },
      onError: (err: Error) => setPinError(err.message),
    };
    if (pinMode === 'unlock') actions.unlock.mutate({ pin, reason: reasonForUnlock || undefined }, done);
    else if (pinMode === 'override') actions.override.mutate(pin, done);
    else if (pinMode === 'withdraw') actions.withdraw.mutate({ amount, pin }, done);
    else if (pinMode === 'fast' && proof) actions.fastRelease.mutate({ amount: fastAmount, pin, note: fastNote.trim() || undefined, asset: proof }, done);
  };

  const pickProof = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach the bill.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setProof({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
  };

  const releaseNow = () => {
    setError(null);
    if (!(Number(fastAmount) > 0)) {
      setError('Enter how much to release.');
      return;
    }
    if (fast && Number(fastAmount) > parseFloat(fast.limit)) {
      setError(`Fast release is up to ${formatMoney(fast.limit)}.`);
      return;
    }
    if (!proof) {
      setError('Add a photo of the bill or doctor’s note.');
      return;
    }
    setPinMode('fast');
  };

  const confirmLock = () => {
    Alert.alert('Lock this wallet again?', 'Money will only leave once one of your access rules is met again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lock',
        onPress: () => actions.lock.mutate(undefined, { onError: (err) => setError(err.message) }),
      },
    ]);
  };

  const requestUnlock = () => {
    setError(null);
    actions.requestDual.mutate(requestNote.trim() || undefined, {
      onSuccess: () => {
        notifySuccess();
        setRequestNote('');
      },
      onError: (err) => setError(err.message),
    });
  };

  const submitDocument = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach the document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    actions.submitDocument.mutate(
      { documentType: docType, note: docNote.trim() || undefined, asset: { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType } },
      {
        onSuccess: () => {
          notifySuccess();
          setDocNote('');
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  const decide = (r: EmergencyRequest, action: 'approve' | 'reject' | 'cancel') => {
    const titles = {
      approve: ['Say yes to this release?', 'Once enough keyholders agree, the fund opens and beneficiaries can start withdrawing.'],
      reject: r.method === 'fast_release' ? ['Flag this release?', 'The owner and the person who released it are told.'] : ['Decline this release?', 'The fund stays locked.'],
      cancel: ['Cancel your request?', 'You can ask again later.'],
    } as const;
    Alert.alert(titles[action][0], titles[action][1], [
      { text: 'Back', style: 'cancel' },
      {
        text: action === 'approve' ? 'Yes, release' : action === 'reject' ? (r.method === 'fast_release' ? 'Flag' : 'Decline') : 'Cancel Request',
        style: action === 'approve' ? 'default' : 'destructive',
        onPress: () =>
          actions.decide.mutate(
            { requestId: r.id, action },
            { onSuccess: () => notifySuccess(), onError: (err) => setError(err.message) },
          ),
      },
    ]);
  };

  const accessDate = mine?.access_available_at ? new Date(mine.access_available_at) : null;

  return (
    <Screen withBottomInset>
      <Header title="Emergency Access" />
      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : detail.isError || !e || !me ? (
        <LoadError message={(detail.error as Error | null)?.message} onRetry={() => void detail.refetch()} />
      ) : (
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Lock state */}
          <View className={`rounded p-5 ${e.locked ? 'bg-navy' : 'bg-success-soft'}`}>
            <View className="flex-row items-center">
              <View className={`mr-3 h-11 w-11 items-center justify-center rounded ${e.locked ? 'bg-white/15' : 'bg-white'}`}>
                <Ionicons name={e.locked ? 'lock-closed' : 'lock-open'} size={22} color={e.locked ? colors.brandMint : colors.brand} />
              </View>
              <View className="flex-1">
                <Text className={`text-[20px] font-extrabold ${e.locked ? 'text-white' : 'text-brand-deep'}`}>
                  {e.locked ? 'Locked' : 'Unlocked'}
                </Text>
                <Text className={`text-[13px] ${e.locked ? 'text-white/70' : 'text-brand-deep'}`}>
                  {purposeLabel('emergency', e.purpose)} emergency · {formatMoney(e.balance)}
                </Text>
              </View>
            </View>
            <Text className={`mt-3 text-[13px] leading-5 ${e.locked ? 'text-white/70' : 'text-brand-deep'}`}>
              {e.locked
                ? 'Anyone can add money. Money only leaves once one of the access rules below is met.'
                : `Unlocked ${dayLabel(e.unlocked_at)} via ${e.unlocked_via ? VIA_LABEL[e.unlocked_via] : 'an access rule'}.`}
            </Text>
          </View>

          <ErrorText message={error} className="mt-4" />

          {/* Owner actions */}
          {me.can_manual_unlock || me.can_override || me.can_lock || me.can_edit_rules ? (
            <Section title="Your Controls">
              {me.can_manual_unlock ? (
                <View className="rounded bg-white p-4" style={outline.card}>
                  <Input
                    label="Reason for Unlocking"
                    value={unlockReason ?? e.rules.unlock_reason ?? ''}
                    onChangeText={setUnlockReason}
                    placeholder="e.g., Medical Emergency"
                    maxLength={150}
                  />
                  <Text className="ml-1 mt-1.5 text-[12px] text-muted">Your beneficiaries will see this reason.</Text>
                  <Button
                    title="Unlock with Custom PIN"
                    icon="key"
                    iconPosition="left"
                    onPress={() => {
                      if (!reasonForUnlock) {
                        setError('Say why you are unlocking this wallet.');
                        return;
                      }
                      setError(null);
                      setPinMode('unlock');
                    }}
                    className="mt-4"
                  />
                </View>
              ) : null}
              {me.can_override ? (
                <Button
                  title={`Override: Balance Above ${formatMoney(e.rules.override_balance_threshold)}`}
                  icon="flash"
                  iconPosition="left"
                  variant="secondary"
                  onPress={() => setPinMode('override')}
                />
              ) : null}
              {me.can_lock ? (
                <Button title="Lock Wallet Again" icon="lock-closed" iconPosition="left" variant="secondary" loading={actions.lock.isPending} onPress={confirmLock} />
              ) : null}
              {me.can_edit_rules ? (
                <Button
                  title="Edit Rules & Beneficiaries"
                  icon="create"
                  iconPosition="left"
                  variant="secondary"
                  onPress={() => navigation.navigate('EditEmergencyRules', { walletId })}
                />
              ) : null}
            </Section>
          ) : null}

          {/* The approver can act for the owner once the wallet is unlocked. */}
          {me.role === 'approver' && me.can_spend ? (
            <Section title="Act for the Owner">
              <Text className="text-[13px] leading-5 text-muted">
                As a keyholder you can withdraw or transfer from this fund while it's released.
              </Text>
              <View className="flex-row" style={{ gap: 10 }}>
                <View className="flex-1">
                  <Button title="Withdraw" icon="cash" iconPosition="left" onPress={() => navigation.navigate('Withdraw', { walletId })} />
                </View>
                <View className="flex-1">
                  <Button title="Transfer" icon="swap-horizontal" iconPosition="left" variant="secondary" onPress={() => navigation.navigate('Transfer', { walletId })} />
                </View>
              </View>
            </Section>
          ) : null}

          {/* Beneficiary allowance */}
          {mine ? (
            <Section title="Your Share">
              <View className="rounded bg-white p-4" style={outline.card}>
                <View className="flex-row">
                  <View className="flex-1">
                    <Text className="text-[11px] text-muted">Limit</Text>
                    <Text className="text-[15px] font-bold text-ink">{mine.withdrawal_limit ? formatMoney(mine.withdrawal_limit) : 'No limit'}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] text-muted">Received</Text>
                    <Text className="text-[15px] font-bold text-ink">{formatMoney(mine.withdrawn)}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] text-muted">Access</Text>
                    <Text className="text-[15px] font-bold text-ink">{ACCESS_TYPE_LABEL[mine.access_type]}</Text>
                  </View>
                </View>
                <Text className="mt-3 text-[13px] leading-5 text-muted">
                  {e.locked
                    ? 'You can withdraw once the wallet is unlocked.'
                    : mine.can_withdraw_now
                      ? 'Money goes straight to your Patriai main wallet.'
                      : accessDate && accessDate.getTime() > Date.now()
                        ? `Your access opens on ${timeLabel(mine.access_available_at)}.`
                        : 'You have received your full allowance.'}
                </Text>
              </View>
              {mine.can_withdraw_now ? (
                <>
                  <Input
                    label={mine.remaining ? `Amount (up to ${formatMoney(mine.remaining)})` : 'Amount'}
                    prefix="₦"
                    value={groupAmountInput(amount)}
                    onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                  <Button
                    title="Withdraw to My Main Wallet"
                    icon="arrow-down-circle"
                    iconPosition="left"
                    onPress={() => {
                      setError(null);
                      if (!(Number(amount) > 0)) {
                        setError('Enter the amount to withdraw.');
                        return;
                      }
                      setPinMode('withdraw');
                    }}
                  />
                </>
              ) : null}
            </Section>
          ) : null}

          {/* EMG-04: a keyholder releases a small amount at once, with proof */}
          {me.can_fast_release && fast ? (
            <Section title="Release Now">
              <Text className="text-[13px] leading-5 text-muted">
                Up to {formatMoney(fast.limit)} straight to your Main wallet, once every {fast.every_days} days. The other keyholders check it within 48 hours.
              </Text>
              <Input
                label="Amount"
                prefix="₦"
                value={groupAmountInput(fastAmount)}
                onChangeText={(t) => setFastAmount(sanitizeAmountInput(t))}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              <Input value={fastNote} onChangeText={setFastNote} placeholder="What happened? (optional)" maxLength={500} />
              <Button
                title={proof ? 'Photo of the bill added' : 'Add a Photo of the Bill'}
                icon={proof ? 'checkmark-circle' : 'camera'}
                iconPosition="left"
                variant="secondary"
                onPress={() => void pickProof()}
              />
              <Button title="Release Now" icon="flash" iconPosition="left" loading={actions.fastRelease.isPending} onPress={releaseNow} />
            </Section>
          ) : e.locked && fast && me.is_keyholder && fast.next_at ? (
            <Section title="Release Now">
              <Text className="text-[13px] leading-5 text-muted">Fast release was used recently. The next one opens {dayLabel(fast.next_at)}.</Text>
            </Section>
          ) : null}

          {/* Unlock requests */}
          {me.can_request_dual ? (
            <Section title="Ask the Keyholders">
              <Text className="text-[13px] leading-5 text-muted">
                The fund opens once {e.rules.required_keyholders ?? 2} of {(keyholders.length || 1) + 1} keyholders say yes
                {e.rules.request_expiry_hours ? `. Requests expire after ${e.rules.request_expiry_hours} hours` : ''}.
              </Text>
              <Input value={requestNote} onChangeText={setRequestNote} placeholder="What's the emergency? (optional)" maxLength={500} />
              <Button title="Ask for a Release" icon="people" iconPosition="left" loading={actions.requestDual.isPending} onPress={requestUnlock} />
            </Section>
          ) : null}

          {me.can_submit_document ? (
            <Section title="Submit a Document">
              <Text className="text-[13px] leading-5 text-muted">
                Upload a clear photo of the official document. Patriai verifies it before the wallet unlocks, and the
                owner is notified.
              </Text>
              <View className="flex-row rounded bg-page-top p-1" style={{ gap: 4 }}>
                {(Object.keys(DOC_LABEL) as EmergencyDocumentType[]).map((t) => {
                  const active = docType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        selection();
                        setDocType(t);
                      }}
                      className="flex-1 items-center rounded py-2.5"
                      style={active ? { backgroundColor: colors.white } : undefined}
                    >
                      <Text className={`text-[13px] ${active ? 'font-bold text-navy' : 'font-medium text-muted'}`}>{DOC_LABEL[t]}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Input value={docNote} onChangeText={setDocNote} placeholder="Note for the reviewer (optional)" maxLength={500} />
              <Button
                title="Choose Photo & Submit"
                icon="cloud-upload"
                iconPosition="left"
                loading={actions.submitDocument.isPending}
                onPress={() => void submitDocument()}
              />
            </Section>
          ) : null}

          {e.requests.length > 0 ? (
            <Section title="Requests and Releases">
              {e.requests.map((r) => {
                const st = STATUS_STYLE[r.status];
                return (
                  <View key={r.id} className="rounded bg-white p-4" style={outline.card}>
                    <View className="flex-row items-start">
                      <View className="flex-1 pr-2">
                        <Text className="text-[15px] font-bold text-ink">{requestTitle(r)}</Text>
                        <Text className="text-[12px] text-muted">
                          {r.requested_by?.name ?? 'Someone'} · {dayLabel(r.created_at)}
                        </Text>
                      </View>
                      <View className={`rounded px-2.5 py-1 ${st.bg}`}>
                        <Text className={`text-[11px] font-bold ${st.text}`}>{st.label}</Text>
                      </View>
                    </View>
                    {r.note ? <Text className="mt-2 text-[13px] leading-5 text-ink">“{r.note}”</Text> : null}
                    {r.method === 'document' && r.status === 'pending' ? (
                      <Text className="mt-2 text-[12px] text-muted">Patriai is verifying this document.</Text>
                    ) : null}
                    {r.method === 'dual_approval' && r.status === 'pending' && r.required_approvals ? (
                      <Text className="mt-2 text-[12px] text-muted">
                        {r.approvals ?? 0} of {r.required_approvals} keyholders said yes
                        {r.expires_at ? ` · expires ${timeLabel(r.expires_at)}` : ''}
                      </Text>
                    ) : null}
                    {r.method === 'fast_release' && r.status === 'released' && r.expires_at ? (
                      <Text className="mt-2 text-[12px] text-muted">Proof attached · keyholders can check it until {timeLabel(r.expires_at)}</Text>
                    ) : null}
                    {r.review_note ? <Text className="mt-2 text-[12px] text-muted">Note: {r.review_note}</Text> : null}
                    {r.can_approve || r.can_reject || r.can_cancel ? (
                      <View className="mt-3 flex-row" style={{ gap: 8 }}>
                        {r.can_approve ? (
                          <View className="flex-1">
                            <Button title="Approve" icon="checkmark" onPress={() => decide(r, 'approve')} loading={actions.decide.isPending} />
                          </View>
                        ) : null}
                        {r.can_reject ? (
                          <View className="flex-1">
                            <Button title={r.can_flag ? 'Flag' : 'Decline'} variant="danger" onPress={() => decide(r, 'reject')} />
                          </View>
                        ) : null}
                        {r.can_cancel ? (
                          <View className="flex-1">
                            <Button title="Cancel Request" variant="secondary" onPress={() => decide(r, 'cancel')} />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </Section>
          ) : null}

          {/* The rules */}
          <Section title="Access Rules">
            <View className="rounded bg-white p-4" style={[outline.card, { gap: 12 }]}>
              <RuleRow
                icon="people"
                on={e.rules.dual_approval}
                title={`Keyholders · ${e.rules.required_keyholders ?? 2} of ${keyholders.length + 1} to release`}
                detail={keyholders.length ? `You and ${keyholders.map((k) => k.name).join(', ')}` : null}
              />
              <RuleRow
                icon="flash"
                on={Boolean(fast)}
                title="Fast Release with Proof"
                detail={fast ? `Up to ${formatMoney(fast.limit)}, once every ${fast.every_days} days` : null}
              />
              <RuleRow
                icon="document-text"
                on={e.rules.unlock_on_document}
                title="Death Emergency Unlock"
                detail="Unlocks once Patriai verifies a death certificate or legal notice"
              />
              <RuleRow
                icon="key"
                on={e.rules.manual_unlock}
                title="Manual Unlock with Custom PIN"
                detail={e.rules.unlock_reason ? `Reason: ${e.rules.unlock_reason}` : null}
              />
              <RuleRow icon="globe" on={e.rules.override_national_crisis} title="Override in National Crises" />
              <RuleRow
                icon="flash"
                on={e.rules.override_high_balance}
                title={`Override if Balance > ${formatMoney(e.rules.override_balance_threshold)}`}
              />
            </View>
          </Section>

          <Section title="Unlock Beneficiaries">
            {e.beneficiaries.length === 0 ? (
              <Text className="text-[13px] text-muted">No beneficiaries were added.</Text>
            ) : (
              e.beneficiaries.map((b, i) => (
                <View key={b.id} className="rounded bg-white p-4" style={outline.card}>
                  <View className={`mb-3 self-start rounded px-2 py-0.5 ${i === 0 ? 'bg-success-soft' : 'bg-lav'}`}>
                    <Text className={`text-[11px] font-bold ${i === 0 ? 'text-brand' : 'text-navy'}`}>
                      {beneficiaryRank(i).title} · {beneficiaryRank(i).role}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <PersonAvatar name={b.user?.name ?? '?'} avatarUrl={b.user?.avatar_url} />
                    <View className="ml-3 flex-1">
                      <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                        {b.user?.name ?? 'Former user'}
                      </Text>
                      {b.relationship ? <Text className="text-[12px] text-muted">{b.relationship}</Text> : null}
                    </View>
                  </View>
                  <View className="mt-3 flex-row border-t border-border pt-3">
                    <View className="flex-1">
                      <Text className="text-[11px] text-muted">Withdrawal Limit</Text>
                      <Text className="text-[14px] font-bold text-ink">{b.withdrawal_limit ? formatMoney(b.withdrawal_limit) : 'No limit'}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[11px] text-muted">Access Type</Text>
                      <Text className="text-[14px] font-bold text-ink">{ACCESS_TYPE_LABEL[b.access_type]}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
            {e.beneficiary_note ? (
              <View className="rounded bg-page-top p-4">
                <Text className="text-[12px] font-semibold text-muted">Message for Beneficiaries</Text>
                <Text className="mt-1 text-[14px] leading-5 text-ink">{e.beneficiary_note}</Text>
              </View>
            ) : null}
          </Section>
        </KeyboardAwareScrollView>
      )}

      <PinSheet
        visible={pinMode !== null}
        title={pinMode === 'unlock' ? 'Custom PIN' : pinMode === 'override' ? 'Confirm override' : pinMode === 'fast' ? 'Release now' : 'Authorize withdrawal'}
        subtitle={
          pinMode === 'unlock'
            ? 'Enter the custom PIN you created for this wallet.'
            : pinMode === 'override'
              ? 'Enter your transaction PIN to unlock this wallet.'
              : 'Enter your transaction PIN.'
        }
        amount={pinMode === 'withdraw' && amount ? formatMoney(amount) : pinMode === 'fast' && fastAmount ? formatMoney(fastAmount) : undefined}
        recipient={pinMode === 'withdraw' || pinMode === 'fast' ? 'To your main wallet' : undefined}
        allowBiometric={pinMode !== 'unlock'}
        // The emergency wallet's custom PIN is its own 4-digit secret.
        length={pinMode === 'unlock' ? 4 : undefined}
        loading={pinBusy}
        error={pinError}
        onSubmit={submitPin}
        onClose={() => {
          setPinMode(null);
          setPinError(null);
        }}
      />
    </Screen>
  );
}
