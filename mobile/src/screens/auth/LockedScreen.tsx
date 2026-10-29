import React, { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote } from '../../components/pt/PtForm';
import { useAuthFreeze } from '../../api/hooks';
import { showAlert } from '../../lib/alert';
import type { AuthScreenProps } from '../../navigation/types';

/** "11:52 pm". */
function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/**
 * ACC-07 Locked for 30 minutes: the PIN was wrong 5 times. Reset the PIN
 * instead, or — if it wasn't you — freeze the account now.
 */
export function LockedScreen({ route, navigation }: AuthScreenProps<'Locked'>) {
  const { phone, phoneToken, until } = route.params;
  const freeze = useAuthFreeze();
  const [frozen, setFrozen] = useState(false);

  const freezeNow = () =>
    showAlert('Freeze your account?', 'Nothing can leave any of your wallets until you unfreeze it with your PIN and a selfie. Money can still come in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Freeze now',
        style: 'destructive',
        onPress: () =>
          freeze.mutate(
            { phone_token: phoneToken },
            {
              onSuccess: () => setFrozen(true),
              onError: (e) => showAlert('Could not freeze', e.message),
            },
          ),
      },
    ]);

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Reset my PIN instead" onPress={() => navigation.replace('ForgotPin', { phone })} />
          {!frozen ? <PtButton title="Freeze my account" variant="ghost" onPress={freezeNow} loading={freeze.isPending} /> : null}
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 48 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FDEBC8', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="lock" size={30} color="#8F5400" />
        </View>
        <PtText variant="headline" style={{ fontSize: 26, lineHeight: 32, textAlign: 'center' }} accessibilityRole="header">
          Locked for 30 minutes
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          Your PIN was wrong 5 times. We locked the app to protect your money. Try again at {clock(until)}.
        </PtText>
      </View>
      {frozen ? (
        <PtNote tone="success" icon="check">Your account is frozen. Nothing can leave your wallets. Sign in later and unfreeze it with your PIN and a selfie.</PtNote>
      ) : (
        <PtNote tone="attention" icon="alert-triangle">Wasn't you? Someone may have your phone. Freeze your account now and we'll help.</PtNote>
      )}
    </PtStepScreen>
  );
}
