import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, ScrollView, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { selection } from '../../lib/haptics';
import { PtText } from './PtText';

/** Keyboard height on Android, where edge-to-edge disables adjustResize. */
function useAndroidKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function PtBackButton({ onPress, close = false }: { onPress: () => void; close?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={close ? 'Close' : 'Back'}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
    >
      <Feather name={close ? 'x' : 'chevron-left'} size={close ? 24 : 26} color={pt.ink} />
    </Pressable>
  );
}

/** WCR step bar: one segment per step, filled up to the current one. */
export function PtProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      style={{ flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 8 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? pt.brand : pt.sunken }} />
      ))}
    </View>
  );
}

interface PtStepScreenProps {
  onBack?: () => void;
  /** Show × instead of the back chevron (first step of a flow). */
  closeIcon?: boolean;
  /** Segmented step bar beside the back button. */
  progress?: { step: number; total: number };
  /** Right side of the top row, e.g. the language toggle. */
  headerRight?: React.ReactNode;
  /** Overline above the title, e.g. "STEP 1 OF 5". */
  step?: string;
  title?: string;
  subtitle?: React.ReactNode;
  /** Gap between the header block and the body (the prototype uses 20–28). */
  gap?: number;
  /** Pinned to the bottom, above the keyboard. */
  footer?: React.ReactNode;
  /** False for screens with their own bottom-anchored layout (PIN pad). */
  scroll?: boolean;
  children?: React.ReactNode;
}

/**
 * Prototype step page (ONB-03/04/06/09): surface canvas, back chevron row,
 * green overline + 28pt headline + muted subtitle, body, and a pinned footer.
 */
export function PtStepScreen({
  onBack,
  closeIcon = false,
  progress,
  headerRight,
  step,
  title,
  subtitle,
  gap = 24,
  footer,
  scroll = true,
  children,
}: PtStepScreenProps) {
  const insets = useSafeAreaInsets();
  const kb = useAndroidKeyboardHeight();

  const header = (
    <View style={{ gap: 8 }}>
      {step ? (
        <PtText variant="overline" color={pt.brand}>
          {step}
        </PtText>
      ) : null}
      {title ? (
        <PtText variant="headline" accessibilityRole="header">
          {title}
        </PtText>
      ) : null}
      {typeof subtitle === 'string' ? (
        <PtText color={pt.inkMuted}>{subtitle}</PtText>
      ) : (
        subtitle ?? null
      )}
    </View>
  );

  const body = (
    <View style={{ paddingHorizontal: 20, paddingTop: 20, gap }}>
      {header}
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 4 }}>
      <StatusBar style="dark" />
      <View
        style={{
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
        }}
      >
        {onBack ? <PtBackButton onPress={onBack} close={closeIcon} /> : <View style={{ width: 44 }} />}
        {progress ? <PtProgressBar step={progress.step} total={progress.total} /> : null}
        {headerRight ? <View style={{ marginRight: 8 }}>{headerRight}</View> : progress ? <View style={{ width: 12 }} /> : null}
      </View>

      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}

      {footer ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: kb > 0 ? 12 : Math.max(insets.bottom, 12) + 18,
            marginBottom: kb > 0 ? kb - insets.bottom : 0,
            gap: 14,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/** ONB-03 language pill: sunken track, white active segment. */
export function LanguageToggle({
  value,
  onChange,
}: {
  value: 'en' | 'pcm';
  onChange: (lang: 'en' | 'pcm') => void;
}) {
  const option = (lang: 'en' | 'pcm', label: string) => {
    const active = value === lang;
    return (
      <Pressable
        key={lang}
        onPress={() => {
          if (active) return;
          selection();
          onChange(lang);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          height: 32,
          paddingHorizontal: 14,
          borderRadius: 999,
          justifyContent: 'center',
          backgroundColor: active ? pt.raised : 'transparent',
        }}
      >
        <PtText variant="label" color={active ? pt.ink : pt.inkMuted} style={active ? { fontFamily: ptFont.bold } : undefined}>
          {label}
        </PtText>
      </Pressable>
    );
  };
  return (
    <View
      accessibilityLabel="Language"
      style={{ flexDirection: 'row', backgroundColor: pt.sunken, borderRadius: 999, padding: 3 }}
    >
      {option('en', 'English')}
      {option('pcm', 'Pidgin')}
    </View>
  );
}
