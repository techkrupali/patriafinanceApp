import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtCodeInput } from '../../components/pt/PtCodeInput';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { usePhoneStart, usePhoneVerify } from '../../api/hooks';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { formatE164 } from '../../lib/phone';
import { notifyError, selection } from '../../lib/haptics';
import type { OtpChannel } from '../../api/types';
import type { AuthScreenProps } from '../../navigation/types';
import { SIGNUP_STEPS } from './PhoneScreen';

const CODE_LENGTH = 6;

function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        selection();
        onPress();
      }}
      accessibilityRole="button"
      style={{ paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.brand }}>{label}</Text>
    </Pressable>
  );
}

/**
 * ONB-04: six code boxes, resend countdown, switch between SMS and WhatsApp,
 * change number. A verified number with an account goes to its PIN (ACC-02);
 * a new number carries on to "About you".
 */
export function CodeScreen({ route, navigation }: AuthScreenProps<'Code'>) {
  const { phone, flow } = route.params;
  const copy = useOnboardingCopy();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<OtpChannel>(route.params.channel);
  const [wait, setWait] = useState(route.params.resendIn);
  const [devCode, setDevCode] = useState(route.params.debugOtp);
  const inputRef = useRef<TextInput>(null);
  const verify = usePhoneVerify();
  const resend = usePhoneStart();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = (value = code) => {
    if (value.length !== CODE_LENGTH) {
      setError(copy.code.incomplete);
      return;
    }
    setError(null);
    verify.mutate(
      { phone, code: value },
      {
        onSuccess: ({ phone_token, account }) => {
          if (account) {
            navigation.replace('Unlock', { phoneToken: phone_token, account });
          } else {
            navigation.replace('Details', { phoneToken: phone_token });
          }
        },
        onError: (e) => {
          notifyError();
          setError(e.message);
          setCode('');
          inputRef.current?.focus();
        },
      },
    );
  };

  const send = (via: OtpChannel) => {
    setError(null);
    resend.mutate(
      { phone, channel: via },
      {
        onSuccess: (data) => {
          setChannel(data.channel);
          setWait(data.resend_in);
          setDevCode(data.debug_otp);
          setCode('');
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const channelName = channel === 'whatsapp' ? copy.phone.whatsapp : copy.phone.sms;
  const clock = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`;

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      step={flow === 'signup' ? copy.step(2, SIGNUP_STEPS) : undefined}
      title={copy.code.title}
      subtitle={
        <PtText color={pt.inkMuted}>
          {copy.code.sentLead(channelName)}
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{formatE164(phone)}</Text>.
        </PtText>
      }
      gap={28}
      footer={
        <PtButton
          title={copy.code.verify}
          onPress={() => submit()}
          loading={verify.isPending}
          disabled={code.length !== CODE_LENGTH}
        />
      }
    >
      <View style={{ gap: 12 }}>
        <PtCodeInput
          ref={inputRef}
          value={code}
          error={Boolean(error)}
          onChange={(v) => {
            setCode(v);
            setError(null);
            if (v.length === CODE_LENGTH && !verify.isPending) submit(v);
          }}
        />
        {error ? (
          <PtText variant="caption" color={pt.danger}>
            {error}
          </PtText>
        ) : null}
        {devCode ? (
          <View style={{ alignSelf: 'flex-start', backgroundColor: pt.sunken, borderRadius: ptRadius.xs, paddingHorizontal: 10, paddingVertical: 4 }}>
            <PtText variant="caption" color={pt.inkMuted}>
              {copy.code.devCode}: {devCode}
            </PtText>
          </View>
        ) : null}
      </View>

      <View style={{ alignItems: 'flex-start', gap: 4 }}>
        {wait > 0 ? (
          <PtText color={pt.inkMuted} style={{ fontSize: 14, lineHeight: 20 }}>
            {copy.code.resendIn}
            <Text style={{ fontFamily: ptFont.bold, color: pt.ink, fontVariant: ['tabular-nums'] }}>{clock}</Text>
          </PtText>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PtText color={pt.inkMuted} style={{ fontSize: 14, lineHeight: 20 }}>
              {copy.code.resendLead}
            </PtText>
            <TextLink label={copy.code.resend} onPress={() => send(channel)} disabled={resend.isPending} />
          </View>
        )}
        <TextLink
          label={channel === 'sms' ? copy.code.viaWhatsapp : copy.code.viaSms}
          onPress={() => send(channel === 'sms' ? 'whatsapp' : 'sms')}
          disabled={resend.isPending}
        />
        <TextLink label={copy.code.changePhone} onPress={() => navigation.goBack()} />
      </View>
    </PtStepScreen>
  );
}
