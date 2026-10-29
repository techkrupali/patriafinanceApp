import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtText } from '../../components/pt/PtText';
import { TwoStepSheet, twoStepAsked } from '../../components/TwoStepSheet';
import { useChangePinSecure } from '../../api/account';
import { useTxnPinLength } from '../../store/auth';
import { saveTxnPin } from '../../lib/biometrics';
import { useAuth } from '../../store/auth';
import { isWeakPin } from '../../lib/onboardingCopy';
import { notifyError, notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-06 Change PIN: the PIN you use now, then "Enter a new PIN — 6 digits.
 * Not your birthday or 123456." twice. With two-step on, its code too.
 */
export function ChangePinScreen({ navigation }: RootScreenProps<'ChangePin'>) {
  const currentLength = useTxnPinLength();
  const biometric = useAuth((s) => s.biometricEnabled);
  const user = useAuth((s) => s.user);
  const change = useChangePinSecure();
  const [phase, setPhase] = useState<'current' | 'new' | 'confirm'>('current');
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<ReturnType<typeof twoStepAsked>>(null);
  const [twoErr, setTwoErr] = useState<string | null>(null);

  const restart = (message: string) => {
    notifyError();
    setError(message);
    setPin('');
    setConfirm('');
    setPhase('new');
  };

  const submit = (code?: string) =>
    change.mutate(
      { current_pin: current, new_pin: pin, two_factor_code: code },
      {
        onSuccess: async () => {
          // Face ID authorises payments with the PIN kept in the keychain: keep it current.
          if (biometric) await saveTxnPin(pin);
          notifySuccess();
          setAsked(null);
          showAlert('PIN changed', 'Use your new PIN from now on.');
          navigation.goBack();
        },
        onError: (e) => {
          const two = twoStepAsked(e);
          if (two) {
            setAsked(two);
            setTwoErr(code ? e.message : null);
            return;
          }
          if (code) {
            setTwoErr(e.message);
            return;
          }
          if (/current|wrong pin|locked/i.test(e.message)) {
            notifyError();
            setError(e.message);
            setCurrent('');
            setPin('');
            setConfirm('');
            setPhase('current');
            return;
          }
          restart(e.message);
        },
      },
    );

  const length = phase === 'current' ? currentLength : 6;
  const value = phase === 'current' ? current : phase === 'new' ? pin : confirm;

  const onDigits = (next: string) => {
    if (change.isPending) return;
    setError(null);
    if (phase === 'current') {
      setCurrent(next);
      if (next.length === currentLength) setPhase('new');
      return;
    }
    if (phase === 'new') {
      setPin(next);
      if (next.length < 6) return;
      if (isWeakPin(next, user?.date_of_birth, user?.phone)) return restart('Too easy to guess. Not your birthday or 123456.');
      if (next === current) return restart('Choose a PIN you haven\'t used now.');
      setPhase('confirm');
      return;
    }
    setConfirm(next);
    if (next.length < 6) return;
    if (next !== pin) return restart('Those PINs don\'t match. Start again.');
    submit();
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      title={phase === 'current' ? 'Enter your PIN' : phase === 'new' ? 'Enter a new PIN' : 'Enter it again'}
      subtitle={phase === 'current' ? 'The one you use now' : '6 digits. Not your birthday or 123456.'}
      gap={40}
      scroll={false}
      footer={
        <>
          {change.isPending ? <ActivityIndicator color={pt.brand} /> : error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtKeypad value={value} onChange={onDigits} length={length} disabled={change.isPending} />
        </>
      }
    >
      <PtPinDots length={length} filled={value.length} />
      <TwoStepSheet asked={asked} busy={change.isPending} error={twoErr} onSubmit={(code) => submit(code)} onClose={() => restart('Change cancelled.')} />
    </PtStepScreen>
  );
}
