import React, { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';
import { PersonPicker } from './PersonPicker';
import { Input } from './Input';
import { Button } from './Button';
import { ErrorText } from './ErrorText';
import { colors } from '../theme';
import { groupAmountInput, sanitizeAmountInput } from '../lib/format';
import { selection } from '../lib/haptics';
import type { EmergencyAccessType, EmergencyRecipientRole, UserSearchResult } from '../api/types';

/** A recipient as edited in the Emergency Access Rules step (naira as typed). */
export interface RecipientDraft {
  user: UserSearchResult;
  relationship: string;
  role: EmergencyRecipientRole;
  /** Raw naira digits; '' = up to the full balance. */
  withdrawalLimit: string;
  accessType: EmergencyAccessType;
}

export const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Friend', 'Other'];

export const RECIPIENT_ROLE_LABEL: Record<EmergencyRecipientRole, string> = {
  beneficiary: 'Beneficiary',
  fallback: 'Fallback Contact',
};

export const ACCESS_TYPE_LABEL: Record<EmergencyAccessType, string> = {
  immediate: 'Immediate',
  delay_7d: '7-Day Delay',
};

interface RecipientSheetProps {
  visible: boolean;
  /** First recipient defaults to Beneficiary, later ones to Fallback Contact. */
  defaultRole: EmergencyRecipientRole;
  excludeIds: number[];
  onSave: (recipient: RecipientDraft) => void;
  onClose: () => void;
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View className="flex-row rounded bg-page-top p-1" style={{ gap: 4 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              selection();
              onChange(o.key);
            }}
            className="flex-1 items-center rounded py-2.5"
            style={active ? { backgroundColor: colors.white } : undefined}
          >
            <Text className={`text-[13px] ${active ? 'font-bold text-navy' : 'font-medium text-muted'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom sheet to add one "Recipient Upon Unlock" (design: Recipients Upon Unlock → Add New). */
export function RecipientSheet({ visible, defaultRole, excludeIds, onSave, onClose }: RecipientSheetProps) {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<UserSearchResult | null>(null);
  const [relationship, setRelationship] = useState('');
  const [role, setRole] = useState<EmergencyRecipientRole>(defaultRole);
  const [limit, setLimit] = useState('');
  const [accessType, setAccessType] = useState<EmergencyAccessType>('immediate');
  const [error, setError] = useState<string | null>(null);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setUser(null);
    setRelationship('');
    setRole(defaultRole);
    setLimit('');
    setAccessType(defaultRole === 'fallback' ? 'delay_7d' : 'immediate');
    setError(null);
  }, [visible, defaultRole]);

  const save = () => {
    if (!user) {
      setError('Choose the Patriai user who should receive this money.');
      return;
    }
    if (limit && !(Number(limit) > 0)) {
      setError('Enter a withdrawal limit greater than zero, or leave it empty.');
      return;
    }
    onSave({ user, relationship, role, withdrawalLimit: limit, accessType });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t bg-white" style={{ maxHeight: '92%', paddingBottom: insets.bottom + 12 }}>
            <View className="mt-3 mb-2 h-1.5 w-12 self-center rounded-full bg-lav" />
            <View className="flex-row items-center px-6 pb-2">
              <Text className="flex-1 text-lg font-extrabold text-ink">Add Recipient</Text>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-[13px] leading-5 text-muted">
                This person can receive money from the wallet once it unlocks. They need a Patriai account so the
                money reaches them instantly.
              </Text>

              <PersonPicker label="Who" value={user} onChange={setUser} excludeIds={excludeIds} className="mt-4" />

              <Text className="mb-2 mt-5 text-[13px] font-semibold text-muted">Relationship</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {RELATIONSHIPS.map((r) => {
                  const active = relationship === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => {
                        selection();
                        setRelationship(active ? '' : r);
                      }}
                      className={`rounded px-4 py-2 ${active ? 'bg-navy' : 'bg-lav'}`}
                    >
                      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>{r}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="mb-2 mt-5 text-[13px] font-semibold text-muted">Role</Text>
              <Segment
                options={[
                  { key: 'beneficiary', label: RECIPIENT_ROLE_LABEL.beneficiary },
                  { key: 'fallback', label: RECIPIENT_ROLE_LABEL.fallback },
                ]}
                value={role}
                onChange={setRole}
              />

              <Input
                label="Withdrawal Limit"
                prefix="₦"
                value={groupAmountInput(limit)}
                onChangeText={(t) => setLimit(sanitizeAmountInput(t))}
                placeholder="No limit"
                keyboardType="decimal-pad"
                containerClassName="mt-5"
              />
              <Text className="ml-1 mt-1.5 text-[12px] text-muted">The most they can take once unlocked. Leave empty for no limit.</Text>

              <Text className="mb-2 mt-5 text-[13px] font-semibold text-muted">Access Type</Text>
              <Segment
                options={[
                  { key: 'immediate', label: ACCESS_TYPE_LABEL.immediate },
                  { key: 'delay_7d', label: ACCESS_TYPE_LABEL.delay_7d },
                ]}
                value={accessType}
                onChange={setAccessType}
              />
              <Text className="ml-1 mt-1.5 text-[12px] text-muted">
                {accessType === 'immediate'
                  ? 'They can withdraw as soon as the wallet unlocks.'
                  : 'They can withdraw 7 days after the wallet unlocks.'}
              </Text>

              <ErrorText message={error} className="mt-4" />
              <Button title="Add Recipient" icon="person-add" iconPosition="left" onPress={save} className="mt-5" />
            </KeyboardAwareScrollView>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
