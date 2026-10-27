import React, { useEffect, useState } from 'react';
import { Alert, Modal, Switch, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from './PinPad';
import { colors } from '../theme';
import { useAuth, useTxnPinLength } from '../store/auth';
import {
  clearTxnPin,
  getBiometricSupport,
  runBiometricPrompt,
  saveTxnPin,
  type BiometricSupport,
} from '../lib/biometrics';
import { notifySuccess } from '../lib/haptics';

/**
 * Face ID / fingerprint on-off for unlock and payments. Turning it on asks for
 * the biometric, then the transaction PIN once, which is kept in the keychain
 * so a later biometric can authorise payments.
 */
export function BiometricSwitch({ onSupport }: { onSupport?: (s: BiometricSupport) => void }) {
  const insets = useSafeAreaInsets();
  const enabled = useAuth((s) => s.biometricEnabled);
  const setEnabled = useAuth((s) => s.setBiometricEnabled);
  const pinLength = useTxnPinLength();
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const [capture, setCapture] = useState(false);
  const [pin, setPin] = useState('');

  useEffect(() => {
    void getBiometricSupport().then((s) => {
      setSupport(s);
      onSupport?.(s);
    });
  }, [onSupport]);

  const label = support?.label ?? 'Biometric unlock';

  const toggle = async (next: boolean) => {
    if (busy) return;
    if (!next) {
      await setEnabled(false);
      await clearTxnPin();
      return;
    }
    if (!support?.available) {
      Alert.alert('Not available', 'Set up Face ID or a fingerprint in your device settings first, then try again.');
      return;
    }
    setBusy(true);
    try {
      if (await runBiometricPrompt(`Confirm to enable ${label}`)) {
        setPin('');
        setCapture(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const onPin = async (next: string) => {
    setPin(next);
    if (next.length === pinLength) {
      await saveTxnPin(next);
      await setEnabled(true);
      notifySuccess();
      setCapture(false);
    }
  };

  return (
    <>
      <Switch
        value={enabled}
        onValueChange={(v) => void toggle(v)}
        trackColor={{ false: colors.border, true: colors.brand }}
        thumbColor={colors.white}
        accessibilityLabel={label}
      />
      <Modal visible={capture} transparent animationType="slide" onRequestClose={() => setCapture(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 justify-end bg-black/50">
            <View className="rounded-t bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
              <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />
              <View className="mb-4 flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-xl font-extrabold text-ink">Confirm your PIN</Text>
                  <Text className="mt-1 text-sm text-muted">
                    Enter your transaction PIN once so {label} can authorize payments securely.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setCapture(false)}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>
              <PinPad value={pin} onChange={(v) => void onPin(v)} length={pinLength} />
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}
