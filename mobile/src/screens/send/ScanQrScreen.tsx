import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote } from '../../components/pt/PtForm';
import type { RootScreenProps } from '../../navigation/types';

/**
 * QR-02 Scan to pay. The phone's own camera opens a Patriai code (its link
 * starts "How much?" here); scanning inside the app comes with the camera
 * update. Until then: your own code, or pay their @tag.
 */
export function ScanQrScreen({ navigation }: RootScreenProps<'ScanQr'>) {
  return (
    <PtPageScreen
      title="Scan to pay"
      subtitle="Point at a Patriai QR or any NQR code at a shop"
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Pay their @tag instead" onPress={() => navigation.replace('SendRecipient')} />
          <PtButton title="Show my code instead" variant="ghost" onPress={() => navigation.replace('MyQr')} />
        </View>
      }
    >
      <View style={{ aspectRatio: 1, backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <View style={{ width: '62%', aspectRatio: 1, borderWidth: 3, borderColor: pt.emerald300, borderRadius: ptRadius.md, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="camera" size={34} color={pt.emerald300} />
        </View>
        <PtText color={pt.emerald50} style={{ textAlign: 'center', maxWidth: 260 }}>
          Open your phone's camera and point it at the code. It opens straight into Patriai.
        </PtText>
      </View>
      <PtNote tone="info">Scanning inside the app comes with the next camera update.</PtNote>
    </PtPageScreen>
  );
}
