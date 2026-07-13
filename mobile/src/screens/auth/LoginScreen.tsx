import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { Header } from '../../components/Header';
import { colors } from '../../theme';
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
          <Text className="text-3xl font-extrabold tracking-tight text-ink">Welcome back</Text>
          <Text className="mt-2 text-[15px] text-muted">
            Sign in to continue managing your family finances.
          </Text>

          {canBiometric ? (
            <Pressable
              onPress={() => void biometricSignIn()}
              disabled={bioBusy}
              className="mt-7 flex-row items-center rounded-3xl bg-white p-5 active:opacity-90"
              style={{
                shadowColor: colors.navy,
                shadowOpacity: 0.06,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
                elevation: 3,
              }}
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

          <View className="mt-7">
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

          <View className="mt-8 flex-row justify-center">
            <Text className="text-sm text-muted">New to Patriai? </Text>
            <Pressable onPress={() => navigation.navigate('Register')} hitSlop={6}>
              <Text className="text-sm font-semibold text-brand">Create one</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
