import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt } from '../../theme';
import { PtButton } from '../../components/pt/PtButton';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtText } from '../../components/pt/PtText';
import { useAuth } from '../../store/auth';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ONB-02 Get started: "Money, together." — shown when Patriai was used on
 * this phone before (ONB-01's tour is for the first time).
 */
export function GetStartedScreen({ navigation }: AuthScreenProps<'GetStarted'>) {
  const insets = useSafeAreaInsets();
  const setPostAuthRoute = useAuth((s) => s.setPostAuthRoute);

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) + 18, paddingHorizontal: 20 }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <PtLogo height={56} />
        <PtText variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">
          Money, together.
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 300 }}>
          Plan, save and spend with your family, with rules you all agree on.
        </PtText>
      </View>
      <View style={{ gap: 6 }}>
        <PtButton
          title="I have an invite or a code"
          variant="ghost"
          onPress={() => {
            setPostAuthRoute('Invitations');
            navigation.navigate('Phone');
          }}
        />
        <PtButton title="Create an account" onPress={() => navigation.navigate('AccountType')} />
        <PtButton title="I already have an account" variant="ghost" onPress={() => navigation.navigate('Login')} />
      </View>
    </View>
  );
}
