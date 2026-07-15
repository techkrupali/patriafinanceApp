import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from './PinPad';
import { ErrorText } from './ErrorText';
import { colors } from '../theme';
import { useAuth } from '../store/auth';
import {
  getBiometricSupport,
  getTxnPin,
  runBiometricPrompt,
  type BiometricSupport,
} from '../lib/biometrics';
import { notifySuccess } from '../lib/haptics';

interface PinSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  /** Optional payment summary shown at the top of the sheet. */
  amount?: string;
  recipient?: string;
  loading?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

type Mode = 'bio' | 'pin';

/**
 * Google-Pay style authorize sheet. If biometrics are enabled it prompts Face /
 * Fingerprint immediately and — when a PIN was cached at enrol time — submits it
 * automatically. A visible "Enter PIN instead" fallback always reveals the keypad.
 */
export function PinSheet({
  visible,
  title = 'Authorize payment',
  subtitle,
  amount,
  recipient,
  loading = false,
  error,
  onSubmit,
  onClose,
}: PinSheetProps) {
  const insets = useSafeAreaInsets();
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<Mode>('pin');
  const [bioFailed, setBioFailed] = useState(false);
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const tryBiometric = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBioFailed(false);
    setMode('bio');
    const ok = await runBiometricPrompt('Authorize your payment');
    runningRef.current = false;
    if (ok) {
      const stored = await getTxnPin();
      if (stored) {
        notifySuccess();
        onSubmit(stored);
        return;
      }
      // Biometric matched but no cached PIN — ask for it manually.
      setMode('pin');
      return;
    }
    setBioFailed(true);
  }, [onSubmit]);

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setBioFailed(false);
    if (biometricEnabled && support?.available) {
      void tryBiometric();
    } else {
      setMode('pin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, biometricEnabled, support?.available]);

  useEffect(() => {
    // A failed API attempt (e.g. wrong PIN) drops back to manual entry.
    if (error) {
      setPin('');
      setMode('pin');
    }
  }, [error]);

  const handleChange = (next: string) => {
    if (loading) return;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  };

  const showBioKey = biometricEnabled && support?.available;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* RNGH gestures don't reach into a Modal's separate view tree without its
          own root — without this the PIN pad / buttons are dead. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-[32px] bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />

          <View className="mb-4 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xl font-extrabold text-ink">{title}</Text>
              {subtitle ? <Text className="mt-1 text-sm text-muted">{subtitle}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              disabled={loading}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* Payment summary */}
          {amount || recipient ? (
            <View className="mb-5 rounded-2xl bg-lav-faint p-4">
              {amount ? (
                <Text className="text-3xl font-extrabold tracking-tight text-ink">{amount}</Text>
              ) : null}
              {recipient ? (
                <View className="mt-1 flex-row items-center">
                  <Ionicons name="arrow-forward" size={13} color={colors.muted} style={{ marginRight: 4 }} />
                  <Text className="text-[13px] text-muted" numberOfLines={1}>
                    {recipient}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <ErrorText message={error} className="mb-3" />

          {loading ? (
            <View className="items-center py-14">
              <ActivityIndicator size="large" color={colors.navy} />
              <Text className="mt-4 text-sm text-muted">Processing your payment…</Text>
            </View>
          ) : mode === 'bio' ? (
            <View className="items-center py-8">
              <View
                className={`h-24 w-24 items-center justify-center rounded-full ${
                  bioFailed ? 'bg-danger-soft' : 'bg-success-soft'
                }`}
              >
                <Ionicons
                  name={support?.icon ?? 'finger-print'}
                  size={46}
                  color={bioFailed ? colors.danger : colors.brand}
                />
              </View>
              <Text className="mt-5 text-base font-semibold text-ink">
                {bioFailed ? 'Authentication cancelled' : `Confirm with ${support?.label ?? 'biometrics'}`}
              </Text>
              <Text className="mt-1 text-center text-[13px] text-muted">
                {bioFailed
                  ? 'Try again or enter your PIN to authorize.'
                  : 'Follow the prompt on your device.'}
              </Text>
              {bioFailed ? (
                <Pressable
                  onPress={() => void tryBiometric()}
                  className="mt-5 flex-row items-center rounded-full bg-lav px-6 py-2.5 active:opacity-80"
                >
                  <Ionicons name="refresh" size={16} color={colors.navy} style={{ marginRight: 6 }} />
                  <Text className="text-sm font-semibold text-navy">Try again</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setMode('pin')} className="mt-4 active:opacity-70" hitSlop={8}>
                <Text className="text-sm font-semibold text-brand">Enter PIN instead</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <PinPad
                value={pin}
                onChange={handleChange}
                onBiometric={showBioKey ? () => void tryBiometric() : undefined}
                biometricIcon={support?.icon}
              />
            </View>
          )}
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
