import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { PhoneInput } from '../../components/PhoneInput';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { DEFAULT_COUNTRY, toE164, isValidE164, type Country } from '../../lib/phone';
import { selection } from '../../lib/haptics';
import { useForgotPassword, useResetPassword } from '../../api/hooks';
import type { AuthScreenProps } from '../../navigation/types';

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const [phase, setPhase] = useState<'request' | 'reset'>('request');
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneNational, setPhoneNational] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | undefined>();

  const request = useForgotPassword();
  const reset = useResetPassword();

  const resolvedId =
    mode === 'email' ? email.trim().toLowerCase() : toE164(phoneCountry.dial, phoneNational);

  const sendCode = () => {
    setError(null);
    if (mode === 'email' ? !email.trim() : !phoneNational.trim()) {
      setError('Enter your email or phone number.');
      return;
    }
    if (mode === 'phone' && !isValidE164(resolvedId)) {
      setError('Enter a valid phone number for the selected country.');
      return;
    }
    request.mutate(
      { identifier: resolvedId },
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
      { identifier: resolvedId, code, password },
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
      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
          {phase === 'request' ? (
            <>
              <Text className="text-3xl font-extrabold tracking-tight text-ink">Forgot your password?</Text>
              <Text className="mt-2 text-[15px] leading-6 text-muted">
                Enter your email or phone number and we'll send you a reset code.
              </Text>
              <View className="mt-6">
                <View className="mb-5 flex-row rounded bg-page-top p-1">
                  {(['phone', 'email'] as const).map((k) => {
                    const active = k === mode;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => {
                          if (!active) {
                            selection();
                            setMode(k);
                            setError(null);
                          }
                        }}
                        className="flex-1 items-center justify-center rounded py-2"
                        style={active ? { backgroundColor: colors.white } : undefined}
                      >
                        <Text
                          className={`text-sm ${active ? 'font-bold' : 'font-medium'}`}
                          style={{ color: active ? colors.goldDeep : colors.muted }}
                        >
                          {k === 'phone' ? 'Phone' : 'Email'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {mode === 'phone' ? (
                  <PhoneInput
                    label="Phone Number"
                    country={phoneCountry}
                    onChangeCountry={setPhoneCountry}
                    value={phoneNational}
                    onChangeText={setPhoneNational}
                  />
                ) : (
                  <Input
                    label="Email Address"
                    icon="mail-outline"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                )}
                <ErrorText message={error} className="mt-4" />
                <Button title="Send Code" icon="arrow-forward" onPress={sendCode} loading={request.isPending} className="mt-6" />
              </View>
            </>
          ) : (
            <>
              <Text className="text-3xl font-extrabold tracking-tight text-ink">Enter reset code</Text>
              <Text className="mt-2 text-[15px] leading-6 text-muted">
                We sent a 6-digit code to{' '}
                <Text className="font-semibold text-ink">{sentTo ?? resolvedId}</Text>.
              </Text>
              {hint ? (
                <View className="mt-3 self-start rounded bg-lav-faint px-3 py-1">
                  <Text className="text-xs font-medium text-muted">Dev code: {hint}</Text>
                </View>
              ) : null}
              <View className="mt-6" style={{ gap: 16 }}>
                <Input
                  label="Reset Code"
                  icon="keypad-outline"
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Input
                  label="New Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                />
                <Input
                  label="Confirm New Password"
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
      </KeyboardAwareScrollView>
    </Screen>
  );
}
