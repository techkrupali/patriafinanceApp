import React, { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors, shadow } from '../../theme';
import { selection } from '../../lib/haptics';
import { useLogin } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import {
  getBiometricSupport,
  runBiometricPrompt,
  type BiometricSupport,
} from '../../lib/biometrics';
import type { AuthScreenProps } from '../../navigation/types';
import type { User } from '../../api/types';

/**
 * Stitch "Login - The Curated Ledger" (2.1): centered editorial header on the
 * #F6FAFE surface, a white rounded-2xl card with soft shadow holding a tonal
 * Phone/Email segmented toggle, uppercase tracking labels, tonal-fill inputs
 * (12px radius, gold focus), gold-link sign-up row and the gold primary CTA.
 */

/** Design-system field: tonal fill, 12px radius, gold focus accent. */
function Field({
  label,
  secure,
  ...rest
}: TextInputProps & { label: string; secure?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  return (
    <View className="w-full">
      <Text
        className="mb-2 ml-1 text-[11px] font-semibold uppercase text-muted"
        style={{ letterSpacing: 1.5 }}
      >
        {label}
      </Text>
      <View
        className="w-full flex-row items-center rounded-xl px-4"
        style={{
          minHeight: 54,
          backgroundColor: focused ? colors.white : colors.lavSoft, // surface-container-high
          borderWidth: 1.5,
          borderColor: focused ? colors.goldDeep : 'transparent',
        }}
      >
        <TextInput
          placeholderTextColor={colors.faded}
          selectionColor={colors.goldDeep}
          cursorColor={colors.goldDeep}
          secureTextEntry={secure && !reveal}
          className="flex-1 py-3.5 text-[15px]"
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[{ color: colors.ink, fontWeight: '500' }, rest.style]}
        />
        {secure ? (
          <Pressable onPress={() => setReveal((r) => !r)} hitSlop={10} className="pl-2">
            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Tonal segmented toggle (surface-container-low track, white active pill, gold label). */
function Segment({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View className="flex-row rounded-xl bg-page-top p-1">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!active) {
                selection();
                onChange(o.key);
              }
            }}
            className="flex-1 items-center justify-center rounded-lg py-2"
            style={active ? [{ backgroundColor: colors.white }, shadow.soft] : undefined}
          >
            <Text
              className={`text-sm ${active ? 'font-bold' : 'font-medium'}`}
              style={{ color: active ? colors.goldDeep : colors.muted }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [support, setSupport] = useState<BiometricSupport | null>(null);

  const login = useLogin();
  const setSession = useAuth((s) => s.setSession);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const hasStoredSession = useAuth((s) => s.hasStoredSession);
  const unlockStoredSession = useAuth((s) => s.unlockStoredSession);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const offerBiometric = async (user: User, token: string) => {
    try {
      if (!support?.available || biometricEnabled) {
        await setSession(user, token);
        return;
      }
      Alert.alert(
        `Enable ${support.label}?`,
        `Use ${support.label} to sign in faster next time.`,
        [
          { text: 'Not now', style: 'cancel', onPress: () => void setSession(user, token) },
          {
            text: 'Enable',
            onPress: async () => {
              const ok = await runBiometricPrompt(`Confirm to enable ${support.label}`);
              if (ok) await setBiometricEnabled(true);
              await setSession(user, token);
            },
          },
        ],
        { cancelable: false },
      );
    } catch {
      await setSession(user, token);
    }
  };

  const submit = () => {
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email/phone and password.');
      return;
    }
    login.mutate(
      { identifier: identifier.trim(), password },
      {
        onSuccess: (data) => void offerBiometric(data.user, data.token),
        onError: (e) => setError(e.message),
      },
    );
  };

  const biometricSignIn = async () => {
    setError(null);
    setBioBusy(true);
    try {
      const ok = await runBiometricPrompt('Sign in to Patriai');
      if (ok) {
        const restored = await unlockStoredSession();
        if (!restored) setError('No saved session found. Please log in with your password.');
      }
    } finally {
      setBioBusy(false);
    }
  };

  const canBiometric = biometricEnabled && hasStoredSession && support?.available;

  return (
    <Screen withBottomInset>
      {/* Top bar: back + centered brand wordmark (design's fixed nav) */}
      <View className="flex-row items-center px-5 py-3" style={{ minHeight: 56 }}>
        <View className="w-10">
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.goBack();
              }}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              <Ionicons name="arrow-back" size={22} color={colors.goldDeep} />
            </Pressable>
          ) : null}
        </View>
        <Text className="flex-1 text-center text-2xl font-extrabold tracking-tight text-ink">
          Patriai
        </Text>
        <View className="w-10" />
      </View>

      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
        {/* Welcome section */}
        <View className="mb-8 items-center">
          <Text className="text-3xl font-extrabold tracking-tight text-ink">Welcome Back</Text>
          <Text className="mt-2 text-center text-base leading-6 text-muted">
            Access your family treasury and stay in control.
          </Text>
        </View>

        {canBiometric ? (
          <Pressable
            onPress={() => {
              selection();
              void biometricSignIn();
            }}
            disabled={bioBusy}
            className="mb-5 flex-row items-center rounded-2xl bg-white p-4 active:opacity-90"
            style={shadow.card}
          >
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-xl bg-success-soft">
              <Ionicons name={support?.icon ?? 'finger-print'} size={26} color={colors.brand} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-ink">Sign in with {support?.label}</Text>
              <Text className="mt-0.5 text-[13px] text-muted">
                {bioBusy ? 'Authenticating…' : 'Fastest way back into your account'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.faded} />
          </Pressable>
        ) : null}

        {/* Login card — editorial shadow, rounded-2xl white surface */}
        <View className="rounded-2xl bg-white p-6" style={[shadow.card, { gap: 24 }]}>
          {/* Phone / Email toggle (same identifier field; adjusts keyboard + hint) */}
          <Segment
            options={[
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
            ]}
            value={mode}
            onChange={(k) => setMode(k as 'phone' | 'email')}
          />

          <Field
            label={mode === 'phone' ? 'Phone Number' : 'Email Address'}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder={mode === 'phone' ? 'e.g. 08012345678' : 'you@example.com'}
            autoCapitalize="none"
            keyboardType={mode === 'phone' ? 'phone-pad' : 'email-address'}
          />

          <View>
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secure
            />
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('ForgotPassword');
              }}
              className="mt-3 self-end"
              hitSlop={6}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.goldDeep }}>
                Forgot password?
              </Text>
            </Pressable>
          </View>

          <ErrorText message={error} />

          <View>
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Register');
              }}
              hitSlop={6}
              className="mb-4 self-start"
            >
              <Text className="text-sm font-medium" style={{ color: colors.goldDeep }}>
                Don’t have an account? <Text className="font-bold">Sign Up</Text>
              </Text>
            </Pressable>

            <Button title="Log In" onPress={submit} loading={login.isPending} />
          </View>
        </View>

        {/* Decorative asymmetric ledger bars */}
        <View className="mt-10 flex-row justify-center" style={{ gap: 8, opacity: 0.2 }}>
          <View className="h-1 w-12 rounded-full" style={{ backgroundColor: colors.goldDeep }} />
          <View className="h-1 w-4 rounded-full" style={{ backgroundColor: colors.muted }} />
          <View className="h-1 w-2 rounded-full" style={{ backgroundColor: '#D2C5AB' }} />
        </View>

        <Text className="mt-6 text-center text-[11px] text-faded">
          By continuing, you agree to our <Text className="underline">Terms & Privacy Policy</Text>
        </Text>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
