import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useAuth } from '../store/auth';
import { getBiometricSupport, runBiometricPrompt, type BiometricSupport } from '../lib/biometrics';
import { notifySuccess } from '../lib/haptics';
import { initials } from '../lib/format';

interface AppLockProps {
  /** Escape hatch: sign in with the password form instead of biometrics. */
  onUsePassword: () => void;
}

/**
 * Launch-time lock for a persisted, biometric-protected session. Auto-runs the
 * biometric prompt and restores the session on success (Google-Pay unlock).
 */
export function AppLock({ onUsePassword }: AppLockProps) {
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const unlockStoredSession = useAuth((s) => s.unlockStoredSession);
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const attempt = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const ok = await runBiometricPrompt('Unlock Patriai');
    if (ok) {
      notifySuccess();
      await unlockStoredSession();
    } else {
      setFailed(true);
    }
    setBusy(false);
  }, [unlockStoredSession]);

  useEffect(() => {
    let cancelled = false;
    void getBiometricSupport().then((s) => {
      if (cancelled) return;
      setSupport(s);
      void attempt();
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <View className="flex-1 bg-page">
      <StatusBar style="dark" />
      <View
        className="flex-1 items-center justify-between px-8"
        style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}
      >
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-lav-soft">
            <Ionicons name="shield-checkmark-outline" size={30} color={colors.brand} />
          </View>
          <Text className="mt-5 text-2xl font-semibold text-ink">Patriai</Text>
        </View>

        <View className="items-center">
          {user ? (
            <View className="mb-6 items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-lav-soft">
                <Text className="text-lg font-semibold text-brand">{initials(user.full_name)}</Text>
              </View>
              <Text className="mt-3 text-lg font-semibold text-ink">Welcome back, {user.first_name}</Text>
            </View>
          ) : null}

          <Pressable onPress={() => void attempt()} disabled={busy} className="items-center active:opacity-80">
            <View
              className={`h-24 w-24 items-center justify-center rounded-full ${
                failed ? 'bg-danger-soft' : 'bg-lav-soft'
              }`}
            >
              <Ionicons
                name={support?.icon ?? 'finger-print'}
                size={48}
                color={failed ? colors.danger : colors.brand}
              />
            </View>
            <Text className="mt-4 text-sm font-medium text-muted">
              {busy
                ? 'Authenticating…'
                : failed
                  ? 'Tap to try again'
                  : `Unlock with ${support?.label ?? 'biometrics'}`}
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={onUsePassword} hitSlop={8} className="active:opacity-70">
          <Text className="text-sm font-semibold text-brand">Use password instead</Text>
        </Pressable>
      </View>
    </View>
  );
}
