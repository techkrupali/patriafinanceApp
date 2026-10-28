import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';

/** Bottom sheet with a title and anything inside (edit a spender, pick a charity…). */
export function PtSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(8,57,47,0.55)' }} accessibilityLabel="Close" />
          <View
            style={{
              maxHeight: '88%',
              backgroundColor: pt.raised,
              borderTopLeftRadius: ptRadius.lg,
              borderTopRightRadius: ptRadius.lg,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 12) + 14,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: pt.line }} />
            <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, lineHeight: 26, color: pt.ink }} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{subtitle}</Text> : null}
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 14 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
