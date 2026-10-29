import React from 'react';
import { View } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtText } from '../../components/pt/PtText';
import { PtPanel } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { APP_VERSION } from '../../config';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** ME-20 About: "Money, together." — the version, rating Patriai and what's new. */
export function AboutScreen({ navigation }: RootScreenProps<'About'>) {
  return (
    <PtPageScreen title="About" onBack={() => navigation.goBack()}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
        <PtLogo height={48} />
        <PtText variant="title" style={{ textAlign: 'center' }}>Money, together.</PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 300 }}>
          Patriai helps Nigerian families plan, save and spend as one, with rules everyone agrees on.
        </PtText>
        <PtText variant="caption" color={pt.inkSubtle}>Version {APP_VERSION}</PtText>
      </View>
      <PtPanel>
        <SettingsRow icon="star" title="Rate Patriai" onPress={() => showAlert('Thank you', 'Rating opens in the App Store and Google Play once Patriai is published there.')} />
        <SettingsRow icon="plus" title="What's new" sub="Settings, security and limits" onPress={() => showAlert("What's new", 'Trusted phones skip the code, new phones wait 24 hours to send, two-step verification, login history, freezing your account, and clearer limits by tier.')} last />
      </PtPanel>
    </PtPageScreen>
  );
}
