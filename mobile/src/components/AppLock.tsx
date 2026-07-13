import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients } from '../theme';
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
    <View className="flex-1">
      <StatusBar style="light" />
      <LinearGradient colors={gradients.navyDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <View
          className="flex-1 items-center justify-between px-8"
          style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}
        >
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <Ionicons name="shield-checkmark" size={30} color={colors.brandGlow} />
            </View>
            <Text className="mt-5 text-2xl font-extrabold text-white">Patriai</Text>
          </View>

          <View className="items-center">
            {user ? (
              <View className="mb-6 items-center">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-white/10">
                  <Text className="text-lg font-bold text-white">{initials(user.full_name)}</Text>
                </View>
                <Text className="mt-3 text-lg font-bold text-white">
                  Welcome back, {user.first_name}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => void attempt()}
              disabled={busy}
              className="items-center active:opacity-80"
            >
              <View
                className={`h-24 w-24 items-center justify-center rounded-full ${
                  failed ? 'bg-danger-soft' : 'bg-white/10'
                }`}
              >
                <Ionicons
                  name={support?.icon ?? 'finger-print'}
                  size={48}
                  color={failed ? colors.danger : colors.brandGlow}
                />
              </View>
              <Text className="mt-4 text-sm font-semibold text-white/90">
                {busy
                  ? 'Authenticating…'
                  : failed
                    ? 'Tap to try again'
                    : `Unlock with ${support?.label ?? 'biometrics'}`}
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={onUsePassword} hitSlop={8} className="active:opacity-70">
            <Text className="text-sm font-semibold text-brand-glow">Use password instead</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
