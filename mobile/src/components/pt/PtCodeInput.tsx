import React, { forwardRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { FocusRing, fieldBox } from './PtField';

interface PtCodeInputProps {
  value: string;
  onChange: (digits: string) => void;
  length?: number;
  error?: boolean;
}

/**
 * ONB-04 code boxes: six 60pt boxes driven by one hidden input, so paste and
 * SMS autofill work. The next empty box carries the focus border and ring.
 */
export const PtCodeInput = forwardRef<TextInput, PtCodeInputProps>(function PtCodeInput(
  { value, onChange, length = 6, error = false },
  ref,
) {
  const focusInput = () => (ref && typeof ref === 'object' ? ref.current?.focus() : undefined);

  return (
    <View>
      <Pressable onPress={focusInput} style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`${length}-digit code`}>
        {Array.from({ length }).map((_, i) => {
          const active = i === Math.min(value.length, length - 1) && value.length < length;
          return (
            <View key={i} style={{ flex: 1 }}>
              <FocusRing focused={active}>
                <View style={[fieldBox(active, error), { height: 60, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, color: pt.ink }}>{value[i] ?? ''}</Text>
                </View>
              </FocusRing>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        caretHidden
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      />
    </View>
  );
});
