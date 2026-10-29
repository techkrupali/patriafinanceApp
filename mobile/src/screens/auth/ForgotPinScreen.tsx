import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCodeInput } from '../../components/pt/PtCodeInput';
import { PtField } from '../../components/pt/PtField';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtText } from '../../components/pt/PtText';
import { PtNote } from '../../components/pt/PtForm';
import { usePhoneStart, usePhoneVerify, usePinForgot, usePinReset } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { formatE164 } from '../../lib/phone';
import { isWeakPin } from '../../lib/onboardingCopy';
import { pickFile, type PickedFile } from '../../lib/upload';
import { notifyError, selection } from '../../lib/haptics';
import type { PinForgotData } from '../../api/types';
import type { AuthScreenProps } from '../../navigation/types';

const PIN_LENGTH = 6;

/** "+2348034127790" → "+234 803 •••• 790" (ACC-03). */
export function maskPhone(phone: string): string {
  const shown = formatE164(phone);
  return `${shown.slice(0, 8)} •••• ${phone.slice(-3)}`;
}

/**
 * Reset your PIN (ACC-03 → 04 → 05): a code to the phone, then the BVN you
 * verified with (or, before a BVN was checked, a code to your email) and a
 * selfie, then a new PIN — payments over ₦50,000 wait 24 hours after.
 */
export function ForgotPinScreen({ route, navigation }: AuthScreenProps<'ForgotPin'>) {
  const { phone } = route.params;
  const setSession = useAuth((s) => s.setSession);
  const start = usePhoneStart();
  const verify = usePhoneVerify();
  const forgot = usePinForgot();
  const reset = usePinReset();
  const codeRef = useRef<TextInput>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [token, setToken] = useState<string | null>(null);
  const [needs, setNeeds] = useState<PinForgotData | null>(null);
  const [bvn, setBvn] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [selfie, setSelfie] = useState<PickedFile | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const backToLogin = () => navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Login' }] });
  const expired = (e: Error) => e instanceof ApiError && Boolean(e.errors?.phone_token);

  const sendCode = (channel: 'sms' | 'whatsapp' = 'sms') =>
    start.mutate(
      { phone, channel },
      {
        onSuccess: (d) => {
          setWait(d.resend_in);
          setDevCode(d.debug_otp);
        },
        onError: (e) => setError(e.message),
      },
    );

  useEffect(() => {
    sendCode();
    // Once on arrival; "Resend" sends again.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Step 1 → 2: the code proves the phone; then what the second check is.
  const checkCode = (value = code) => {
    if (value.length !== 6) return;
    setError(null);
    verify.mutate(
      { phone, code: value },
      {
        onSuccess: ({ phone_token }) => {
          setToken(phone_token);
          forgot.mutate(
            { phone_token },
            {
              onSuccess: (d) => {
                setNeeds(d);
                setStep(2);
              },
              onError: (e) => (expired(e) ? backToLogin() : setError(e.message)),
            },
          );
        },
        onError: (e) => {
          notifyError();
          setError(e.message);
          setCode('');
          codeRef.current?.focus();
        },
      },
    );
  };

  const takeSelfie = async () => {
    selection();
    const photo = await pickFile('camera');
    if (photo) setSelfie(photo);
  };

  const proveIt = () => {
    setError(null);
    if (needs?.needs === 'bvn' && !/^\d{11}$/.test(bvn)) return setError('Enter your 11-digit BVN.');
    if (needs?.needs === 'email' && !/^\d{6}$/.test(emailCode)) return setError('Enter the 6-digit code from your email.');
    if (!selfie) return setError('Take a selfie to prove it\'s you.');
    setStep(3);
  };

  const onPin = (next: string) => {
    if (reset.isPending || !token || !selfie) return;
    setError(null);
    if (pin.length < PIN_LENGTH) {
      setPin(next);
      if (next.length < PIN_LENGTH) return;
      if (isWeakPin(next, null, phone)) {
        notifyError();
        setError('Too easy to guess. Avoid your birthday, 123456 or one digit repeated.');
        setPin('');
      }
      return;
    }
    setConfirm(next);
    if (next.length < PIN_LENGTH) return;
    if (next !== pin) {
      notifyError();
      setError('Those PINs don\'t match. Start again.');
      setPin('');
      setConfirm('');
      return;
    }
    reset.mutate(
      { phone_token: token, pin: next, selfie, ...(needs?.needs === 'bvn' ? { bvn } : { code: emailCode }) },
      {
        onSuccess: ({ user, token: session }) => void setSession(user, session),
        onError: (e) => {
          notifyError();
          setPin('');
          setConfirm('');
          if (expired(e)) return backToLogin();
          if (e instanceof ApiError && (e.errors?.bvn || e.errors?.code || e.errors?.selfie)) setStep(2);
          setError(e.message);
        },
      },
    );
  };

  if (step === 1) {
    return (
      <PtStepScreen
        onBack={() => navigation.goBack()}
        step="RESET YOUR PIN · STEP 1 OF 3"
        title="Confirm it's your phone"
        subtitle={`We sent a 6-digit code to ${maskPhone(phone)}.`}
        gap={24}
        footer={<PtButton title="Continue" onPress={() => checkCode()} loading={verify.isPending || forgot.isPending} disabled={code.length !== 6} />}
      >
        <PtCodeInput
          ref={codeRef}
          value={code}
          error={Boolean(error)}
          onChange={(v) => {
            setCode(v);
            setError(null);
            if (v.length === 6 && !verify.isPending) checkCode(v);
          }}
        />
        {error ? <PtText variant="caption" color={pt.danger}>{error}</PtText> : null}
        {devCode ? (
          <View style={{ alignSelf: 'flex-start', backgroundColor: pt.sunken, borderRadius: ptRadius.xs, paddingHorizontal: 10, paddingVertical: 4 }}>
            <PtText variant="caption" color={pt.inkMuted}>Test code: {devCode}</PtText>
          </View>
        ) : null}
        {wait > 0 ? (
          <PtText color={pt.inkMuted} style={{ fontSize: 14 }}>
            Didn't get it? Resend by WhatsApp in <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{`${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`}</Text>
          </PtText>
        ) : (
          <Pressable onPress={() => sendCode('whatsapp')} accessibilityRole="button" disabled={start.isPending}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Resend by WhatsApp</Text>
          </Pressable>
        )}
      </PtStepScreen>
    );
  }

  if (step === 2) {
    return (
      <PtStepScreen
        onBack={() => setStep(1)}
        step="RESET YOUR PIN · STEP 2 OF 3"
        title="Prove it's you"
        subtitle="Because a PIN protects your family's money, we check your BVN and face."
        gap={18}
        footer={<PtButton title={selfie ? 'Continue' : 'Take selfie'} onPress={selfie ? proveIt : () => void takeSelfie()} />}
      >
        {needs?.needs === 'bvn' ? (
          <PtField label="BVN" value={bvn} onChangeText={(t) => setBvn(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder={needs.bvn_hint ?? '11 digits'} maxLength={11} />
        ) : (
          <PtField
            label={`Code sent to ${needs?.sent_to ?? 'your email'}`}
            value={emailCode}
            onChangeText={(t) => setEmailCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="6 digits"
            hint={needs?.debug_otp ? `Test code: ${needs.debug_otp}` : 'You haven\'t verified a BVN yet, so we check your email instead.'}
            maxLength={6}
          />
        )}
        <Pressable
          onPress={() => void takeSelfie()}
          accessibilityRole="button"
          accessibilityLabel={selfie ? 'Retake selfie' : 'Take selfie'}
          style={{ height: 220, borderRadius: ptRadius.md, backgroundColor: pt.emerald900, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        >
          {selfie ? (
            <Image source={{ uri: selfie.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ width: 120, height: 150, borderRadius: 75, borderWidth: 2, borderColor: pt.emerald300, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="camera" size={26} color={pt.emerald300} />
            </View>
          )}
        </Pressable>
        {selfie ? <PtText variant="caption" color={pt.inkMuted}>Selfie taken. Tap it to take another.</PtText> : null}
        {error ? <PtText variant="caption" color={pt.danger}>{error}</PtText> : null}
      </PtStepScreen>
    );
  }

  const confirming = pin.length === PIN_LENGTH;
  return (
    <PtStepScreen
      onBack={() => {
        setPin('');
        setConfirm('');
        setStep(2);
      }}
      step="STEP 3 OF 3"
      title={confirming ? 'Enter it again' : 'Set a new PIN'}
      subtitle="For your safety, payments over ₦50,000 wait 24 hours."
      gap={36}
      scroll={false}
      footer={
        <>
          {reset.isPending ? <ActivityIndicator color={pt.brand} /> : error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtKeypad value={confirming ? confirm : pin} onChange={onPin} length={PIN_LENGTH} disabled={reset.isPending} />
        </>
      }
    >
      <PtPinDots length={PIN_LENGTH} filled={(confirming ? confirm : pin).length} />
      <PtNote tone="info" icon="clock">6 digits. Not your birthday or 123456.</PtNote>
    </PtStepScreen>
  );
}
