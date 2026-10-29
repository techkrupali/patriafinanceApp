import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel } from '../../components/pt/PtForm';
import { PtText } from '../../components/pt/PtText';
import { useAuth, type PostOnboardingRoute } from '../../store/auth';
import { selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

const STEPS: { label: string; route: PostOnboardingRoute | null }[] = [
  { label: 'Get your main wallet', route: null },
  { label: 'Verify your identity', route: 'Kyc' },
  { label: 'Invite your family', route: 'FamilyHub' },
  { label: 'Create your first shared wallet', route: 'CreateWallet' },
  { label: 'Set your first rule', route: 'CreateAutomation' },
];

/** ONB-13 "Let's set up your family": the main wallet is done; the rest any time. */
export function NextStepsScreen(_props: AuthScreenProps<'NextSteps'>) {
  const finishOnboarding = useAuth((s) => s.finishOnboarding);

  return (
    <PtStepScreen
      title="Let's set up your family"
      subtitle="About 10 minutes. You can stop any time."
      gap={18}
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Verify my identity" onPress={() => finishOnboarding('Kyc')} />
          <PtButton title="Do it later" variant="ghost" onPress={() => finishOnboarding()} />
        </View>
      }
    >
      <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.line, overflow: 'hidden' }} accessibilityLabel="1 of 5 done">
        <View style={{ width: '20%', height: 6, backgroundColor: pt.gold500 }} />
      </View>
      <PtPanel>
        {STEPS.map((s, i) => {
          const done = s.route === null;
          return (
            <Pressable
              key={s.label}
              disabled={done}
              onPress={() => {
                selection();
                if (s.route) finishOnboarding(s.route);
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: done }}
              style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === STEPS.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
            >
              {done ? (
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={14} color="#FFFFFF" />
                </View>
              ) : (
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: pt.lineStrong }} />
              )}
              <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: done ? pt.inkMuted : pt.ink, textDecorationLine: done ? 'line-through' : 'none' }}>{s.label}</Text>
              {!done ? <Feather name="chevron-right" size={18} color={pt.inkSubtle} /> : null}
            </Pressable>
          );
        })}
      </PtPanel>
      <PtText variant="caption" color={pt.inkMuted}>Verifying your NIN and a selfie unlocks shared wallets and sending up to ₦200,000 a day.</PtText>
    </PtStepScreen>
  );
}
