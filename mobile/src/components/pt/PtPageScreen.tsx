import React from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { PtBackButton } from './PtStepScreen';

/**
 * A page with a compact top bar — back, a title and a small line under it —
 * as on "Add a recipient · Tithes and offerings" (GIV-07) and "Spending limits ·
 * Household · November" (WAL-09).
 */
export function PtPageScreen({
  title,
  subtitle,
  onBack,
  right,
  footer,
  gap = 16,
  children,
}: {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  gap?: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 4 }}>
      <StatusBar style="dark" />
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 }}>
        <PtBackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, lineHeight: 26, color: pt.ink }} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ marginRight: 8 }}>{right}</View> : null}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>{footer}</View> : null}
    </View>
  );
}
