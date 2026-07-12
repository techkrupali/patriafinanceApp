import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { useRequestOtp, useVerifyOtp } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import type { AuthScreenProps } from '../../navigation/types';

const OTP_LENGTH = 6;

export function OtpScreen({ route }: AuthScreenProps<'Otp'>) {
  const { identifier, purpose, sentTo, debugOtp } = route.params;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>(debugOtp);
  const [sentToLabel, setSentToLabel] = useState<string | undefined>(sentTo);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<TextInput>(null);

  const verify = useVerifyOtp();
  const resend = useRequestOtp();
  const setSession = useAuth((s) => s.setSession);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = (value?: string) => {
    const otp = value ?? code;
    if (otp.length !== OTP_LENGTH) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError(null);
    verify.mutate(
      { identifier, purpose, code: otp },
      {
        onSuccess: (data) => void setSession(data.user, data.token),
        onError: (e) => {
          setError(e.message);
          setCode('');
        },
      },
    );
  };

  const handleChange = (t: string) => {
    const clean = t.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setCode(clean);
    setError(null);
    if (clean.length === OTP_LENGTH) submit(clean);
  };

  const resendCode = () => {
    setError(null);
    resend.mutate(
      { identifier, purpose },
      {
        onSuccess: (data) => {
          setCooldown(30);
          if (data?.debug_otp) setHint(data.debug_otp);
          if (data?.sent_to) setSentToLabel(data.sent_to);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Verification" />
      <View className="flex-1 px-6 pt-4">
        <Text className="text-2xl font-bold text-ink">Enter the code</Text>
        <Text className="mt-2 text-sm leading-5 text-muted">
          We sent a 6-digit code to{' '}
          <Text className="font-semibold text-ink">{sentToLabel ?? identifier}</Text>.
        </Text>

        <Pressable className="mt-8 flex-row justify-between" onPress={() => inputRef.current?.focus()}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const active = i === code.length;
            return (
              <View
                key={i}
                className={`h-14 w-12 items-center justify-center rounded-2xl bg-white ${
                  active ? 'border-2 border-navy' : 'border border-[#e2e8f0]'
                }`}
              >
                <Text className="text-2xl font-bold text-ink">{code[i] ?? ''}</Text>
              </View>
            );
          })}
        </Pressable>

        {/* Hidden input driving the boxes */}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          autoFocus
          className="absolute h-px w-px opacity-0"
        />

        {hint ? (
          <Text className="mt-4 text-center text-xs text-faded">Dev code: {hint}</Text>
        ) : null}

        <ErrorText message={error} className="mt-4 text-center" />

        <Button
          title="Verify"
          onPress={() => submit()}
          loading={verify.isPending}
          disabled={code.length !== OTP_LENGTH}
          className="mt-8"
        />

        <View className="mt-6 flex-row justify-center">
          <Text className="text-sm text-muted">Didn't get a code? </Text>
          {cooldown > 0 ? (
            <Text className="text-sm text-faded">Resend in {cooldown}s</Text>
          ) : (
            <Pressable onPress={resendCode} disabled={resend.isPending}>
              <Text className="text-sm font-semibold text-brand">
                {resend.isPending ? 'Sending…' : 'Resend'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Screen>
  );
}
