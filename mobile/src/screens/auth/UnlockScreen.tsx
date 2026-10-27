import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { PtText } from '../../components/pt/PtText';
import { usePinLogin } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { notifyError, selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ACC-02 Unlock with PIN: the verified number's owner ("Hi Ngozi") enters
 * their PIN on the raised keypad to finish logging in.
 */
export function UnlockScreen({ route, navigation }: AuthScreenProps<'Unlock'>) {
  const { phoneToken, account } = route.params;
  const copy = useOnboardingCopy();
  const setSession = useAuth((s) => s.setSession);
  const login = usePinLogin();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onDigits = (next: string) => {
    if (login.isPending) return;
    setError(null);
    setPin(next);
    if (next.length < account.pin_length) return;
    login.mutate(
      { phone_token: phoneToken, pin: next },
      {
        onSuccess: ({ user, token }) => void setSession(user, token),
        onError: (e) => {
          notifyError();
          setPin('');
          if (e instanceof ApiError && e.errors?.phone_token) {
            navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Login' }] });
            return;
          }
          setError(e.message);
        },
      },
    );
  };

  return (
    <PtStepScreen onBack={() => navigation.goBack()} gap={16} scroll={false}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 16 }}>
        {account.avatar_url ? (
          <Image source={{ uri: account.avatar_url }} style={{ width: 64, height: 64, borderRadius: 32 }} />
        ) : (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: pt.emerald700,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: '#FFFFFF' }}>{account.initials}</Text>
          </View>
        )}
        <PtText variant="title" style={{ fontFamily: ptFont.extrabold }} accessibilityRole="header">
          {copy.unlock.hi(account.first_name)}
        </PtText>
        <PtText color={pt.inkMuted}>{copy.unlock.enterPin}</PtText>
      </View>

      <View style={{ paddingVertical: 6 }}>
        <PtPinDots length={account.pin_length} filled={pin.length} variant="raised" />
      </View>

      {login.isPending ? (
        <ActivityIndicator color={pt.brand} />
      ) : error ? (
        <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
          {error}
        </PtText>
      ) : null}

      <PtKeypad value={pin} onChange={onDigits} length={account.pin_length} variant="raised" disabled={login.isPending} />

      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('ForgotPin', { phoneToken, account });
        }}
        accessibilityRole="button"
        style={{ alignSelf: 'center', paddingVertical: 8 }}
      >
        <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>{copy.unlock.forgot}</Text>
      </Pressable>
    </PtStepScreen>
  );
}
