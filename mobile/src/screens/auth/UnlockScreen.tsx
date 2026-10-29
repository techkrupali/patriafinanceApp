import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtText } from '../../components/pt/PtText';
import { usePinLogin } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { pendingSelfie } from '../../lib/selfie';
import { TwoStepSheet, twoStepAsked } from '../../components/TwoStepSheet';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { notifyError, selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ACC-02 Unlock with PIN: the verified number's owner ("Hi Ngozi") enters
 * their PIN on the raised keypad to finish logging in.
 */
export function UnlockScreen({ route, navigation }: AuthScreenProps<'Unlock'>) {
  const { phoneToken, account, phone } = route.params;
  const copy = useOnboardingCopy();
  const setSession = useAuth((s) => s.setSession);
  const login = usePinLogin();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<ReturnType<typeof twoStepAsked>>(null);
  const [twoStepError, setTwoStepError] = useState<string | null>(null);
  // ACC-06: the selfie taken on the new-phone step goes with the PIN.
  const [selfie] = useState(() => (account.new_device ? pendingSelfie.take() : null));

  const signIn = (value: string, twoFactorCode?: string) =>
    login.mutate(
      { phone_token: phoneToken, pin: value, selfie, two_factor_code: twoFactorCode },
      {
        onSuccess: ({ user, token }) => void setSession(user, token),
        onError: (e) => {
          const data = e instanceof ApiError ? (e.data as { code?: string; until?: string } | undefined) : undefined;
          const two = twoStepAsked(e);
          if (two) {
            setAsked(two);
            setTwoStepError(twoFactorCode ? e.message : null);
            return;
          }
          // A wrong two-step code (the PIN was right): stay on the code with the reason.
          if (twoFactorCode && e instanceof ApiError && e.errors?.two_factor_code) {
            notifyError();
            setTwoStepError(e.message);
            return;
          }
          notifyError();
          setPin('');
          setAsked(null);
          if (e instanceof ApiError && e.errors?.phone_token) {
            navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Login' }] });
            return;
          }
          if (data?.code === 'locked' && data.until) {
            navigation.replace('Locked', { phone: phone ?? '', phoneToken, until: data.until });
            return;
          }
          if (data?.code === 'selfie_required') {
            navigation.replace('NewDevice', { phoneToken, account, phone: phone ?? '' });
            return;
          }
          if (twoFactorCode) setTwoStepError(e.message);
          else setError(e.message);
        },
      },
    );

  const onDigits = (next: string) => {
    if (login.isPending) return;
    setError(null);
    setPin(next);
    if (next.length < account.pin_length) return;
    signIn(next);
  };

  return (
    <PtStepScreen onBack={() => navigation.goBack()} gap={16} scroll={false}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 16 }}>
        {account.avatar_url ? (
          <Image source={{ uri: account.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
        ) : (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: pt.emerald700,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: '#FFFFFF' }}>{account.initials}</Text>
          </View>
        )}
        <PtText variant="title" style={{ fontFamily: ptFont.extrabold }} accessibilityRole="header">
          {copy.unlock.hi(account.first_name)}
        </PtText>
        <PtText color={pt.inkMuted}>{account.new_device ? 'Enter your PIN to finish on this phone' : copy.unlock.enterPin}</PtText>
      </View>

      <View style={{ paddingVertical: 6 }}>
        <PtPinDots length={account.pin_length} filled={pin.length} variant="raised" />
      </View>

      {login.isPending ? (
        <ActivityIndicator color={pt.brand} />
      ) : error ? (
        <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
          {error}
        </PtText>
      ) : null}

      <PtKeypad value={pin} onChange={onDigits} length={account.pin_length} variant="raised" disabled={login.isPending} />

      <TwoStepSheet
        asked={asked}
        busy={login.isPending}
        error={twoStepError}
        onSubmit={(code) => signIn(pin, code)}
        onClose={() => {
          setAsked(null);
          setPin('');
        }}
      />

      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('ForgotPin', { phone: phone ?? '' });
        }}
        accessibilityRole="button"
        style={{ alignSelf: 'center', paddingVertical: 8 }}
      >
        <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>{copy.unlock.forgot}</Text>
      </Pressable>
    </PtStepScreen>
  );
}
