import React, { useState } from 'react';
import { PermissionsAndroid, Platform, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { pt } from '../../theme';
import { STORAGE_KEYS } from '../../config';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtGroupLabel, PtPanel } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** The other permissions, each asked for only when it's needed. */
const LATER = [
  { icon: 'users', title: 'Contacts', sub: 'To find family already on Patriai. We never message them.', when: 'We ask when you choose to invite family from your contacts.' },
  { icon: 'camera', title: 'Camera', sub: 'For your selfie, receipts and QR codes', when: 'We ask the first time you take a selfie or a photo.' },
  { icon: 'map-pin', title: 'Location', sub: 'To find Patriai agents near you, only when you ask', when: 'We ask only when you look for an agent near you.' },
] as const;

/** Has this phone seen SYS-07 yet? */
export async function permissionsAsked(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(STORAGE_KEYS.permissionsAsked).catch(() => '1'));
}

/**
 * SYS-07 Permission primers: why notifications matter ("so you know the moment
 * someone needs your approval"), then the phone's own question. Contacts,
 * camera and location are explained here but asked for only when needed.
 */
export function PermissionsScreen({ navigation }: RootScreenProps<'Permissions'>) {
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    await SecureStore.setItemAsync(STORAGE_KEYS.permissionsAsked, String(Date.now())).catch(() => {});
    navigation.goBack();
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      // Android 13+ asks; older Android allows notifications already.
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
    } finally {
      setBusy(false);
      await finish();
    }
  };

  return (
    <PtStepScreen
      gap={20}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Turn on notifications" onPress={() => void turnOn()} loading={busy} />
          <PtButton title="Not now" variant="ghost" onPress={() => void finish()} disabled={busy} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="bell" size={28} color={pt.brand} />
        </View>
        <PtText variant="headline" style={{ fontSize: 26, lineHeight: 32, textAlign: 'center' }} accessibilityRole="header">
          Turn on notifications?
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          So you know the moment someone needs your approval. Your phone will ask next.
        </PtText>
      </View>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>We ask for others only when needed</PtGroupLabel>
        <PtPanel>
          {LATER.map((p, i) => (
            <SettingsRow key={p.title} icon={p.icon} title={p.title} sub={p.sub} onPress={() => showAlert(p.title, p.when)} last={i === LATER.length - 1} />
          ))}
        </PtPanel>
      </View>
    </PtStepScreen>
  );
}
