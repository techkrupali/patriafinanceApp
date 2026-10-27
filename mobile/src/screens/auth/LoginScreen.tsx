import React, { useState } from 'react';
import { View } from 'react-native';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtButton } from '../../components/pt/PtButton';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtText } from '../../components/pt/PtText';
import { usePhoneStart } from '../../api/hooks';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { DEFAULT_COUNTRY, isValidE164, toE164, type Country } from '../../lib/phone';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ACC-01 Log in: logo, "Welcome back", one phone field with the dial code
 * inside. A code to the phone comes next, then the PIN (ACC-02).
 */
export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const copy = useOnboardingCopy();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = usePhoneStart();

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
          navigation.navigate('Code', {
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
