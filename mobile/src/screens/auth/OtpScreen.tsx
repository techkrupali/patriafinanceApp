import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
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
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-3xl bg-lav-soft">
            <Ionicons name="mail-open-outline" size={30} color={colors.navy} />
          </View>
          <Text className="mt-5 text-3xl font-extrabold tracking-tight text-ink">Enter the code</Text>
          <Text className="mt-2 text-center text-[15px] leading-6 text-muted">
            We sent a 6-digit code to{'\n'}
            <Text className="font-semibold text-ink">{sentToLabel ?? identifier}</Text>
          </Text>
        </View>

        <Pressable className="mt-9 flex-row justify-between" onPress={() => inputRef.current?.focus()}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const active = i === code.length;
            const filled = Boolean(code[i]);
            return (
              <View
                key={i}
                className={`h-16 w-[46px] items-center justify-center rounded-2xl ${
                  active ? 'border-2 border-brand bg-white' : filled ? 'border-2 border-navy bg-white' : 'bg-lav-faint'
                }`}
              >
                <Text className="text-2xl font-extrabold text-ink">{code[i] ?? ''}</Text>
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
          <View className="mt-4 self-center rounded-full bg-lav-faint px-3 py-1">
            <Text className="text-xs font-medium text-muted">Dev code: {hint}</Text>
          </View>
        ) : null}

        <ErrorText message={error} className="mt-4" />

        <Button
          title="Verify"
          icon="checkmark"
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
            <Pressable onPress={resendCode} disabled={resend.isPending} hitSlop={6}>
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
