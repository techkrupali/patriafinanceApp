import React, { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { PinSheet } from '../../components/PinSheet';
import { useFreezeAccount, useUnfreezeAccount } from '../../api/account';
import { useAuth } from '../../store/auth';
import { pickFile } from '../../lib/upload';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-18 Freeze your account? Nothing can leave any wallet — Main and your
 * share of shared ones; rules stop too — until you unfreeze it with your PIN
 * and a selfie. Money can still come in. "Someone tricked me into sending
 * money" opens a chat with the fraud team.
 */
export function FreezeAccountScreen({ navigation }: RootScreenProps<'FreezeAccount'>) {
  const frozen = useAuth((s) => s.user?.frozen ?? false);
  const freeze = useFreezeAccount();
  const unfreeze = useUnfreezeAccount();
  const [askPin, setAskPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const doUnfreeze = async (pin: string) => {
    setPinError(null);
    const selfie = await pickFile('camera');
    if (!selfie) {
      setPinError('Take a selfie to unfreeze.');
      return;
    }
    unfreeze.mutate(
      { pin, selfie },
      {
        onSuccess: () => {
          setAskPin(false);
          notifySuccess();
          showAlert('Your account is unfrozen', 'Payments and rules work again.');
          navigation.goBack();
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          {frozen ? (
            <PtButton title="Unfreeze with PIN and selfie" onPress={() => setAskPin(true)} loading={unfreeze.isPending} />
          ) : (
            <PtButton
              title="Freeze now"
              style={{ backgroundColor: pt.danger }}
              loading={freeze.isPending}
              onPress={() =>
                freeze.mutate(undefined, {
                  onSuccess: () => {
                    notifySuccess();
                    showAlert('Your account is frozen', 'Nothing can leave your wallets. Money can still come in.');
                    navigation.goBack();
                  },
                  onError: (e) => showAlert('Could not freeze', e.message),
                })
              }
            />
          )}
          <PtButton title="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      }
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pt.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="alert-triangle" size={28} color={pt.danger} />
        </View>
        <PtText variant="headline" style={{ fontSize: 26, lineHeight: 32, textAlign: 'center' }} accessibilityRole="header">
          {frozen ? 'Your account is frozen' : 'Freeze your account?'}
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          {frozen ? 'Nothing can leave your wallets. Unfreeze it when you\'re ready.' : 'Nothing can leave any of your wallets until you unfreeze it. Money can still come in.'}
        </PtText>
      </View>
      <PtPanel>
        <PtReviewRow label="Freezes" value="Main, and your share of shared wallets" />
        <PtReviewRow label="Cards and rules" value="Stopped too" />
        <PtReviewRow label="Unfreeze" value="With your PIN and a selfie" last />
      </PtPanel>
      <PtPanel>
        <SettingsRow
          icon="message-circle"
          title="Someone tricked me into sending money"
          sub="Talk to our fraud team now"
          onPress={() => navigation.navigate('SupportChat', { topic: 'fraud' })}
          last
        />
      </PtPanel>

      <PinSheet
        visible={askPin}
        title="Enter your PIN"
        subtitle="Then a selfie to unfreeze"
        allowBiometric={false}
        loading={unfreeze.isPending}
        error={pinError}
        onSubmit={(pin) => void doUnfreeze(pin)}
        onClose={() => setAskPin(false)}
      />
    </PtStepScreen>
  );
}
