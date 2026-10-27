import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { useSaveOnboarding } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useOnboardingCopy, type OnboardingPurpose } from '../../lib/onboardingCopy';
import { selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';
import { SIGNUP_STEPS } from './PhoneScreen';

const OPTIONS: { key: OnboardingPurpose; icon: (color: string) => React.ReactNode }[] = [
  { key: 'household', icon: (c) => <Feather name="home" size={20} color={c} /> },
  { key: 'school_goals', icon: (c) => <Feather name="target" size={20} color={c} /> },
  { key: 'project', icon: (c) => <MaterialCommunityIcons name="hard-hat" size={20} color={c} /> },
  { key: 'ajo', icon: (c) => <Feather name="rotate-cw" size={20} color={c} /> },
  { key: 'children', icon: (c) => <Feather name="smile" size={20} color={c} /> },
  { key: 'vendor', icon: (c) => <Feather name="tool" size={20} color={c} /> },
];

/** ONB-09 "What brings you to Patriai?": pick any, saved to the new account. */
export function PurposeScreen({ navigation }: AuthScreenProps<'Purpose'>) {
  const copy = useOnboardingCopy();
  const setUser = useAuth((s) => s.setUser);
  const save = useSaveOnboarding();
  const [picked, setPicked] = useState<OnboardingPurpose[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: OnboardingPurpose) => {
    selection();
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  };

  const submit = () => {
    setError(null);
    save.mutate(
      { purposes: picked },
      {
        onSuccess: async ({ user }) => {
          await setUser(user);
          navigation.reset({ index: 0, routes: [{ name: 'WalletReady' }] });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtStepScreen
      step={copy.step(5, SIGNUP_STEPS)}
      title={copy.purpose.title}
      subtitle={copy.purpose.subtitle}
      gap={20}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtButton title={copy.continue} onPress={submit} loading={save.isPending} />
        </>
      }
    >
      <View style={{ gap: 10 }}>
        {OPTIONS.map(({ key, icon }) => {
          const on = picked.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              // "button" + selected rather than "checkbox": RNGH's Pressable ignores
              // taps on role=checkbox elements on web.
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                minHeight: 60,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: ptRadius.md,
                backgroundColor: on ? pt.brandSoft : pt.raised,
                borderWidth: 2,
                borderColor: on ? pt.brand : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: on ? pt.brand : pt.brandSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {icon(on ? pt.onBrand : pt.brand)}
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: on ? ptFont.bold : ptFont.semibold,
                  fontSize: 15,
                  lineHeight: 20,
                  color: on ? pt.brand : pt.ink,
                }}
              >
                {copy.purpose.options[key]}
              </Text>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(on ? { backgroundColor: pt.brand } : { backgroundColor: pt.raised, borderWidth: 1.5, borderColor: pt.lineStrong }),
                }}
              >
                {on ? <Feather name="check" size={16} color={pt.onBrand} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </PtStepScreen>
  );
}
