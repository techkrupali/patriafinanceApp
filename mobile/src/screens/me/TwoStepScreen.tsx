import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtChoiceCard, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtQrCode } from '../../components/pt/PtQrCode';
import { PinSheet } from '../../components/PinSheet';
import { useConfirmTwoStep, useDisableTwoStep, useSecurity, useStartTwoStep } from '../../api/account';
import { useAuth } from '../../store/auth';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

type Method = 'authenticator' | 'sms' | 'email';

/**
 * ME-08 Two-step verification, "an extra check for big changes": asked when
 * you sign in on a new phone, change your PIN or send over ₦500,000. An
 * authenticator app (most secure, works without signal), an SMS code or an
 * email code.
 */
export function TwoStepScreen({ navigation }: RootScreenProps<'TwoStep'>) {
  const user = useAuth((s) => s.user);
  const security = useSecurity();
  const start = useStartTwoStep();
  const confirm = useConfirmTwoStep();
  const disable = useDisableTwoStep();
  const [method, setMethod] = useState<Method>('authenticator');
  const [setup, setSetup] = useState<{ method: string; secret?: string; otpauth?: string; sent_to?: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const on = security.data?.two_factor;
  const phone = user?.phone ? `0${user.phone.slice(4, 7)} •••• ${user.phone.slice(-3)}` : 'your number';

  const begin = () => {
    setError(null);
    start.mutate(method, { onSuccess: (d) => setSetup(d), onError: (e) => setError(e.message) });
  };
  const finish = () =>
    confirm.mutate(code, {
      onSuccess: () => {
        notifySuccess();
        setSetup(null);
        setCode('');
        showAlert('Two-step verification is on', 'We\'ll ask for it when you sign in on a new phone, change your PIN or send over ₦500,000.');
      },
      onError: (e) => setError(e.message),
    });

  if (security.isLoading || !on) {
    return (
      <PtPageScreen title="Two-step verification" subtitle="An extra check for big changes" onBack={() => navigation.goBack()}>
        <ActivityIndicator color={pt.brand} />
      </PtPageScreen>
    );
  }

  if (on.on && !setup) {
    return (
      <PtPageScreen title="Two-step verification" subtitle="An extra check for big changes" onBack={() => navigation.goBack()}>
        <PtPanel>
          <PtReviewRow label="Status" value="On" sub="Asked on a new phone, a PIN change, and payments over ₦500,000" />
          <PtReviewRow label="Your second check" value={on.method === 'authenticator' ? 'Authenticator app' : on.method === 'sms' ? `SMS code to ${phone}` : `Email code to ${user?.email ?? 'your email'}`} last />
        </PtPanel>
        <PtButton title="Turn off" variant="secondary" onPress={() => setTurningOff(true)} />
        <PinSheet
          visible={turningOff}
          title="Turn off two-step?"
          subtitle="Enter your PIN to confirm"
          allowBiometric={false}
          loading={disable.isPending}
          error={offError}
          onSubmit={(pin) =>
            disable.mutate(pin, {
              onSuccess: () => {
                setTurningOff(false);
                notifySuccess();
              },
              onError: (e) => setOffError(e.message),
            })
          }
          onClose={() => setTurningOff(false)}
        />
      </PtPageScreen>
    );
  }

  if (setup) {
    return (
      <PtPageScreen
        title="Two-step verification"
        subtitle="Confirm with a code"
        onBack={() => setSetup(null)}
        footer={<PtButton title="Turn on" onPress={finish} loading={confirm.isPending} disabled={code.length !== 6} />}
      >
        {setup.otpauth ? (
          <View style={{ alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 18 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink, textAlign: 'center' }}>Scan this in your authenticator app</Text>
            <PtQrCode value={setup.otpauth} size={180} />
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, textAlign: 'center' }}>Or type this key:</Text>
            <Text selectable style={{ fontFamily: ptFont.bold, fontSize: 15, letterSpacing: 1, color: pt.ink, textAlign: 'center' }}>
              {setup.secret?.replace(/(.{4})/g, '$1 ').trim()}
            </Text>
            <PtButton
              title="Copy key"
              variant="mint"
              size="sm"
              onPress={() => {
                selection();
                void Clipboard.setStringAsync(setup.secret ?? '');
              }}
            />
          </View>
        ) : (
          <PtNote tone="info" icon="send">We sent a code to {setup.sent_to}.</PtNote>
        )}
        <PtField label="Enter the 6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="123456" error={error} />
      </PtPageScreen>
    );
  }

  return (
    <PtPageScreen
      title="Two-step verification"
      subtitle="An extra check for big changes"
      onBack={() => navigation.goBack()}
      footer={<PtButton title={method === 'authenticator' ? 'Set up authenticator' : method === 'sms' ? 'Send an SMS code' : 'Send an email code'} onPress={begin} loading={start.isPending} />}
    >
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, lineHeight: 30, color: pt.ink }} accessibilityRole="header">Add a second check</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>
          We'll ask for it when you sign in on a new phone, change your PIN or send over ₦500,000.
        </Text>
      </View>
      <PtChoiceCard icon="key" title="Authenticator app" subtitle="Most secure. Works without signal." selected={method === 'authenticator'} onPress={() => setMethod('authenticator')} />
      <PtChoiceCard icon="message-square" title="SMS code" subtitle={`To ${phone}`} selected={method === 'sms'} onPress={() => setMethod('sms')} />
      {user?.email ? <PtChoiceCard icon="mail" title="Email code" subtitle={`To ${user.email}`} selected={method === 'email'} onPress={() => setMethod('email')} /> : null}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtPageScreen>
  );
}
