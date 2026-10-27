import React from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';

export interface PtOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

/** Bottom sheet with one choice per row (a role, how long requests wait…). */
export function PtOptionSheet<T extends string | number>({
  visible,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PtOption<T>[];
  value: T | null;
  onPick: (value: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(8,57,47,0.55)' }} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: pt.raised,
            borderTopLeftRadius: ptRadius.lg,
            borderTopRightRadius: ptRadius.lg,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 12) + 22,
            gap: 10,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: pt.line }} />
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, lineHeight: 26, color: pt.ink, marginBottom: 2 }} accessibilityRole="header">
            {title}
          </Text>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                onPress={() => {
                  selection();
                  onPick(o.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  minHeight: 56,
                  borderRadius: ptRadius.md,
                  borderWidth: 2,
                  borderColor: on ? pt.brand : pt.line,
                  backgroundColor: on ? pt.brandSoft : pt.raised,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: on ? pt.brand : pt.ink }}>{o.label}</Text>
                  {o.hint ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{o.hint}</Text> : null}
                </View>
                {on ? <Feather name="check" size={20} color={pt.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
