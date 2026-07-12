import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
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
              <Text className="text-2xl font-bold text-ink">Forgot your password?</Text>
              <Text className="mt-2 text-sm text-muted">
                Enter your email or phone number and we'll send you a reset code.
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
                <ErrorText message={error} className="mt-3" />
                <Button title="Send Code" onPress={sendCode} loading={request.isPending} className="mt-5" />
              </Card>
            </>
          ) : (
            <>
              <Text className="text-2xl font-bold text-ink">Enter reset code</Text>
              <Text className="mt-2 text-sm text-muted">
                We sent a 6-digit code to{' '}
                <Text className="font-semibold text-ink">{sentTo ?? identifier}</Text>.
              </Text>
              {hint ? <Text className="mt-2 text-xs text-faded">Dev code: {hint}</Text> : null}
              <Card className="mt-6 p-5">
                <Input
                  label="Reset code"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Input
                  label="New password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  className="mt-4"
                />
                <Input
                  label="Confirm new password"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="••••••••"
                  secureTextEntry
                  className="mt-4"
                />
                <ErrorText message={error} className="mt-3" />
                <Button title="Reset Password" onPress={submitReset} loading={reset.isPending} className="mt-5" />
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
