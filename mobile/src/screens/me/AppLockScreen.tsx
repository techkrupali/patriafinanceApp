import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtGroupLabel, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { useUpdateSettings } from '../../api/account';
import { useCheckPin } from '../../api/account';
import { useAuth } from '../../store/auth';
import { useAppLock } from '../../store/appLock';
import { useHomePrefs } from '../../store/homePrefs';
import { getBiometricSupport, runBiometricPrompt, saveTxnPin, type BiometricSupport } from '../../lib/biometrics';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const AFTER: { value: 0 | 1 | 5 | 15; label: string }[] = [
  { value: 0, label: 'Right away' },
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
];

/**
 * ME-07 Face ID and app lock: Face ID to open the app and approve payments,
 * the typed PIN on payments over ₦100,000 even so, when the app locks itself,
 * and hiding balances when it opens.
 */
export function AppLockScreen({ navigation }: RootScreenProps<'AppLockSettings'>) {
  const biometric = useAuth((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);
  const lock = useAppLock();
  const home = useHomePrefs();
  const update = useUpdateSettings();
  const verifyPin = useCheckPin();
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [askPin, setAskPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);
  const label = support?.label ?? 'Face ID';

  const sync = (input: Parameters<typeof update.mutate>[0]) => update.mutate(input);

  const toggleFaceId = (on: boolean) => {
    if (!on) {
      void setBiometricEnabled(false);
      sync({ face_id: false });
      return;
    }
    if (!support?.available) {
      showAlert(`${label} isn't set up`, 'Turn it on in your phone\'s settings first.');
      return;
    }
    // Face ID stands in for the PIN, so it learns the PIN once, right after the PIN is checked.
    setPinError(null);
    setAskPin(true);
  };

  const enrol = (pin: string) =>
    verifyPin.mutate(
      { pin },
      {
        onSuccess: async () => {
          setAskPin(false);
          const ok = await runBiometricPrompt(`Turn on ${label}`);
          if (!ok) return;
          await saveTxnPin(pin);
          await setBiometricEnabled(true);
          sync({ face_id: true, app_lock: true });
          notifySuccess();
        },
        onError: (e) => setPinError(e.message),
      },
    );

  return (
    <PtPageScreen title={`${label} and app lock`} onBack={() => navigation.goBack()}>
      <PtPanel>
        <PtSwitchRow title={`Use ${label}`} subtitle="To open the app and approve payments" value={biometric} onChange={toggleFaceId} />
        <PtSwitchRow
          title="Ask for PIN on payments over ₦100,000"
          subtitle={`Even with ${label} on`}
          value={lock.pinOver !== null}
          onChange={(v) => {
            void lock.save({ pinOver: v ? 100_000 : null });
            sync({ pin_over: v ? '100000' : null });
          }}
        />
      </PtPanel>

      <View style={{ gap: 12 }}>
        <PtGroupLabel>Lock the app after</PtGroupLabel>
        <PtPills
          compact
          options={AFTER}
          value={lock.lockAfter ?? -1}
          onChange={(v) => {
            void lock.save({ lockAfter: v as 0 | 1 | 5 | 15 });
            sync({ app_lock: true, lock_after: v as 0 | 1 | 5 | 15 });
          }}
        />
      </View>

      <PtPanel>
        <PtSwitchRow
          title="Hide balances when the app opens"
          subtitle="Tap the eye to show them"
          value={home.hideOnOpen}
          onChange={(v) => {
            void home.save({ hideOnOpen: v, sections: home.sections });
            sync({ hide_balances: v });
          }}
        />
      </PtPanel>

      <PinSheet
        visible={askPin}
        title="Enter your PIN"
        subtitle={`${label} will use it to approve payments`}
        allowBiometric={false}
        loading={verifyPin.isPending}
        error={pinError}
        onSubmit={enrol}
        onClose={() => setAskPin(false)}
      />
    </PtPageScreen>
  );
}
