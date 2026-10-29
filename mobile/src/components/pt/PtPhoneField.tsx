import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { formatNational, type Country } from '../../lib/phone';
import { selection } from '../../lib/haptics';
import { CountryPickerModal } from '../CountryPicker';
import { FocusRing, fieldBox } from './PtField';
import { PtText } from './PtText';

interface PtPhoneFieldProps {
  label: string;
  country: Country;
  onChangeCountry: (c: Country) => void;
  /** National number digits. */
  value: string;
  onChange: (digits: string) => void;
  error?: string | null;
  /**
   * `split`: the dial code in its own box beside the number (ONB-03).
   * `inline`: the dial code as a prefix inside one box (ACC-01).
   */
  layout?: 'split' | 'inline';
  autoFocus?: boolean;
}

/**
 * Phone number field. The dial code opens the country list, since family
 * abroad sign up too. Digits are shown grouped ("803 412 7790") but kept raw.
 */
export function PtPhoneField({
  label,
  country,
  onChangeCountry,
  value,
  onChange,
  error,
  layout = 'split',
  autoFocus,
}: PtPhoneFieldProps) {
  const [focused, setFocused] = useState(false);
  const [picker, setPicker] = useState(false);
  const shown = formatNational(country.dial, value);

  const onText = (t: string) => {
    let digits = t.replace(/\D/g, '');
    // Backspacing over a grouping space removes the digit before it. Only a single
    // deleted space counts: pasting the same number unspaced must keep every digit.
    const deletedSpace = t.length === shown.length - 1 && [...shown].some((ch, i) => ch === ' ' && shown.slice(0, i) + shown.slice(i + 1) === t);
    if (digits === value && deletedSpace) digits = digits.slice(0, -1);
    onChange(digits.slice(0, 15));
  };

  const dial = (
    <Pressable
      onPress={() => {
        selection();
        setPicker(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Country code +${country.dial}`}
      hitSlop={4}
    >
      <Text style={{ fontFamily: layout === 'split' ? ptFont.semibold : ptFont.bold, fontSize: 17, color: layout === 'split' ? pt.ink : pt.inkMuted }}>
        +{country.dial}
      </Text>
    </Pressable>
  );

  const input = (
    <TextInput
      value={shown}
      onChangeText={onText}
      keyboardType="phone-pad"
      autoComplete="tel-national"
      textContentType="telephoneNumber"
      autoFocus={autoFocus}
      selectionColor={pt.brand}
      cursorColor={pt.brand}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 17, color: pt.ink, paddingVertical: 0, fontVariant: ['tabular-nums'] }}
    />
  );

  return (
    <View style={{ gap: 8 }}>
      <PtText variant="label">{label}</PtText>
      {layout === 'split' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[fieldBox(false), { paddingHorizontal: 14, justifyContent: 'center' }]}>{dial}</View>
          <View style={{ flex: 1 }}>
            <FocusRing focused={focused}>
              <View style={[fieldBox(focused, Boolean(error)), { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }]}>
                {input}
              </View>
            </FocusRing>
          </View>
        </View>
      ) : (
        <FocusRing focused={focused}>
          <View style={[fieldBox(focused, Boolean(error)), { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            {dial}
            {input}
          </View>
        </FocusRing>
      )}
      {error ? (
        <PtText variant="caption" color={pt.danger}>
          {error}
        </PtText>
      ) : null}
      <CountryPickerModal
        visible={picker}
        country={country}
        onPick={(c) => {
          onChangeCountry(c);
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
      />
    </View>
  );
}
