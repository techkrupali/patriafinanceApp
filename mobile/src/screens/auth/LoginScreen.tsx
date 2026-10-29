import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../../config';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtButton } from '../../components/pt/PtButton';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtText } from '../../components/pt/PtText';
import { usePhoneCheck } from '../../api/hooks';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { DEFAULT_COUNTRY, isValidE164, toE164, type Country } from '../../lib/phone';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ACC-01 Log in: logo, "Welcome back", one phone field with the dial code
 * inside. On a phone you trusted before it goes straight to the PIN (ACC-02);
 * anywhere else a code to the phone comes first.
 */
export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const copy = useOnboardingCopy();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = usePhoneCheck();

  // The number last signed in on this phone.
  useEffect(() => {
    void SecureStore.getItemAsync(STORAGE_KEYS.lastPhone).then((last) => {
      if (!last || national) return;
      // Stored as E.164 ("+2348031112233"); the country holds its code without the "+".
      const prefix = `+${country.dial}`;
      const local = last.startsWith(prefix) ? last.slice(prefix.length) : '';
      if (local) setNational(local);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const phone = toE164(country.dial, national);
    if (!isValidE164(phone)) {
      setError(copy.phone.invalid);
      return;
    }
    setError(null);
    start.mutate(
      { phone, channel: 'sms' },
      {
        onSuccess: (data) =>
          data.next === 'pin'
            ? navigation.navigate('Unlock', { phoneToken: data.phone_token, account: data.account, phone })
            : navigation.navigate('Code', {
                phone,
                channel: data.channel,
                resendIn: data.resend_in,
                flow: 'login',
                debugOtp: data.debug_otp,
              }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtStepScreen
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      gap={16}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title={copy.continue} onPress={submit} loading={start.isPending} />
          <PtButton title={copy.login.createAccount} variant="ghost" onPress={() => navigation.replace('Phone')} />
        </View>
      }
    >
      <PtLogo height={28} />
      <View style={{ gap: 6, paddingTop: 24 }}>
        <PtText variant="headline" accessibilityRole="header">
          {copy.login.title}
        </PtText>
        <PtText color={pt.inkMuted}>{copy.login.subtitle}</PtText>
      </View>
      <PtPhoneField
        label={copy.phone.label}
        layout="inline"
        country={country}
        onChangeCountry={setCountry}
        value={national}
        onChange={(d) => {
          setNational(d);
          setError(null);
        }}
        error={error}
        autoFocus
      />
    </PtStepScreen>
  );
}
