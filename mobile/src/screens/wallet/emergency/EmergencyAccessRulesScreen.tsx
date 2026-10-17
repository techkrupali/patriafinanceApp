import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../../components/KeyboardAwareScrollView';
import { Screen } from '../../../components/Screen';
import { Header } from '../../../components/Header';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { ErrorText } from '../../../components/ErrorText';
import { GuidedIntro } from '../../../components/GuidedIntro';
import { CheckOption } from '../../../components/CheckOption';
import { PersonAvatar, PersonPicker } from '../../../components/PersonPicker';
import {
  ACCESS_TYPE_LABEL,
  RECIPIENT_ROLE_LABEL,
  RecipientSheet,
  type RecipientDraft,
} from '../../../components/RecipientSheet';
import { colors, outline } from '../../../theme';
import { useCreateWallet } from '../../../api/hooks';
import { formatMoney } from '../../../lib/format';
import { notifySuccess, selection } from '../../../lib/haptics';
import type { UserSearchResult } from '../../../api/types';
import type { RootScreenProps } from '../../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Day money moves each month: today, capped at 28 so every month has it. */
const MONTHLY_DAY = Math.min(new Date().getDate(), 28);
const MAX_RECIPIENTS = 3;

function SectionCard({ icon, title, right, children }: { icon: IconName; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="mt-5 rounded bg-page-top p-4">
      <View className="mb-3 flex-row items-center">
        <Ionicons name={icon} size={18} color={colors.navy} style={{ marginRight: 8 }} />
        <Text className="flex-1 text-[16px] font-bold text-ink">{title}</Text>
        {right}
      </View>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

/**
 * Emergency wallet — Step 2 of 2 (client design "Set Emergency Access Rules" +
 * video 2026-10-17): when the wallet may be unlocked, override rules, and who
 * receives the money once it is. "AI Triggered" was dropped per the client.
 */
export function EmergencyAccessRulesScreen({ navigation, route }: RootScreenProps<'EmergencyAccessRules'>) {
  const { draft } = route.params;
  const create = useCreateWallet();

  const [dual, setDual] = useState(false);
  const [approver, setApprover] = useState<UserSearchResult | null>(null);
  const [docUnlock, setDocUnlock] = useState(false);
  const [manual, setManual] = useState(true);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [crisis, setCrisis] = useState(false);
  const [highBalance, setHighBalance] = useState(false);
  const [recipients, setRecipients] = useState<RecipientDraft[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recipientIds = recipients.map((r) => r.user.id);

  const save = () => {
    setError(null);
    if (!dual && !docUnlock && !manual) {
      setError('Choose at least one way this wallet can be unlocked.');
      return;
    }
    if (dual && !approver) {
      setError('Choose the additional approver for dual approval.');
      return;
    }
    if (manual) {
      if (!reason.trim()) {
        setError('Add the reason this wallet may be unlocked manually.');
        return;
      }
      if (!/^\d{4}$/.test(pin)) {
        setError('Create a 4-digit emergency PIN.');
        return;
      }
      if (pin !== pinConfirm) {
        setError('The emergency PINs don\'t match.');
        return;
      }
    }
    if (docUnlock && recipients.length === 0 && !(dual && approver)) {
      setError('Add a recipient or an approver who can submit the death certificate or legal notice.');
      return;
    }

    create.mutate(
      {
        type: 'emergency',
        name: draft.name,
        purpose: draft.purpose,
        initial_deposit: draft.initialDeposit || undefined,
        source_wallet_id: draft.sourceWalletId ?? undefined,
        monthly_amount: draft.monthlyAmount || undefined,
        monthly_day: draft.monthlyAmount ? MONTHLY_DAY : undefined,
        emergency: {
          purpose: draft.purpose,
          dual_approval: dual,
          approver_user_id: dual ? approver?.id : undefined,
          unlock_on_document: docUnlock,
          manual_unlock: manual,
          unlock_reason: manual ? reason.trim() : undefined,
          emergency_pin: manual ? pin : undefined,
          override_national_crisis: crisis,
          override_high_balance: highBalance,
          beneficiary_note: note.trim() || undefined,
          beneficiaries: recipients.map((r) => ({
            user_id: r.user.id,
            relationship: r.relationship || undefined,
            role: r.role,
            withdrawal_limit: r.withdrawalLimit || undefined,
            access_type: r.accessType,
          })),
        },
      },
      {
        onSuccess: (data) => {
          notifySuccess();
          navigation.popToTop();
          navigation.navigate('WalletDetail', { walletId: data.wallet.id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Emergency Wallet" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <GuidedIntro
          step="Step 2 of 2"
          icon="shield-checkmark"
          title="Set Emergency Access Rules"
          subtitle="Decide when this wallet can be unlocked and who receives the money. It stays locked until one of these rules is met."
        />

        <SectionCard icon="shield" title="Access Configuration">
          <CheckOption
            title="Dual Approval"
            description="Add a second person, like your spouse, who can help unlock this wallet if you can't. An unlock needs two people to agree."
            checked={dual}
            onToggle={() => setDual((v) => !v)}
          >
            <PersonPicker label="Additional Approver" value={approver} onChange={setApprover} />
          </CheckOption>

          <CheckOption
            title="Unlock on Death Certificate or Legal Notice"
            description="A recipient submits the official document. Patriai verifies it, then the wallet unlocks."
            checked={docUnlock}
            onToggle={() => setDocUnlock((v) => !v)}
          />

          <CheckOption
            title="Manual Unlock by Owner"
            description="Unlock immediately yourself with an emergency PIN."
            checked={manual}
            onToggle={() => setManual((v) => !v)}
          >
            <Input label="Reason for Unlock" value={reason} onChangeText={setReason} placeholder="e.g., Medical Emergency" maxLength={150} />
            <Input
              label="Emergency PIN"
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              containerClassName="mt-4"
            />
            <Input
              label="Confirm Emergency PIN"
              value={pinConfirm}
              onChangeText={(t) => setPinConfirm(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              containerClassName="mt-4"
            />
            <Text className="ml-1 mt-1.5 text-[12px] text-muted">
              Different from your transaction PIN. You'll need it to unlock this wallet, so keep it safe.
            </Text>
          </CheckOption>
        </SectionCard>

        <SectionCard icon="flash" title="Override Rules">
          <CheckOption
            title="Allow Override in National Crises"
            description="Patriai may unlock this wallet during a declared national emergency."
            checked={crisis}
            onToggle={() => setCrisis((v) => !v)}
          />
          <CheckOption
            title="Allow Override if Balance > ₦1M"
            description="While the balance is above ₦1,000,000 you can unlock it with your transaction PIN."
            checked={highBalance}
            onToggle={() => setHighBalance((v) => !v)}
          />
        </SectionCard>

        <SectionCard
          icon="people"
          title="Recipients Upon Unlock"
          right={
            recipients.length < MAX_RECIPIENTS ? (
              <Pressable
                onPress={() => {
                  selection();
                  setSheetOpen(true);
                }}
                hitSlop={6}
                className="flex-row items-center active:opacity-70"
              >
                <Ionicons name="add-circle" size={16} color={colors.brand} style={{ marginRight: 4 }} />
                <Text className="text-[13px] font-bold text-brand">Add New</Text>
              </Pressable>
            ) : null
          }
        >
          <Text className="text-[13px] leading-5 text-muted">
            Who receives the money once this wallet unlocks — up to {MAX_RECIPIENTS} people with Patriai accounts.
          </Text>

          {recipients.map((r) => (
            <View key={r.user.id} className="rounded bg-white p-4" style={outline.card}>
              <View className="flex-row items-center">
                <PersonAvatar name={r.user.full_name} avatarUrl={r.user.avatar_url} />
                <View className="ml-3 flex-1 pr-2">
                  <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                    {r.user.full_name}
                  </Text>
                  <Text className="text-[12px] text-muted">
                    {r.relationship ? `${r.relationship} • ` : ''}
                    {RECIPIENT_ROLE_LABEL[r.role]}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    selection();
                    setRecipients((list) => list.filter((x) => x.user.id !== r.user.id));
                  }}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${r.user.full_name}`}
                >
                  <Ionicons name="trash" size={18} color={colors.muted} />
                </Pressable>
              </View>
              <View className="mt-3 flex-row border-t border-border pt-3">
                <View className="flex-1">
                  <Text className="text-[11px] text-muted">Withdrawal Limit</Text>
                  <Text className="text-[14px] font-bold text-ink">
                    {r.withdrawalLimit ? formatMoney(r.withdrawalLimit) : 'No limit'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] text-muted">Access Type</Text>
                  <Text className="text-[14px] font-bold text-ink">{ACCESS_TYPE_LABEL[r.accessType]}</Text>
                </View>
              </View>
            </View>
          ))}

          {noteOpen ? (
            <Input
              label="Message for Your Recipients"
              value={note}
              onChangeText={setNote}
              placeholder="A personal message or legal note they'll see when the wallet unlocks"
              multiline
              maxLength={1000}
              style={{ minHeight: 96, textAlignVertical: 'top' }}
            />
          ) : (
            <Pressable
              onPress={() => {
                selection();
                setNoteOpen(true);
              }}
              className="items-center rounded border border-dashed border-faded px-4 py-5 active:opacity-80"
            >
              <Ionicons name="document-text" size={20} color={colors.muted} />
              <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
                Add a personalized message or legal note for your recipients upon unlock.
              </Text>
            </Pressable>
          )}
        </SectionCard>

        <View className="mt-5 flex-row items-start rounded bg-success-soft p-4">
          <Ionicons name="lock-closed" size={16} color={colors.brand} style={{ marginRight: 10, marginTop: 2 }} />
          <Text className="flex-1 text-[12px] leading-5 text-brand-deep">
            "{draft.name}" will be locked as soon as it's created. Anyone can add money to it, but money only leaves
            when one of your rules is met.
          </Text>
        </View>

        <ErrorText message={error} className="mt-4" />

        <Button
          title="Save & Activate Emergency Wallet"
          icon="checkmark-circle"
          iconPosition="left"
          onPress={save}
          loading={create.isPending}
          className="mt-6"
        />
        <Button
          title="Back to Step 1"
          icon="arrow-back"
          iconPosition="left"
          variant="secondary"
          onPress={() => navigation.goBack()}
          className="mt-3"
        />
      </KeyboardAwareScrollView>

      <RecipientSheet
        visible={sheetOpen}
        defaultRole={recipients.length === 0 ? 'beneficiary' : 'fallback'}
        excludeIds={recipientIds}
        onSave={(r) => {
          setRecipients((list) => [...list, r]);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}
