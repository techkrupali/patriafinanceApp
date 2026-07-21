import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { selection } from '../../lib/haptics';
import { useRequestOtp, useVerifyOtp } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * Stitch "Patria | OTP Verification" (2.2): centered "Verification" header,
 * tonal gold shield badge, extrabold headline, six tonal digit boxes (12px
 * radius, green tertiary focus ring per the design html), clock + mm:ss resend
 * timer, gold "Verify & Continue" CTA and the "Wrong number? Edit contact" link.
 */

const OTP_LENGTH = 6;

export function OtpScreen({ route, navigation }: AuthScreenProps<'Otp'>) {
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
      {/* Top bar: slate back arrow + centered title (design's TopAppBar) */}
      <View className="flex-row items-center px-5 py-2" style={{ minHeight: 56 }}>
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
              <Ionicons name="arrow-back" size={22} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <Text className="flex-1 text-center text-lg font-bold text-ink">Verification</Text>
        <View className="w-10" />
      </View>

      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 16 }}>
        {/* Brand/context header */}
        <View className="items-center">
          <View
            className="h-20 w-20 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(255,204,0,0.18)' }}
          >
            <MaterialCommunityIcons name="shield-account" size={40} color="#FFCC00" />
          </View>
          <Text className="mt-6 text-center text-3xl font-extrabold tracking-tight text-ink">
            Enter Verification Code
          </Text>
          <Text className="mt-3 text-center text-base leading-6 text-muted">
            We sent a 6-digit code to{'\n'}
            <Text className="font-semibold text-ink">{sentToLabel ?? identifier}</Text>
          </Text>
        </View>

        {/* OTP digit grid — tonal boxes, green tertiary focus ring per design */}
        <Pressable
          className="mt-8 flex-row"
          style={{ gap: 10 }}
          onPress={() => inputRef.current?.focus()}
        >
          {Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const active = i === code.length;
            const filled = Boolean(code[i]);
            return (
              <View
                key={i}
                className="h-14 flex-1 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: active ? colors.white : colors.lavSoft, // surface-container-high
                  borderWidth: 2,
                  borderColor: active ? colors.brand : 'transparent', // tertiary #006D2F ring
                }}
              >
                {filled ? (
                  <Text className="text-2xl font-bold text-ink">{code[i]}</Text>
                ) : (
                  <Text className="text-2xl font-bold" style={{ color: 'rgba(23,28,31,0.65)' }}>
                    •
                  </Text>
                )}
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
          autoComplete="one-time-code"
          className="absolute h-px w-px opacity-0"
        />

        {hint ? (
          <View className="mt-4 self-center rounded-full bg-lav-faint px-3 py-1">
            <Text className="text-xs font-medium text-muted">Dev code: {hint}</Text>
          </View>
        ) : null}

        <ErrorText message={error} className="mt-4" />

        {/* Timer / resend */}
        <View className="mt-6 flex-row items-center justify-center" style={{ gap: 8 }}>
          <Ionicons name="time-outline" size={17} color={colors.faded} />
          {cooldown > 0 ? (
            <Text className="text-[15px] font-medium text-muted">
              Resend code in{' '}
              <Text className="font-semibold text-ink">00:{String(cooldown).padStart(2, '0')}</Text>
            </Text>
          ) : (
            <Pressable onPress={resendCode} disabled={resend.isPending} hitSlop={6}>
              <Text className="text-[15px] font-medium text-muted">
                Didn’t get a code?{' '}
                <Text className="font-bold underline" style={{ color: colors.goldDeep }}>
                  {resend.isPending ? 'Sending…' : 'Resend'}
                </Text>
              </Text>
            </Pressable>
          )}
        </View>

        <Button
          title="Verify & Continue"
          onPress={() => submit()}
          loading={verify.isPending}
          disabled={code.length !== OTP_LENGTH}
          className="mt-8"
        />

        {/* Secondary links */}
        {navigation.canGoBack() ? (
          <View className="mt-8 items-center">
            <Pressable
              onPress={() => {
                selection();
                navigation.goBack();
              }}
              hitSlop={6}
              className="flex-row items-center"
            >
              <Ionicons name="pencil-outline" size={14} color={colors.muted} style={{ marginRight: 6 }} />
              <Text className="text-sm font-medium text-muted">
                Wrong number? <Text className="underline">Edit contact</Text>
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
