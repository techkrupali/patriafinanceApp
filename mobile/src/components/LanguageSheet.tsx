import React from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../theme';
import { selection } from '../lib/haptics';
import type { Lang } from '../store/language';

const OPTIONS: { lang: Lang; title: string; sample: string }[] = [
  { lang: 'en', title: 'English', sample: 'Good evening, Ngozi' },
  { lang: 'pcm', title: 'Nigerian Pidgin', sample: 'How you dey, Ngozi' },
];

/** ME-14 Language: English or Pidgin for the app. */
export function LanguageSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: Lang;
  onPick: (lang: Lang) => void;
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
            gap: 12,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: pt.line }} />
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, lineHeight: 26, color: pt.ink }} accessibilityRole="header">
            Language
          </Text>
          {OPTIONS.map((o) => {
            const on = o.lang === value;
            return (
              <Pressable
                key={o.lang}
                onPress={() => {
                  selection();
                  onPick(o.lang);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  minHeight: 64,
                  borderRadius: ptRadius.md,
                  borderWidth: 2,
                  borderColor: on ? pt.brand : pt.line,
                  backgroundColor: on ? pt.brandSoft : pt.raised,
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: on ? pt.brand : pt.ink }}>{o.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{o.sample}</Text>
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
