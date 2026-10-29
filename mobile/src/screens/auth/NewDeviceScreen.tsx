import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { pickFile } from '../../lib/upload';
import { pendingSelfie } from '../../lib/selfie';
import { selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * ACC-06 "Is this your new phone?": we haven't seen this phone before. The
 * code to the number is done; a selfie comes next, then the PIN. It can
 * receive money right away and send after 24 hours.
 */
export function NewDeviceScreen({ route, navigation }: AuthScreenProps<'NewDevice'>) {
  const { phoneToken, account, phone } = route.params;
  const [busy, setBusy] = useState(false);
  const name = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android phone' : 'This browser';

  const start = async () => {
    selection();
    setBusy(true);
    try {
      const photo = await pickFile('camera');
      if (!photo) return;
      pendingSelfie.set(photo);
      navigation.replace('Unlock', { phoneToken, account: { ...account, new_device: true }, phone });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      step={`NEW PHONE · ${name.toUpperCase()}`}
      gap={20}
      footer={<PtButton title="Start" onPress={() => void start()} loading={busy} />}
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pt.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="smartphone" size={28} color={pt.info} />
        </View>
        <PtText variant="headline" style={{ fontSize: 26, lineHeight: 32, textAlign: 'center' }} accessibilityRole="header">
          Is this your new phone?
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          We haven't seen this phone before. A quick code and selfie keep your family's money safe.
        </PtText>
      </View>
      <View style={{ borderRadius: ptRadius.md, overflow: 'hidden' }}>
        <PtPanel>
          <PtReviewRow label="Step 1" value="Code to your number" sub="Done" />
          <PtReviewRow label="Step 2" value="A selfie to match your ID" />
          <PtReviewRow label="Then" value="Receive money right away. Send after 24 hours." last />
        </PtPanel>
      </View>
    </PtStepScreen>
  );
}
