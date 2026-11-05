import React, { useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCodeInput } from '../../components/pt/PtCodeInput';
import { useCardPayment, useSubmitCardOtp } from '../../api/funding';
import { notifyError } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ADD-04 Card authorisation: "Confirm with your bank · Verve •••• 2231 — Your
 * bank sent a code. Enter the 6-digit code sent to 0803 •••• 790 to approve
 * ₦50,750 to Patriai." Then Money added, or why not.
 */
export function CardOtpScreen({ navigation, route }: RootScreenProps<'CardOtp'>) {
  const { reference } = route.params;
  const q = useCardPayment(reference, false);
  const submit = useSubmitCardOtp(reference);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const p = q.data;

  const confirm = () => {
    setError(null);
    submit.mutate(code, {
      onSuccess: (r) => {
        if (r.status === 'otp') {
          setCode('');
          setError(r.message);
          return;
        }
        navigation.replace('CardResult', { reference, walletId: r.wallet.id });
      },
      onError: (e) => {
        notifyError();
        setCode('');
        setError(e.message);
      },
    });
  };

  return (
    <PtPageScreen
      title="Confirm with your bank"
      subtitle={p?.card ?? null}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Confirm" onPress={confirm} loading={submit.isPending} disabled={code.length < 6} />}
    >
      {!p ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : (
        <>
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 20, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="lock" size={22} color={pt.brand} />
            </View>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink, textAlign: 'center' }}>Your bank sent a code</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted, textAlign: 'center' }}>{p.message ?? 'Enter the code your bank sent you.'}</Text>
          </View>
          <PtCodeInput ref={input} value={code} onChange={setCode} length={6} error={Boolean(error)} />
          {error ? (
            <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.danger, textAlign: 'center' }}>{error}</Text>
          ) : (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, textAlign: 'center' }}>No code after a minute? Go back and try again. Nothing is taken until you confirm.</Text>
          )}
        </>
      )}
    </PtPageScreen>
  );
}
