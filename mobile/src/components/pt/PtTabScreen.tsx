import React from 'react';
import { Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { selection } from '../../lib/haptics';
import { PtText } from './PtText';
import { PtBackButton } from './PtStepScreen';

interface PtTabScreenProps {
  /** 28pt page title (Family, Treasury, Rules, More). Omit for a custom header. */
  title?: string;
  /** Right of the title, e.g. an "Invite" button. */
  action?: React.ReactNode;
  /** Space between blocks (the prototype uses 16–18). */
  gap?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** When the same page is also opened from a stack (not as a tab). */
  onBack?: () => void;
  children: React.ReactNode;
}

/** A main tab page: surface canvas, title row, scrolling stack of blocks. */
export function PtTabScreen({ title, action, gap = 16, refreshing = false, onRefresh, onBack, children }: PtTabScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 28, gap }}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pt.brand} /> : undefined}
      >
        {onBack ? (
          <View style={{ marginLeft: -12, marginBottom: -8 }}>
            <PtBackButton onPress={onBack} />
          </View>
        ) : null}
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <PtText variant="headline" accessibilityRole="header">
              {title}
            </PtText>
            {action}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

/** Round brand-soft icon with a bold label under it (Home and Treasury actions). */
export function PtQuickAction({
  label,
  icon,
  onPress,
  size = 46,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  size?: number;
  /** Not built yet: greyed and not tappable. */
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        selection();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ flex: 1, alignItems: 'center', gap: 6, opacity: disabled ? 0.45 : 1 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pt.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: pt.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/** The prototype's 48×28 switch: brand track when on, white knob. */
export function PtSwitch({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        selection();
        onChange(!value);
      }}
      // RNGH's Pressable ignores taps on role=switch elements on web; native keeps the switch role.
      accessibilityRole={Platform.OS === 'web' ? 'button' : 'switch'}
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      hitSlop={6}
      style={{
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: value ? pt.brand : pt.lineStrong,
        opacity: disabled ? 0.5 : 1,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 3,
          left: value ? 23 : 3,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#FFFFFF',
        }}
      />
    </Pressable>
  );
}
