import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtCodeInput } from '../../components/pt/PtCodeInput';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { usePinForgot, usePinReset } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { isWeakPin, useOnboardingCopy } from '../../lib/onboardingCopy';
import { notifyError } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

const CODE_LENGTH = 6;
const PIN_LENGTH = 6;

/**
 * Forgot PIN. The phone is already verified, so the second check is a code to
 * the email on file; then a new 6-digit PIN (entered twice) and the person is in.
 */
export function ForgotPinScreen({ route, navigation }: AuthScreenProps<'ForgotPin'>) {
  const { phoneToken } = route.params;
  const copy = useOnboardingCopy();
  const setSession = useAuth((s) => s.setSession);
  const forgot = usePinForgot();
  const reset = usePinReset();
  const codeRef = useRef<TextInput>(null);

  const [phase, setPhase] = useState<'code' | 'pin' | 'confirm'>('code');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const expired = (e: Error) => e instanceof ApiError && Boolean(e.errors?.phone_token);
  const backToLogin = () => navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Login' }] });

  const sendCode = () =>
    forgot.mutate(
      { phone_token: phoneToken },
      {
        onError: (e) => (expired(e) ? backToLogin() : setError(e.message)),
      },
    );

  useEffect(() => {
    sendCode();
    // Send once on arrival; "Send it again" re-sends.
  }, []);

  const onPin = (next: string) => {
    if (reset.isPending) return;
    setError(null);
    if (phase === 'pin') {
      setPin(next);
      if (next.length < PIN_LENGTH) return;
      if (isWeakPin(next)) {
        notifyError();
        setError(copy.pin.weak);
        setPin('');
        return;
      }
      setPhase('confirm');
      return;
    }
    setConfirm(next);
    if (next.length < PIN_LENGTH) return;
    if (next !== pin) {
      notifyError();
      setError(copy.pin.mismatch);
      setPin('');
      setConfirm('');
      setPhase('pin');
      return;
    }
    reset.mutate(
      { phone_token: phoneToken, code, pin: next },
      {
        onSuccess: ({ user, token }) => void setSession(user, token),
        onError: (e) => {
          notifyError();
          if (expired(e)) return backToLogin();
          // A wrong or expired email code: go back and enter it again.
          if (e instanceof ApiError && e.errors?.code) {
            setCode('');
            setPhase('code');
          } else {
            setPhase('pin');
          }
          setPin('');
          setConfirm('');
          setError(e.message);
        },
      },
    );
  };

  if (phase === 'code') {
    return (
      <PtStepScreen
        onBack={() => navigation.goBack()}
        step={`${copy.forgot.title.toUpperCase()} · ${copy.step(1, 2)}`}
        title={copy.forgot.emailTitle}
        subtitle={
          forgot.data ? (
            <PtText color={pt.inkMuted}>
              {copy.forgot.emailLead}
              <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{forgot.data.sent_to}</Text>.
            </PtText>
          ) : (
            <ActivityIndicator color={pt.brand} style={{ alignSelf: 'flex-start' }} />
          )
        }
        gap={28}
        footer={
          <PtButton
            title={copy.continue}
            disabled={code.length !== CODE_LENGTH}
            onPress={() => {
              setError(null);
              setPhase('pin');
            }}
          />
        }
      >
        <View style={{ gap: 12 }}>
          <PtCodeInput
            ref={codeRef}
            value={code}
            error={Boolean(error)}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
          />
          {error ? (
            <PtText variant="caption" color={pt.danger}>
              {error}
            </PtText>
          ) : null}
          {forgot.data?.debug_otp ? (
            <View style={{ alignSelf: 'flex-start', backgroundColor: pt.sunken, borderRadius: ptRadius.xs, paddingHorizontal: 10, paddingVertical: 4 }}>
              <PtText variant="caption" color={pt.inkMuted}>
                {copy.code.devCode}: {forgot.data.debug_otp}
              </PtText>
            </View>
          ) : null}
        </View>
        <PtButton
          title={copy.code.resend}
          variant="ghost"
          size="sm"
          onPress={sendCode}
          loading={forgot.isPending}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
      </PtStepScreen>
    );
  }

  const confirming = phase === 'confirm';
  return (
    <PtStepScreen
      onBack={() => {
        setPin('');
        setConfirm('');
        setPhase(confirming ? 'pin' : 'code');
      }}
      step={`${copy.forgot.title.toUpperCase()} · ${copy.step(2, 2)}`}
      title={confirming ? copy.pin.confirmTitle : copy.forgot.newPinTitle}
      subtitle={confirming ? copy.pin.confirmSubtitle : copy.forgot.newPinSubtitle}
      gap={44}
      scroll={false}
      footer={
        <>
          {reset.isPending ? (
            <ActivityIndicator color={pt.brand} />
          ) : error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtKeypad value={confirming ? confirm : pin} onChange={onPin} length={PIN_LENGTH} disabled={reset.isPending} />
        </>
      }
    >
      <PtPinDots length={PIN_LENGTH} filled={(confirming ? confirm : pin).length} />
    </PtStepScreen>
  );
}
