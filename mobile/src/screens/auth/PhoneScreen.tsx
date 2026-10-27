import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { LanguageToggle, PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { usePhoneStart } from '../../api/hooks';
import { useLanguage } from '../../store/language';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { DEFAULT_COUNTRY, isValidE164, toE164, type Country } from '../../lib/phone';
import { selection } from '../../lib/haptics';
import type { OtpChannel } from '../../api/types';
import type { AuthScreenProps } from '../../navigation/types';

export const SIGNUP_STEPS = 5;

/** ONB-03 radio card: brand-tinted with a filled dot when chosen. */
function ChannelCard({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (!active) selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={{
        flex: 1,
        height: 52,
        borderRadius: ptRadius.sm,
        backgroundColor: active ? pt.brandSoft : pt.raised,
        borderWidth: active ? 2 : 1.5,
        borderColor: active ? pt.brand : pt.lineStrong,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: active ? pt.brand : pt.lineStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pt.brand }} /> : null}
      </View>
      <Text style={{ fontFamily: active ? ptFont.bold : ptFont.semibold, fontSize: 15, color: active ? pt.brand : pt.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** ONB-03: phone number, language toggle and SMS/WhatsApp choice for the code. */
export function PhoneScreen({ navigation }: AuthScreenProps<'Phone'>) {
  const copy = useOnboardingCopy();
  const lang = useLanguage((s) => s.lang);
  const setLang = useLanguage((s) => s.setLang);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [channel, setChannel] = useState<OtpChannel>('sms');
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
      { phone, channel },
      {
        onSuccess: (data) =>
          navigation.navigate('Code', {
            phone,
            channel: data.channel,
            resendIn: data.resend_in,
            flow: 'signup',
            debugOtp: data.debug_otp,
          }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      headerRight={<LanguageToggle value={lang} onChange={(l) => void setLang(l)} />}
      step={copy.step(1, SIGNUP_STEPS)}
      title={copy.phone.title}
      subtitle={copy.phone.subtitle}
      footer={
        <>
          <PtText variant="caption" color={pt.inkMuted} style={{ fontFamily: ptFont.regular, lineHeight: 17, textAlign: 'center' }}>
            {copy.phone.termsLead}
            <Text style={{ color: pt.brand, textDecorationLine: 'underline' }}>{copy.phone.terms}</Text>
            {copy.phone.and}
            <Text style={{ color: pt.brand, textDecorationLine: 'underline' }}>{copy.phone.privacy}</Text>.
          </PtText>
          <PtButton title={copy.continue} onPress={submit} loading={start.isPending} />
        </>
      }
    >
      <PtPhoneField
        label={copy.phone.label}
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

      <View style={{ gap: 16 }}>
        <PtText variant="label">{copy.phone.sendBy}</PtText>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
          <ChannelCard label={copy.phone.sms} active={channel === 'sms'} onPress={() => setChannel('sms')} />
          <ChannelCard label={copy.phone.whatsapp} active={channel === 'whatsapp'} onPress={() => setChannel('whatsapp')} />
        </View>
      </View>
    </PtStepScreen>
  );
}
