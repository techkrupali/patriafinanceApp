import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { useForgotPassword, useResetPassword } from '../../api/hooks';
import type { AuthScreenProps } from '../../navigation/types';

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const [phase, setPhase] = useState<'request' | 'reset'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | undefined>();

  const request = useForgotPassword();
  const reset = useResetPassword();

  const sendCode = () => {
    setError(null);
    if (!identifier.trim()) {
      setError('Enter your email or phone number.');
      return;
    }
    request.mutate(
      { identifier: identifier.trim() },
      {
        onSuccess: (data) => {
          setPhase('reset');
          setHint(data?.debug_otp);
          setSentTo(data?.sent_to);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const submitReset = () => {
    setError(null);
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    reset.mutate(
      { identifier: identifier.trim(), code, password },
      {
        onSuccess: () => {
          Alert.alert('Password reset', 'Your password has been reset. Please log in.', [
            { text: 'OK', onPress: () => navigation.navigate('Login') },
          ]);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Reset password" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {phase === 'request' ? (
            <>
              <Text className="text-[26px] font-semibold tracking-tight text-ink">Forgot your password?</Text>
              <Text className="mt-2 text-[15px] leading-6 text-muted">
                Enter your email or phone number and we'll send you a reset code.
              </Text>
              <View className="mt-6">
                <Input
                  label="Email or phone"
                  icon="mail-outline"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <ErrorText message={error} className="mt-4" />
                <Button title="Send Code" icon="arrow-forward" onPress={sendCode} loading={request.isPending} className="mt-6" />
              </View>
            </>
          ) : (
            <>
              <Text className="text-[26px] font-semibold tracking-tight text-ink">Enter reset code</Text>
              <Text className="mt-2 text-[15px] leading-6 text-muted">
                We sent a 6-digit code to{' '}
                <Text className="font-semibold text-ink">{sentTo ?? identifier}</Text>.
              </Text>
              {hint ? (
                <View className="mt-3 self-start rounded-full bg-lav-faint px-3 py-1">
                  <Text className="text-xs font-medium text-muted">Dev code: {hint}</Text>
                </View>
              ) : null}
              <View className="mt-6" style={{ gap: 16 }}>
                <Input
                  label="Reset code"
                  icon="keypad-outline"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Input
                  label="New password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                />
                <Input
                  label="Confirm new password"
                  icon="lock-closed-outline"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="Re-enter new password"
                  secureTextEntry
                />
              </View>
              <ErrorText message={error} className="mt-4" />
              <Button title="Reset Password" icon="checkmark" onPress={submitReset} loading={reset.isPending} className="mt-6" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
