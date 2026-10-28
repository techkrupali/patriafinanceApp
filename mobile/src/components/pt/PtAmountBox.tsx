import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { groupAmountInput, sanitizeAmountInput } from '../../lib/format';

/** Small "₦ 30,000" box at the end of a row (EMG-02 contributors, SPD-03 category limits). */
export function PtAmountBox({ value, onChange, label, width = 118 }: { value: string; onChange: (v: string) => void; label: string; width?: number }) {
  return (
    <View
      style={{
        width,
        height: 44,
        borderRadius: ptRadius.sm,
        borderWidth: 1.5,
        borderColor: pt.lineStrong,
        backgroundColor: pt.raised,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        gap: 4,
      }}
    >
      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.inkMuted }}>₦</Text>
      <TextInput
        value={groupAmountInput(value)}
        onChangeText={(t) => onChange(sanitizeAmountInput(t))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={pt.inkSubtle}
        accessibilityLabel={label}
        // minWidth 0: a web input otherwise keeps its natural width and spills out of the box.
        style={{ flex: 1, minWidth: 0, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink, paddingVertical: 0, textAlign: 'right' }}
      />
    </View>
  );
}
