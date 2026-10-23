import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../../components/KeyboardAwareScrollView';
import { Screen } from '../../../components/Screen';
import { Header } from '../../../components/Header';
import { Button } from '../../../components/Button';
import { ErrorText } from '../../../components/ErrorText';
import { LoadError } from '../../../components/LoadError';
import { PinSheet } from '../../../components/PinSheet';
import { PurposeGrid } from '../../../components/PurposeGrid';
import { EmergencyRulesForm } from '../../../components/EmergencyRulesForm';
import { colors } from '../../../theme';
import { useEmergency, useEmergencyActions } from '../../../api/hooks';
import { notifySuccess } from '../../../lib/haptics';
import { EMERGENCY_PURPOSES } from '../../../lib/walletGuides';
import {
  emergencyRulesPayload,
  rulesFromDetail,
  validateEmergencyRules,
  type EmergencyRulesValue,
} from '../../../lib/emergency';
import type { EmergencyDetail, EmergencyPurpose } from '../../../api/types';
import type { RootScreenProps } from '../../../navigation/types';

/**
 * Owner changes an emergency wallet's rules after setup: unlock methods, the
 * override rules, beneficiaries (add, remove, reorder, limits) and the custom
 * PIN. Saving needs the transaction PIN.
 */
export function EditEmergencyRulesScreen(props: RootScreenProps<'EditEmergencyRules'>) {
  const detail = useEmergency(props.route.params.walletId);

  if (detail.isLoading) {
    return (
      <Screen>
        <Header title="Edit Rules" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </Screen>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Screen>
        <Header title="Edit Rules" />
        <LoadError message={(detail.error as Error | null)?.message} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }
  return <EditRulesForm {...props} saved={detail.data} />;
}

function EditRulesForm({ navigation, route, saved }: RootScreenProps<'EditEmergencyRules'> & { saved: EmergencyDetail }) {
  const actions = useEmergencyActions(route.params.walletId);
  const [purpose, setPurpose] = useState<EmergencyPurpose>(saved.purpose);
  const [rules, setRules] = useState<EmergencyRulesValue>(() => rulesFromDetail(saved));
  const [error, setError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const change = (patch: Partial<EmergencyRulesValue>) => setRules((r) => ({ ...r, ...patch }));
  const hasCustomPin = saved.rules.has_custom_pin;

  const review = () => {
    const err = validateEmergencyRules(rules, { pinRequired: rules.manual && !hasCustomPin });
    setError(err);
    if (!err) {
      setPinError(null);
      setPinOpen(true);
    }
  };

  const save = (pin: string) => {
    setPinError(null);
    actions.updateRules.mutate(
      { purpose, ...emergencyRulesPayload(rules), pin },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          navigation.goBack();
        },
        onError: (e) => {
          // A wrong transaction PIN stays on the sheet; anything else is about the rules.
          if (/pin/i.test(e.message) && !/custom/i.test(e.message)) {
            setPinError(e.message);
          } else {
            setPinOpen(false);
            setError(e.message);
          }
        },
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Edit Rules" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[28px] font-extrabold leading-9 tracking-tight text-navy">Rules & Beneficiaries</Text>
        <Text className="mt-2 text-[14px] leading-5 text-muted">
          Change how this emergency wallet unlocks and who receives the money. Beneficiaries who stay keep what they've
          already received.
        </Text>

        <Text className="mb-3 mt-6 text-[13px] font-semibold text-muted">Purpose of Wallet</Text>
        <PurposeGrid purposes={EMERGENCY_PURPOSES} value={purpose} onChange={setPurpose} />

        <EmergencyRulesForm value={rules} onChange={change} hasCustomPin={hasCustomPin} />

        <View className="mt-5 flex-row items-start rounded bg-lav-faint p-4">
          <Ionicons name="shield-checkmark" size={16} color={colors.navy} style={{ marginRight: 10, marginTop: 2 }} />
          <Text className="flex-1 text-[12px] leading-5 text-muted">
            You'll confirm with your transaction PIN. New beneficiaries and approvers are notified; people you remove
            lose access to this wallet.
          </Text>
        </View>

        <ErrorText message={error} className="mt-4" />
        <Button title="Save Changes" icon="checkmark-circle" iconPosition="left" onPress={review} className="mt-6" />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} className="mt-3" />
      </KeyboardAwareScrollView>

      <PinSheet
        visible={pinOpen}
        title="Confirm changes"
        subtitle="Enter your transaction PIN to save the new rules."
        loading={actions.updateRules.isPending}
        error={pinError}
        onSubmit={save}
        onClose={() => setPinOpen(false)}
      />
    </Screen>
  );
}
