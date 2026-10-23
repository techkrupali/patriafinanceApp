import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './Input';
import { CheckOption } from './CheckOption';
import { PersonAvatar, PersonPicker } from './PersonPicker';
import { ACCESS_TYPE_LABEL, RecipientSheet, type RecipientDraft } from './RecipientSheet';
import { colors, outline } from '../theme';
import { formatMoney } from '../lib/format';
import { selection } from '../lib/haptics';
import { MAX_BENEFICIARIES, beneficiaryRank, rankBeneficiaries, type EmergencyRulesValue } from '../lib/emergency';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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

function IconButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      className="h-8 w-8 items-center justify-center rounded bg-lav-faint"
      style={disabled ? { opacity: 0.35 } : undefined}
    >
      <Ionicons name={icon} size={16} color={colors.navy} />
    </Pressable>
  );
}

interface EmergencyRulesFormProps {
  value: EmergencyRulesValue;
  onChange: (patch: Partial<EmergencyRulesValue>) => void;
  /** Editing with a custom PIN already set: a blank PIN keeps it. */
  hasCustomPin?: boolean;
}

/**
 * The emergency wallet's rules (client sheet + video 2026-10-17): Dual Approval,
 * Death Emergency Unlock, Manual Unlock with Custom PIN, the override rules and up
 * to three Unlock Beneficiaries in order (1st, then fallbacks). Shared by setup
 * Step 2 and "Edit Rules & Beneficiaries".
 */
export function EmergencyRulesForm({ value: v, onChange, hasCustomPin = false }: EmergencyRulesFormProps) {
  const [sheet, setSheet] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [noteOpen, setNoteOpen] = useState(Boolean(v.note));
  const editing = sheet.index < v.recipients.length ? v.recipients[sheet.index] : null;

  const setRecipients = (list: RecipientDraft[]) => onChange({ recipients: rankBeneficiaries(list) });
  const move = (from: number, to: number) => {
    const list = [...v.recipients];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    setRecipients(list);
  };

  return (
    <>
      <SectionCard icon="shield" title="Access Configuration">
        <CheckOption
          title="Dual Approval"
          description="Add a second person, like your spouse, who can unlock this wallet with you — and withdraw from it once it's unlocked — if you can't. An unlock needs two people to agree."
          checked={v.dual}
          onToggle={() => onChange({ dual: !v.dual })}
        >
          <PersonPicker label="Additional Approver" value={v.approver} onChange={(u) => onChange({ approver: u })} />
        </CheckOption>

        <CheckOption
          title="Death Emergency Unlock"
          description="If you pass away (or a legal notice is issued), a beneficiary uploads the death certificate or legal notice. Patriai verifies it, then the wallet unlocks for your beneficiaries."
          checked={v.docUnlock}
          onToggle={() => onChange({ docUnlock: !v.docUnlock })}
        />

        <CheckOption
          title="Manual Unlock with Custom PIN"
          description="Unlock it yourself straight away with a reason and a custom PIN you create."
          checked={v.manual}
          onToggle={() => onChange({ manual: !v.manual })}
        >
          <Input
            label="Reason for Unlock"
            value={v.reason}
            onChangeText={(t) => onChange({ reason: t })}
            placeholder="e.g., Medical Emergency"
            maxLength={150}
          />
          <Input
            label={hasCustomPin ? 'New Custom PIN (Optional)' : 'Custom PIN'}
            value={v.pin}
            onChangeText={(t) => onChange({ pin: t.replace(/\D/g, '').slice(0, 4) })}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            containerClassName="mt-4"
          />
          <Input
            label={hasCustomPin ? 'Confirm New Custom PIN' : 'Confirm Custom PIN'}
            value={v.pinConfirm}
            onChangeText={(t) => onChange({ pinConfirm: t.replace(/\D/g, '').slice(0, 4) })}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            containerClassName="mt-4"
          />
          <Text className="ml-1 mt-1.5 text-[12px] text-muted">
            {hasCustomPin
              ? 'Leave empty to keep your current custom PIN.'
              : "4 digits, different from your transaction PIN. You'll need it to unlock this wallet."}
          </Text>
        </CheckOption>
      </SectionCard>

      <SectionCard icon="flash" title="Override Rules">
        <CheckOption
          title="Allow Override in National Crises"
          description="Patriai may unlock this wallet during a declared national emergency."
          checked={v.crisis}
          onToggle={() => onChange({ crisis: !v.crisis })}
        />
        <CheckOption
          title="Allow Override if Balance > ₦1M"
          description="While the balance is above ₦1,000,000 you can unlock it with your transaction PIN."
          checked={v.highBalance}
          onToggle={() => onChange({ highBalance: !v.highBalance })}
        />
      </SectionCard>

      <SectionCard
        icon="people"
        title="Unlock Beneficiaries"
        right={
          v.recipients.length < MAX_BENEFICIARIES ? (
            <Pressable
              onPress={() => {
                selection();
                setSheet({ open: true, index: v.recipients.length });
              }}
              hitSlop={6}
              className="flex-row items-center active:opacity-70"
            >
              <Ionicons name="add-circle" size={16} color={colors.brand} style={{ marginRight: 4 }} />
              <Text className="text-[13px] font-bold text-brand">Add Beneficiary</Text>
            </Pressable>
          ) : null
        }
      >
        <Text className="text-[13px] leading-5 text-muted">
          Who receives the money once this wallet unlocks, in order: your 1st beneficiary, then up to two fallbacks.
          Each must have a Patriai account.
        </Text>

        {v.recipients.map((r, i) => {
          const rank = beneficiaryRank(i);
          return (
            <Pressable
              key={r.user.id}
              onPress={() => {
                selection();
                setSheet({ open: true, index: i });
              }}
              className="rounded bg-white p-4 active:opacity-90"
              style={outline.card}
              accessibilityLabel={`${rank.title}: ${r.user.full_name}. Tap to edit.`}
            >
              <View className="mb-3 flex-row items-center">
                <View className={`rounded px-2 py-0.5 ${rank.isFallback ? 'bg-lav' : 'bg-success-soft'}`}>
                  <Text className={`text-[11px] font-bold ${rank.isFallback ? 'text-navy' : 'text-brand'}`}>
                    {rank.title} · {rank.role}
                  </Text>
                </View>
                <View className="flex-1" />
                <View className="flex-row" style={{ gap: 6 }}>
                  <IconButton icon="arrow-up" label="Move up" onPress={() => move(i, i - 1)} disabled={i === 0} />
                  <IconButton icon="arrow-down" label="Move down" onPress={() => move(i, i + 1)} disabled={i === v.recipients.length - 1} />
                  <IconButton
                    icon="trash"
                    label={`Remove ${r.user.full_name}`}
                    onPress={() => setRecipients(v.recipients.filter((x) => x.user.id !== r.user.id))}
                  />
                </View>
              </View>
              <View className="flex-row items-center">
                <PersonAvatar name={r.user.full_name} avatarUrl={r.user.avatar_url} />
                <View className="ml-3 flex-1 pr-2">
                  <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                    {r.user.full_name}
                  </Text>
                  <Text className="text-[12px] text-muted">{r.relationship || 'Tap to add relationship & limits'}</Text>
                </View>
              </View>
              <View className="mt-3 flex-row border-t border-border pt-3">
                <View className="flex-1">
                  <Text className="text-[11px] text-muted">Withdrawal Limit</Text>
                  <Text className="text-[14px] font-bold text-ink">{r.withdrawalLimit ? formatMoney(r.withdrawalLimit) : 'No limit'}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] text-muted">Access Type</Text>
                  <Text className="text-[14px] font-bold text-ink">{ACCESS_TYPE_LABEL[r.accessType]}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}

        {noteOpen ? (
          <Input
            label="Message for Your Beneficiaries"
            value={v.note}
            onChangeText={(t) => onChange({ note: t })}
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
              Add a personalized message or legal note for your beneficiaries upon unlock.
            </Text>
          </Pressable>
        )}
      </SectionCard>

      <RecipientSheet
        visible={sheet.open}
        position={sheet.index}
        initial={editing}
        excludeIds={v.recipients.filter((_, i) => i !== sheet.index).map((r) => r.user.id)}
        onSave={(r) => {
          const list = [...v.recipients];
          list[sheet.index] = r;
          setRecipients(list);
          setSheet({ open: false, index: 0 });
        }}
        onClose={() => setSheet({ open: false, index: 0 })}
      />
    </>
  );
}
