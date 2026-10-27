import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt } from '../../theme';

/** Prototype checkbox: brand square with a white tick, or an outlined box. */
export function PtCheckbox({ checked, size = 24 }: { checked: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        ...(checked
          ? { backgroundColor: pt.brand }
          : { backgroundColor: pt.raised, borderWidth: 1.5, borderColor: pt.lineStrong }),
      }}
    >
      {checked ? <Feather name="check" size={size - 6} color={pt.onBrand} /> : null}
    </View>
  );
}

/** Prototype radio: outlined circle, filled brand dot when chosen. */
export function PtRadio({ checked, size = 22 }: { checked: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: checked ? pt.brand : pt.lineStrong,
        backgroundColor: pt.raised,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <View style={{ width: size - 10, height: size - 10, borderRadius: (size - 10) / 2, backgroundColor: pt.brand }} /> : null}
    </View>
  );
}
