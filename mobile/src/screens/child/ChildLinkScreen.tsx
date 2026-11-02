import React, { useState } from 'react';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtNote } from '../../components/pt/PtForm';
import { PtText } from '../../components/pt/PtText';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { useLinkChild } from '../../api/child';
import { useAuth } from '../../store/auth';
import { getDeviceMeta } from '../../lib/device';
import { notifySuccess } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

const PIN = 4;
const WEAK = /^(\d)\1{3}$|^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)$/;

/**
 * CHW-06 on the child's phone: "tap I have a code" — the code a parent sees
 * (KMS-4821), then the child's own 4-digit PIN. A family wallet invite goes to
 * the number it was sent to instead.
 */
export function ChildLinkScreen({ navigation }: AuthScreenProps<'ChildLink'>) {
  const link = useLinkChild();
  const setSession = useAuth((s) => s.setSession);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'code' | 'pin' | 'confirm'>('code');
  const [pin, setPin] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const looksLikeChildCode = /^[A-Z]{3}-?\d{4}$/i.test(code.trim());

  const finish = async (confirmed: string) => {
    setError(null);
    const device = await getDeviceMeta();
    link.mutate(
      { code: code.trim().toUpperCase().replace(/^([A-Z]{3})(\d{4})$/, '$1-$2'), pin: confirmed, device_name: device.device_name },
      {
        onSuccess: (d) => {
          notifySuccess();
          void setSession(d.user, d.token);
        },
        onError: (e) => {
          setValue('');
          setPin('');
          setStep('code');
          setError(e.message);
        },
      },
    );
  };

  const onDigits = (next: string) => {
    setValue(next);
    if (next.length < PIN) return;
    if (step === 'pin') {
      if (WEAK.test(next)) {
        setError('Pick a harder PIN, not 1111 or 1234.');
        setValue('');
        return;
      }
      setError(null);
      setPin(next);
      setValue('');
      setStep('confirm');
      return;
    }
    if (next !== pin) {
      setError("They don't match. Try again.");
      setValue('');
      setPin('');
      setStep('pin');
      return;
    }
    void finish(next);
  };

  if (step !== 'code') {
    return (
      <PtStepScreen
        onBack={() => {
          setStep('code');
          setValue('');
        }}
        title={step === 'pin' ? 'Make your PIN' : 'Type it again'}
        subtitle={step === 'pin' ? '4 numbers only you know. You use it to ask for money and save.' : 'To be sure.'}
        gap={44}
        scroll={false}
        footer={
          <>
            {error ? (
              <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
                {error}
              </PtText>
            ) : null}
            <PtKeypad value={value} onChange={onDigits} length={PIN} disabled={link.isPending} />
          </>
        }
      >
        <PtPinDots length={PIN} filled={value.length} />
      </PtStepScreen>
    );
  }

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      title="Enter your code"
      subtitle="A parent sees it on their phone, like KMS-4821."
      gap={18}
      footer={<PtButton title="Continue" disabled={!looksLikeChildCode} loading={link.isPending} onPress={() => setStep('pin')} />}
    >
      <PtField label="Code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="KMS-4821" maxLength={8} />
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
      <PtNote tone="info">Invited to a family wallet? Sign up or log in with the phone number the invite was sent to. It opens once you're in.</PtNote>
      <PtButton
        title="I have a family wallet invite"
        variant="ghost"
        onPress={() => {
          useAuth.getState().setPostAuthRoute('Invitations');
          navigation.navigate('Phone');
        }}
      />
    </PtStepScreen>
  );
}
