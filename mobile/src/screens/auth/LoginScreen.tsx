import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { Header } from '../../components/Header';
import { colors, gradients, shadow } from '../../theme';
import { useLogin } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import {
  getBiometricSupport,
  runBiometricPrompt,
  type BiometricSupport,
} from '../../lib/biometrics';
import type { AuthScreenProps } from '../../navigation/types';
import type { User } from '../../api/types';

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
      <Header />
      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              { height: 60, width: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
              shadow.card,
            ]}
          >
            <Ionicons name="shield-checkmark" size={28} color={colors.brandGlow} />
          </LinearGradient>

          <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-brand">Patriai</Text>
          <Text className="mt-1.5 text-4xl font-extrabold tracking-tight text-ink">Welcome back</Text>
          <Text className="mt-2.5 text-[15px] leading-6 text-muted">
            Sign in to continue managing your family finances.
          </Text>

          {canBiometric ? (
            <Pressable
              onPress={() => void biometricSignIn()}
              disabled={bioBusy}
              className="mt-8 flex-row items-center rounded-3xl bg-white p-5 active:opacity-90"
              style={shadow.card}
            >
              <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl bg-success-soft">
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

          <View className="mt-8">
            <Input
              label="Email or phone"
              icon="mail-outline"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              containerClassName="mt-4"
            />

            <Pressable onPress={() => navigation.navigate('ForgotPassword')} className="mt-3 self-end" hitSlop={6}>
              <Text className="text-sm font-semibold text-brand">Forgot password?</Text>
            </Pressable>

            <ErrorText message={error} className="mt-4" />

            <Button title="Log In" icon="arrow-forward" onPress={submit} loading={login.isPending} className="mt-6" />
          </View>

          <View className="mt-10 h-px w-full bg-border" />
          <View className="mt-6 flex-row justify-center">
            <Text className="text-sm text-muted">New to Patriai? </Text>
            <Pressable onPress={() => navigation.navigate('Register')} hitSlop={6}>
              <Text className="text-sm font-semibold text-brand">Create one</Text>
            </Pressable>
          </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
