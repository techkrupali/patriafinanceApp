import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, Ionicons } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { tapLight, tapMedium } from '../../lib/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * `plain` is ONB-06 (16pt dots, borderless 64pt keys); `raised` is ACC-02
 * (14pt dots, white 56pt keys with 12pt corners).
 */
type Variant = 'plain' | 'raised';

export function PtPinDots({ length, filled, variant = 'plain' }: { length: number; filled: number; variant?: Variant }) {
  const size = variant === 'plain' ? 16 : 14;
  return (
    <View
      accessibilityLabel={`${filled} of ${length} digits entered`}
      style={{ flexDirection: 'row', justifyContent: 'center', gap: variant === 'plain' ? 16 : 14 }}
    >
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            ...(i < filled ? { backgroundColor: pt.brand } : { borderWidth: 2, borderColor: pt.lineStrong }),
          }}
        />
      ))}
    </View>
  );
}

interface PtPinFieldProps {
  value: string;
  onChange: (next: string) => void;
  length: number;
  variant?: Variant;
  /** While a request runs: typing is ignored, the keyboard stays up. */
  disabled?: boolean;
}

/**
 * PIN entry with the phone's own number keyboard: the dots, driven by one
 * hidden input (like the code boxes). Tapping the dots brings the keyboard
 * back. Digits only, no autofill or suggestions.
 */
export const PtPinField = forwardRef<TextInput, PtPinFieldProps>(function PtPinField(
  { value, onChange, length, variant = 'plain', disabled = false },
  ref,
) {
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityRole="button" accessibilityLabel="Enter your PIN" style={{ paddingVertical: 14 }}>
      <PtPinDots length={length} filled={value.length} variant={variant} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => {
          const next = t.replace(/\D/g, '').slice(0, length);
          if (disabled || next === value) return;
          if (next.length > value.length) tapMedium();
          else tapLight();
          onChange(next);
        }}
        keyboardType="number-pad"
        // Android: a numeric password field, so the keyboard doesn't learn or suggest it.
        secureTextEntry={Platform.OS === 'android'}
        maxLength={length}
        autoFocus
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        contextMenuHidden
        caretHidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
    </Pressable>
  );
});

interface PtKeypadProps {
  value: string;
  onChange: (next: string) => void;
  length: number;
  variant?: Variant;
  /** Shows a biometric key bottom-left (raised variant). */
  onBiometric?: () => void;
  biometricIcon?: IconName;
  disabled?: boolean;
}

export function PtKeypad({
  value,
  onChange,
  length,
  variant = 'plain',
  onBiometric,
  biometricIcon = 'scan-outline',
  disabled = false,
}: PtKeypadProps) {
  const raised = variant === 'raised';

  const press = (d: string) => {
    if (disabled || value.length >= length) return;
    tapMedium();
    onChange(value + d);
  };
  const erase = () => {
    if (disabled || !value) return;
    tapLight();
    onChange(value.slice(0, -1));
  };

  const key = (content: React.ReactNode, onPress: (() => void) | undefined, label: string, flat = false) => (
    <View key={label} style={{ width: '33.333%', paddingHorizontal: raised ? 5 : 12, paddingVertical: raised ? 5 : 6 }}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => ({
            height: raised ? 56 : 64,
            borderRadius: raised ? ptRadius.sm : 999,
            backgroundColor: raised && !flat ? pt.raised : pressed ? pt.sunken : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed && raised ? 0.7 : 1,
          })}
        >
          {content}
        </Pressable>
      ) : (
        <View style={{ height: raised ? 56 : 64 }} />
      )}
    </View>
  );

  const digit = (d: string) =>
    key(
      <Text style={{ fontFamily: raised ? ptFont.bold : ptFont.semibold, fontSize: raised ? 24 : 26, color: pt.ink }}>{d}</Text>,
      () => press(d),
      d,
    );

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: raised ? -5 : 0 }}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit)}
      {onBiometric
        ? key(<Ionicons name={biometricIcon} size={26} color={pt.ink} />, onBiometric, 'Use biometrics', true)
        : key(null, undefined, 'blank')}
      {digit('0')}
      {raised
        ? key(<Text style={{ fontFamily: ptFont.bold, fontSize: 24, color: pt.ink }}>⌫</Text>, erase, 'Delete')
        : key(<Feather name="delete" size={26} color={pt.ink} />, erase, 'Delete')}
    </View>
  );
}
