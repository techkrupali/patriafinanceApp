import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { Header } from '../../components/Header';
import { useLogin } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import type { AuthScreenProps } from '../../navigation/types';
import type { User } from '../../api/types';

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  const login = useLogin();
  const setSession = useAuth((s) => s.setSession);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const hasStoredSession = useAuth((s) => s.hasStoredSession);
  const unlockStoredSession = useAuth((s) => s.unlockStoredSession);

  const offerBiometric = async (user: User, token: string) => {
    try {
      const supported =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      if (!supported || biometricEnabled) {
        await setSession(user, token);
        return;
      }
      Alert.alert(
        'Biometric sign-in',
        'Use fingerprint / face unlock to sign in faster next time?',
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => void setSession(user, token),
          },
          {
            text: 'Enable',
            onPress: async () => {
              const res = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Confirm to enable biometric sign-in',
              });
              if (res.success) await setBiometricEnabled(true);
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
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to Patriai',
      });
      if (res.success) {
        const ok = await unlockStoredSession();
        if (!ok) setError('No saved session found. Please log in with your password.');
      }
    } catch {
      setError('Biometric authentication failed. Use your password instead.');
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <Screen withBottomInset>
      <Header title="" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-bold text-ink">Welcome back</Text>
          <Text className="mt-2 text-sm text-muted">
            Sign in to continue managing your family finances.
          </Text>

          <Card className="mt-6 p-5">
            <Input
              label="Email or phone"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              className="mt-4"
            />

            <Pressable onPress={() => navigation.navigate('ForgotPassword')} className="mt-3 self-end">
              <Text className="text-sm font-semibold text-brand">Forgot password?</Text>
            </Pressable>

            <ErrorText message={error} className="mt-3" />

            <Button title="Log In" onPress={submit} loading={login.isPending} className="mt-5" />

            {biometricEnabled && hasStoredSession ? (
              <Button
                title="Biometric Sign-in"
                variant="secondary"
                onPress={() => void biometricSignIn()}
                loading={bioBusy}
                className="mt-3"
              />
            ) : null}
          </Card>

          <View className="mt-8 flex-row justify-center">
            <Text className="text-sm text-muted">New to Patriai? </Text>
            <Pressable onPress={() => navigation.navigate('Register')}>
              <Text className="text-sm font-semibold text-brand">Create one</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
