import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';
import { groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { DEFAULT_COUNTRY, isValidE164, toE164, type Country } from '../../lib/phone';
import { PtPhoneField } from './PtPhoneField';
import { PtField } from './PtField';
import { PtButton } from './PtButton';
import { PtText } from './PtText';

/** Outlined "Co-owner ▾" pill that opens a role sheet. */
export function PtRoleButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        height: 40,
        paddingHorizontal: 10,
        borderRadius: ptRadius.sm,
        borderWidth: 1.5,
        borderColor: pt.lineStrong,
        backgroundColor: pt.raised,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.ink }}>{label}</Text>
      <Feather name="chevron-down" size={16} color={pt.ink} />
    </Pressable>
  );
}

/** Dashed "+" circle and a brand label ("Invite someone new", "Add a contributor"). */
export function PtAddRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: pt.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="plus" size={18} color={pt.brand} />
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{label}</Text>
    </Pressable>
  );
}

export interface NewPersonInput {
  phone: string;
  name: string;
  role?: string;
  /** Naira, when the form asks for a monthly amount. */
  amount?: string;
}

/**
 * Invite someone who isn't in the family circle yet: phone (any country), name,
 * and a role and/or a monthly amount when the flow needs one.
 */
export function PtNewPersonForm<R extends string>({
  roles,
  defaultRole,
  withAmount = false,
  taken,
  onAdd,
  onCancel,
}: {
  roles?: { value: R; label: string }[];
  defaultRole?: R;
  withAmount?: boolean;
  /** Phone numbers already on the list (and your own). */
  taken: string[];
  onAdd: (person: NewPersonInput & { role?: R }) => void;
  onCancel: () => void;
}) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<R | undefined>(defaultRole);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const e164 = toE164(country.dial, phone);
    if (!isValidE164(e164)) {
      setError('Enter a valid phone number.');
      return;
    }
    if (taken.includes(e164)) {
      setError("They're already on the list.");
      return;
    }
    if (withAmount && !(Number(amount) > 0)) {
      setError('Enter how much they put in each month.');
      return;
    }
    onAdd({ phone: e164, name: name.trim(), role, amount: withAmount ? amount : undefined });
  };

  return (
    <View style={{ paddingVertical: 14, gap: 14 }}>
      <PtPhoneField
        label="Their phone number"
        country={country}
        onChangeCountry={setCountry}
        value={phone}
        onChange={(d) => {
          setPhone(d);
          setError(null);
        }}
        autoFocus
      />
      <PtField label="Their name (optional)" value={name} onChangeText={setName} placeholder="Chidi" maxLength={60} />
      {withAmount ? (
        <PtField
          label="Each month"
          prefix="₦"
          value={groupAmountInput(amount)}
          onChangeText={(t) => {
            setAmount(sanitizeAmountInput(t));
            setError(null);
          }}
          placeholder="0"
          keyboardType="decimal-pad"
        />
      ) : null}
      {roles ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {roles.map((r) => {
            const on = r.value === role;
            return (
              <Pressable
                key={r.value}
                onPress={() => {
                  selection();
                  setRole(r.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: ptRadius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: on ? 2 : 1.5,
                  borderColor: on ? pt.brand : pt.lineStrong,
                  backgroundColor: on ? pt.brandSoft : pt.raised,
                }}
              >
                <Text style={{ fontFamily: on ? ptFont.bold : ptFont.medium, fontSize: 14, color: on ? pt.brand : pt.ink }}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {error ? (
        <PtText variant="caption" color={pt.danger}>
          {error}
        </PtText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PtButton title="Cancel" variant="secondary" size="sm" style={{ flex: 1 }} onPress={onCancel} />
        <PtButton title="Add" size="sm" style={{ flex: 1 }} onPress={add} />
      </View>
    </View>
  );
}
