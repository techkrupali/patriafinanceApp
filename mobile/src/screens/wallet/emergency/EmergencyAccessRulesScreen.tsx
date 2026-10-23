import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../../components/KeyboardAwareScrollView';
import { Screen } from '../../../components/Screen';
import { Header } from '../../../components/Header';
import { Button } from '../../../components/Button';
import { ErrorText } from '../../../components/ErrorText';
import { GuidedIntro } from '../../../components/GuidedIntro';
import { DraftStatus } from '../../../components/DraftStatus';
import { EmergencyRulesForm } from '../../../components/EmergencyRulesForm';
import { colors } from '../../../theme';
import { useCreateWallet } from '../../../api/hooks';
import { notifySuccess } from '../../../lib/haptics';
import { confirmLeaveSetup, useDraftAutosave } from '../../../lib/drafts';
import {
  emergencyRulesPayload,
  emptyEmergencyRules,
  rulesDraft,
  validateEmergencyRules,
  type EmergencyRulesValue,
} from '../../../lib/emergency';
import type { RootScreenProps } from '../../../navigation/types';

/** Day money moves each month: today, capped at 28 so every month has it. */
const MONTHLY_DAY = Math.min(new Date().getDate(), 28);

/**
 * Emergency wallet — Step 2 of 2 (client design "Set Emergency Access Rules" +
 * video 2026-10-17): when the wallet may be unlocked, override rules, and who
 * receives the money once it is. "AI Triggered" was dropped per the client.
 */
export function EmergencyAccessRulesScreen({ navigation, route }: RootScreenProps<'EmergencyAccessRules'>) {
  const { draft, sessionKey } = route.params;
  const saved = route.params.rules;
  const create = useCreateWallet();

  const [rules, setRules] = useState<EmergencyRulesValue>(() => emptyEmergencyRules(saved));
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<EmergencyRulesValue>) => setRules((r) => ({ ...r, ...patch }));

  // Same draft as Step 1 (shared session). The emergency PIN is never saved.
  const autosave = useDraftAutosave({
    sessionKey,
    initialDraftId: route.params.draftId,
    type: 'emergency',
    name: draft.name,
    step: 2,
    totalSteps: 2,
    data: { rules: rulesDraft(rules) },
    enabled: true,
  });

  const save = () => {
    const err = validateEmergencyRules(rules, { pinRequired: true });
    setError(err);
    if (err) return;

    create.mutate(
      {
        type: 'emergency',
        name: draft.name,
        purpose: draft.purpose,
        initial_deposit: draft.initialDeposit || undefined,
        source_wallet_id: draft.sourceWalletId ?? undefined,
        monthly_amount: draft.monthlyAmount || undefined,
        monthly_day: draft.monthlyAmount ? MONTHLY_DAY : undefined,
        emergency: { purpose: draft.purpose, ...emergencyRulesPayload(rules) },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (data) => {
          autosave.stop();
          notifySuccess();
          navigation.popToTop();
          navigation.navigate('WalletDetail', { walletId: data.wallet.id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Emergency Wallet" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <GuidedIntro
          step="Step 2 of 2"
          icon="shield-checkmark"
          title="Set Emergency Access Rules"
          subtitle="Decide when this wallet can be unlocked and which beneficiaries receive the money. It stays locked until one of these rules is met."
        />
        <DraftStatus status={autosave.status} className="mt-2" />

        <EmergencyRulesForm value={rules} onChange={change} />

        <View className="mt-5 flex-row items-start rounded bg-success-soft p-4">
          <Ionicons name="lock-closed" size={16} color={colors.brand} style={{ marginRight: 10, marginTop: 2 }} />
          <Text className="flex-1 text-[12px] leading-5 text-brand-deep">
            "{draft.name}" will be locked as soon as it's created. Anyone can add money to it, but money only leaves
            when one of your rules is met.
          </Text>
        </View>

        <ErrorText message={error} className="mt-4" />

        <Button
          title="Save & Activate Emergency Wallet"
          icon="checkmark-circle"
          iconPosition="left"
          onPress={save}
          loading={create.isPending}
          className="mt-6"
        />
        <Button
          title="Back to Step 1"
          icon="arrow-back"
          iconPosition="left"
          variant="secondary"
          onPress={() => navigation.goBack()}
          className="mt-3"
        />
        <Pressable
          onPress={() =>
            confirmLeaveSetup(
              true,
              () => navigation.pop(2),
              () => void autosave.discard().then(() => navigation.pop(2)),
            )
          }
          className="mt-4 items-center py-2"
        >
          <Text className="text-[13px] font-semibold text-muted">Finish Later</Text>
        </Pressable>
      </KeyboardAwareScrollView>

    </Screen>
  );
}
