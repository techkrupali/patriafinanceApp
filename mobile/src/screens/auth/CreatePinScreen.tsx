import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { usePhoneRegister } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useLanguage } from '../../store/language';
import { isWeakPin, useOnboardingCopy } from '../../lib/onboardingCopy';
import {
  getBiometricSupport,
  runBiometricPrompt,
  saveTxnPin,
  type BiometricSupport,
} from '../../lib/biometrics';
import { notifyError } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';
import { SIGNUP_STEPS } from './PhoneScreen';

const PIN_LENGTH = 6;

/**
 * ONB-06 / ONB-07: create the 6-digit PIN, enter it again, and the account is
 * created. Then ONB-08 offers Face ID / fingerprint when the phone has it.
 */
export function CreatePinScreen({ route, navigation }: AuthScreenProps<'CreatePin'>) {
  const { phoneToken, details } = route.params;
  const copy = useOnboardingCopy();
  const lang = useLanguage((s) => s.lang);
  const beginOnboarding = useAuth((s) => s.beginOnboarding);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);
  const register = usePhoneRegister();

  const [phase, setPhase] = useState<'create' | 'confirm' | 'biometric'>('create');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const startOver = (message: string) => {
    notifyError();
    setError(message);
    setPin('');
    setConfirm('');
    setPhase('create');
  };

  const createAccount = (finalPin: string) => {
    register.mutate(
      { phone_token: phoneToken, ...details, pin: finalPin, language: lang },
      {
        onSuccess: async ({ user, token }) => {
          await beginOnboarding(user, token);
          if (support?.available) setPhase('biometric');
          else navigation.reset({ index: 0, routes: [{ name: 'Purpose' }] });
        },
        onError: (e) => {
          const field = (key: string) => (e instanceof ApiError ? e.errors?.[key]?.[0] : undefined);
          if (field('phone_token')) {
            // The phone check expired: verify the number again.
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
          startOver(e.message);
        },
      },
    );
  };

  const onDigits = (next: string) => {
    if (register.isPending) return;
    setError(null);
    if (phase === 'create') {
      setPin(next);
      if (next.length < PIN_LENGTH) return;
      if (isWeakPin(next)) {
        startOver(copy.pin.weak);
        return;
      }
      setPhase('confirm');
    } else {
      setConfirm(next);
      if (next.length < PIN_LENGTH) return;
      if (next !== pin) {
        startOver(copy.pin.mismatch);
        return;
      }
      createAccount(next);
    }
  };

  const turnOnBiometrics = async () => {
    setError(null);
    setBioBusy(true);
    try {
      const ok = await runBiometricPrompt(copy.biometric.turnOn(support?.label ?? ''));
      if (!ok) {
        setError(copy.biometric.failed);
        return;
      }
      // Biometrics authorise payments by unlocking the PIN kept in the keychain.
      await saveTxnPin(pin);
      await setBiometricEnabled(true);
      navigation.reset({ index: 0, routes: [{ name: 'Purpose' }] });
    } finally {
      setBioBusy(false);
    }
  };

  if (phase === 'biometric') {
    const label = support?.label ?? 'Face ID';
    return (
      <PtStepScreen
        footer={
          <View style={{ gap: 4 }}>
            <PtButton title={copy.biometric.turnOn(label)} onPress={() => void turnOnBiometrics()} loading={bioBusy} />
            <PtButton
              title={copy.biometric.notNow}
              variant="ghost"
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Purpose' }] })}
            />
          </View>
        }
      >
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 80 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: pt.brandSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={support?.icon ?? 'scan-outline'} size={40} color={pt.brand} />
          </View>
          <PtText variant="headline" style={{ fontSize: 26, lineHeight: 32, textAlign: 'center' }} accessibilityRole="header">
            {copy.biometric.title(label)}
          </PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 310 }}>
            {copy.biometric.body}
          </PtText>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
        </View>
      </PtStepScreen>
    );
  }

  const confirming = phase === 'confirm';
  const value = confirming ? confirm : pin;

  return (
    <PtStepScreen
      onBack={() => {
        if (confirming) {
          setConfirm('');
          setPin('');
          setPhase('create');
        } else {
          navigation.goBack();
        }
      }}
      step={copy.step(4, SIGNUP_STEPS)}
      title={confirming ? copy.pin.confirmTitle : copy.pin.title}
      subtitle={confirming ? copy.pin.confirmSubtitle : copy.pin.subtitle}
      gap={44}
      scroll={false}
      footer={
        <>
          {register.isPending ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={pt.brand} />
              <PtText variant="label" color={pt.inkMuted}>
                {copy.pin.creating}
              </PtText>
            </View>
          ) : error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtKeypad value={value} onChange={onDigits} length={PIN_LENGTH} disabled={register.isPending} />
        </>
      }
    >
      <PtPinDots length={PIN_LENGTH} filled={value.length} />
    </PtStepScreen>
  );
}
