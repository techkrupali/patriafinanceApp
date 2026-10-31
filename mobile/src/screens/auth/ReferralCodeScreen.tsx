import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { usePhoneRegister, useReferralLookup } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useLanguage } from '../../store/language';
import { useDeepLink } from '../../store/deepLink';
import { saveTxnPin } from '../../lib/biometrics';
import { notifyError } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ONB-11 "Did someone invite you?" (optional): their code, and "Code from
 * Chioma Nwosu". Continue or Skip creates the account, then Face ID is turned
 * on if chosen on ONB-08.
 */
export function ReferralCodeScreen({ route, navigation }: AuthScreenProps<'ReferralCode'>) {
  const { phoneToken, details, pin, biometric, consents } = route.params;
  const lang = useLanguage((s) => s.lang);
  const beginOnboarding = useAuth((s) => s.beginOnboarding);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);
  const register = usePhoneRegister();
  const lookup = useReferralLookup();
  const [code, setCode] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SYS-08: a referral link fills in its code.
  useEffect(() => {
    const linked = useDeepLink.getState().takeReferral();
    if (linked) {
      setCode(linked);
      check(linked);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = (value: string) => {
    setFrom(null);
    if (value.trim().length < 4) return;
    lookup.mutate(value.trim(), { onSuccess: (d) => setFrom(d.from), onError: () => setFrom(null) });
  };

  const create = (referral: string | null) => {
    setError(null);
    register.mutate(
      { phone_token: phoneToken, ...details, pin, language: lang, referral_code: referral, consents },
      {
        onSuccess: async ({ user, token }) => {
          await beginOnboarding(user, token);
          if (biometric) {
            // Face ID authorises payments by unlocking the PIN kept in the keychain.
            await saveTxnPin(pin);
            await setBiometricEnabled(true);
          }
          navigation.reset({ index: 0, routes: [{ name: 'Purpose' }] });
        },
        onError: (e) => {
          notifyError();
          const field = (key: string) => (e instanceof ApiError ? e.errors?.[key]?.[0] : undefined);
          if (field('phone_token')) {
            navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Phone' }] });
            return;
          }
          const name = field('first_name') ?? field('last_name');
          const email = field('email');
          const dob = field('date_of_birth');
          if (name || email || dob) {
            navigation.navigate('Details', { phoneToken, serverErrors: { name, email, dob } });
            return;
          }
          setError(e.message);
        },
      },
    );
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      step="GOT A CODE? · STEP 7 OF 7 · OPTIONAL"
      title="Did someone invite you?"
      subtitle="Enter their code and you both get ₦500 when you create a shared wallet."
      gap={16}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Continue" onPress={() => create(code.trim() || null)} loading={register.isPending} />
          <PtButton title="Skip" variant="ghost" onPress={() => create(null)} disabled={register.isPending} />
        </View>
      }
    >
      <PtField
        label="Referral code"
        value={code}
        onChangeText={(t) => {
          setCode(t.toUpperCase());
          check(t);
        }}
        autoCapitalize="characters"
        placeholder="CHIOMA500"
        maxLength={40}
      />
      {from ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pt.brandSoft, borderRadius: ptRadius.sm, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Feather name="check" size={16} color={pt.brand} />
          <PtText style={{ fontSize: 14 }}>Code from {from}</PtText>
        </View>
      ) : null}
      {error ? <PtText variant="caption" color={pt.danger}>{error}</PtText> : null}
    </PtStepScreen>
  );
}
