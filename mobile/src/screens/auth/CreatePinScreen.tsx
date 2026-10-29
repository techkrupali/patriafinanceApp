import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { isWeakPin, useOnboardingCopy } from '../../lib/onboardingCopy';
import {
  getBiometricSupport,
  runBiometricPrompt,
  type BiometricSupport,
} from '../../lib/biometrics';
import { notifyError } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';
import { SIGNUP_STEPS } from './PhoneScreen';

const PIN_LENGTH = 6;

/**
 * ONB-06 / ONB-07: create the 6-digit PIN and enter it again; ONB-08 offers
 * Face ID / fingerprint when the phone has it. Then the terms (ONB-10) and a
 * referral code (ONB-11), where the account is created.
 */
export function CreatePinScreen({ route, navigation }: AuthScreenProps<'CreatePin'>) {
  const { phoneToken, details } = route.params;
  const copy = useOnboardingCopy();

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

  // ONB-07 → ONB-08 (Face ID, when the phone has it) → ONB-10 terms → ONB-11 referral,
  // where the account is created.
  const goToTerms = (finalPin: string, biometric: boolean) =>
    navigation.navigate('Terms', { phoneToken, details, pin: finalPin, biometric });

  const onDigits = (next: string) => {
    setError(null);
    if (phase === 'create') {
      setPin(next);
      if (next.length < PIN_LENGTH) return;
      if (isWeakPin(next, details.date_of_birth)) {
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
      if (support?.available) setPhase('biometric');
      else goToTerms(next, false);
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
      goToTerms(pin, true);
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
              onPress={() => goToTerms(pin, false)}
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
      step={copy.step(confirming ? 5 : 4, SIGNUP_STEPS)}
      title={confirming ? copy.pin.confirmTitle : copy.pin.title}
      subtitle={confirming ? copy.pin.confirmSubtitle : copy.pin.subtitle}
      gap={44}
      scroll={false}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtKeypad value={value} onChange={onDigits} length={PIN_LENGTH} />
        </>
      }
    >
      <PtPinDots length={PIN_LENGTH} filled={value.length} />
    </PtStepScreen>
  );
}
