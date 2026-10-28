import React from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { groupAmountInput, sanitizeAmountInput } from '../../lib/format';

/**
 * The big "₦300,000" you type into (SPD-02, JNT-02, CHW-02). On web an input
 * keeps a wide default width that pushes the ₦ out of view, so it's sized to
 * its digits there.
 */
export function PtHeroAmount({ value, onChange, label }: { value: string; onChange: (naira: string) => void; label: string }) {
  const shown = groupAmountInput(value);
  const web = Platform.OS === 'web' ? { width: Math.max(1, shown.length) * 27 + 6 } : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 44, color: pt.ink }}>₦</Text>
      <TextInput
        value={shown}
        onChangeText={(t) => onChange(sanitizeAmountInput(t))}
        placeholder="0"
        placeholderTextColor={pt.inkSubtle}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        style={[{ minWidth: 40, fontFamily: ptFont.extrabold, fontSize: 44, letterSpacing: -1, color: pt.ink, paddingVertical: 0, textAlign: 'center' }, web]}
      />
    </View>
  );
}
