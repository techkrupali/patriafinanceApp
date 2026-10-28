import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { pt } from '../../../theme';
import { PtStepScreen } from '../../../components/pt/PtStepScreen';
import { PtButton } from '../../../components/pt/PtButton';
import { PtText } from '../../../components/pt/PtText';
import { PtGroupLabel, PtNote } from '../../../components/pt/PtForm';
import { PinSheet } from '../../../components/PinSheet';
import { LoadError } from '../../../components/LoadError';
import {
  FastReleaseSection,
  KeyholdersSection,
  PurposesChecklist,
  TrustedSection,
  UnlockYourselfSection,
} from '../../../components/emergency/EmergencySections';
import { useEmergency, useEmergencyActions, useFamily } from '../../../api/hooks';
import { useAuth } from '../../../store/auth';
import { initials } from '../../../lib/format';
import { notifySuccess } from '../../../lib/haptics';
import { rulesFromDetail, rulesPayload, validateRules, type EmergencyPins, type EmergencyRulesState } from '../../../lib/emergencyRules';
import type { EmergencyDetail, EmergencyPurpose } from '../../../api/types';
import type { RootScreenProps } from '../../../navigation/types';

/**
 * Owner changes an emergency fund's rules after setup — what it's for,
 * keyholders, fast release, opening it with the custom PIN, beneficiaries and
 * death emergency unlock. Saving needs the transaction PIN; keyholders are told.
 */
export function EditEmergencyRulesScreen(props: RootScreenProps<'EditEmergencyRules'>) {
  const detail = useEmergency(props.route.params.walletId);

  if (detail.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <PtStepScreen onBack={() => props.navigation.goBack()} title="Release rules">
        <LoadError message={(detail.error as Error | null)?.message} onRetry={() => void detail.refetch()} />
      </PtStepScreen>
    );
  }
  return <EditRules {...props} saved={detail.data} />;
}

function EditRules({ navigation, route, saved }: RootScreenProps<'EditEmergencyRules'> & { saved: EmergencyDetail }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const actions = useEmergencyActions(route.params.walletId);
  const [purposes, setPurposes] = useState<EmergencyPurpose[]>(saved.purposes ?? [saved.purpose]);
  const [rules, setRules] = useState<EmergencyRulesState>(() => rulesFromDetail(saved));
  const [pins, setPins] = useState<EmergencyPins>({ pin: '', pinConfirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const change = (patch: Partial<EmergencyRulesState>) => setRules((r) => ({ ...r, ...patch }));
  const hasCustomPin = saved.rules.has_custom_pin;

  // Family plus anyone already holding a key, even if they've left every other wallet.
  const candidates = [
    ...(family.data?.members ?? []).filter((m) => m.role !== 'vendor').map((m) => ({ id: m.id, name: m.name, avatar: m.avatar })),
    ...(saved.rules.keyholders ?? []).map((k) => ({ id: k.id, name: k.name, avatar: null })),
  ].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);

  const review = () => {
    if (purposes.length === 0) {
      setError('Pick at least one emergency it is for.');
      return;
    }
    const problem = validateRules(rules, pins, { pinRequired: rules.manual && !hasCustomPin });
    setError(problem);
    if (!problem) {
      setPinError(null);
      setPinOpen(true);
    }
  };

  const save = (pin: string) => {
    setPinError(null);
    actions.updateRules.mutate(
      { ...rulesPayload(rules, pins, purposes), pin },
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
    <PtStepScreen
      onBack={() => navigation.goBack()}
      title="Release rules"
      subtitle="Beneficiaries who stay keep what they've already received. People you remove lose access."
      gap={22}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtButton title="Save changes" onPress={review} />
        </>
      }
    >
      <View style={{ gap: 10 }}>
        <PtGroupLabel>What it's for</PtGroupLabel>
        <PurposesChecklist value={purposes} onChange={setPurposes} />
      </View>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>Who agrees to release money</PtGroupLabel>
        <KeyholdersSection value={rules} onChange={change} candidates={candidates} me={{ name: (me?.first_name || 'You').trim(), initials: initials(me?.full_name) }} />
      </View>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>When every minute counts</PtGroupLabel>
        <FastReleaseSection value={rules} onChange={change} />
      </View>
      <UnlockYourselfSection value={rules} onChange={change} pins={pins} onPins={setPins} hasCustomPin={hasCustomPin} />
      <View style={{ gap: 10 }}>
        <PtGroupLabel>If you can't ask yourself</PtGroupLabel>
        <TrustedSection value={rules} onChange={change} />
      </View>
      <PtNote tone="warning">You'll confirm with your transaction PIN. Every keyholder is told about the change.</PtNote>

      <PinSheet
        visible={pinOpen}
        title="Confirm changes"
        subtitle="Enter your transaction PIN to save the new rules."
        loading={actions.updateRules.isPending}
        error={pinError}
        onSubmit={save}
        onClose={() => setPinOpen(false)}
      />
    </PtStepScreen>
  );
}
