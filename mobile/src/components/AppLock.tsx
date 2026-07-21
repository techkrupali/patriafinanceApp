import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, shadow } from '../theme';
import { useAuth } from '../store/auth';
import { getBiometricSupport, runBiometricPrompt, type BiometricSupport } from '../lib/biometrics';
import { notifySuccess, selection } from '../lib/haptics';

interface AppLockProps {
  /** Escape hatch: sign in with the password form instead of biometrics. */
  onUsePassword: () => void;
}

/**
 * Launch-time lock for a persisted, biometric-protected session. Auto-runs the
 * biometric prompt and restores the session on success (Google-Pay unlock).
 * Styled as the Patria "Security Checkpoint" — bright surface, gold primary.
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
      <LinearGradient colors={gradients.aurora} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ flex: 1 }}>
        <View
          className="flex-1 px-6"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
        >
          {/* Top bar — brand + checkpoint title */}
          <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
            <Ionicons name="shield-checkmark" size={20} color={colors.goldDeep} />
            <Text className="text-lg font-extrabold tracking-tight text-ink">Security Check</Text>
          </View>

          {/* Shield tile + headline */}
          <View className="items-center px-2 pt-12">
            <View className="items-center justify-center">
              <View
                className="absolute rounded-full"
                style={{
                  height: 132,
                  width: 132,
                  borderWidth: 2,
                  borderColor: 'rgba(255,204,0,0.25)',
                }}
              />
              <View
                className="h-24 w-24 items-center justify-center rounded-3xl bg-white"
                style={shadow.card}
              >
                <Ionicons name="shield-checkmark" size={46} color={colors.goldDeep} />
              </View>
            </View>
            <Text className="mt-9 text-center text-[24px] font-extrabold leading-8 tracking-tight text-ink">
              We Need to Confirm It’s You
            </Text>
            <Text className="mt-3 text-center text-[15px] leading-6 text-muted">
              {user
                ? `Welcome back, ${user.first_name} — verify it’s really you to unlock Patriai.`
                : 'Verify it’s really you to unlock Patriai.'}
            </Text>
          </View>

          {/* Verification options */}
          <View className="mt-10" style={{ gap: 14 }}>
            {/* Primary — biometrics on the metallic gold gradient */}
            <Pressable
              onPress={() => {
                selection();
                void attempt();
              }}
              disabled={busy}
              className="active:opacity-90"
            >
              <LinearGradient
                colors={gradients.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  {
                    height: 64,
                    borderRadius: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                  },
                  shadow.gold,
                ]}
              >
                <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <Ionicons name={support?.icon ?? 'finger-print'} size={22} color={colors.white} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-white">
                    {failed ? 'Tap to try again' : `Use ${support?.label ?? 'Face ID / Fingerprint'}`}
                  </Text>
                  <Text className="text-xs text-white/80">
                    {busy ? 'Authenticating…' : 'Fast & secure'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
              </LinearGradient>
            </Pressable>

            {/* Secondary — password fallback */}
            <Pressable
              onPress={() => {
                selection();
                onUsePassword();
              }}
              className="flex-row items-center rounded-2xl bg-white px-5 active:opacity-80"
              style={[{ height: 64 }, shadow.soft]}
            >
              <View className="mr-4 h-10 w-10 items-center justify-center rounded-xl bg-page-top">
                <Ionicons name="key-outline" size={20} color={colors.muted} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-ink">Use password instead</Text>
                <Text className="text-xs text-muted">Sign in with your password</Text>
              </View>
            </Pressable>
          </View>

          <View className="flex-1" />

          {/* Guidance box */}
          <View className="flex-row items-start rounded-2xl bg-page-top p-4">
            <View className="mr-3 rounded-xl bg-success-soft p-2">
              <Ionicons name="information-circle" size={18} color={colors.brand} />
            </View>
            <Text className="flex-1 text-[13px] leading-5 text-muted">
              This helps keep your treasury and family funds secure by preventing unauthorized
              access to your account.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
