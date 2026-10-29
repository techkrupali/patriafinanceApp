import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtPanel } from '../../components/pt/PtForm';
import { PtText } from '../../components/pt/PtText';
import { API_URL } from '../../config';
import { selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

type Key = 'terms' | 'verify' | 'steward_learn' | 'news';

const ROWS: { key: Key; title: string; sub: string; required: boolean }[] = [
  { key: 'terms', title: 'I agree to the Terms and Privacy policy', sub: 'Required', required: true },
  { key: 'verify', title: 'Verify me with my BVN and NIN', sub: 'Required to hold money', required: true },
  { key: 'steward_learn', title: 'Let Steward learn from my transactions', sub: 'Optional · for better suggestions', required: false },
  { key: 'news', title: 'Send me news and offers', sub: 'Optional', required: false },
];

/** ONB-10 "Your data, your say": what Patriai may use, under Nigeria's Data Protection Act. */
export function TermsScreen({ route, navigation }: AuthScreenProps<'Terms'>) {
  const [on, setOn] = useState<Record<Key, boolean>>({ terms: true, verify: true, steward_learn: true, news: false });
  const ready = on.terms && on.verify;

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      step="ALMOST DONE · STEP 6 OF 7"
      title="Your data, your say"
      subtitle="Under Nigeria's Data Protection Act, you choose what we use."
      gap={18}
      footer={
        <PtButton
          title="Agree and continue"
          disabled={!ready}
          onPress={() => navigation.navigate('ReferralCode', { ...route.params, consents: on })}
        />
      }
    >
      <PtPanel>
        {ROWS.map((r, i) => (
          <Pressable
            key={r.key}
            onPress={() => {
              selection();
              setOn((o) => ({ ...o, [r.key]: !o[r.key] }));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on[r.key] }}
            accessibilityLabel={`${r.title}. ${r.sub}`}
            style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === ROWS.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{r.title}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{r.sub}</Text>
            </View>
            <PtCheckbox checked={on[r.key]} />
          </Pressable>
        ))}
      </PtPanel>
      {!ready ? <PtText variant="caption" color={pt.danger}>The terms and the BVN and NIN check are needed to open an account.</PtText> : null}
      <Pressable onPress={() => void Linking.openURL(`${API_URL.replace(/\/api\/v1$/, '')}/api/v1/legal/terms`)} accessibilityRole="link">
        <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Read the terms and privacy policy</Text>
      </Pressable>
    </PtStepScreen>
  );
}
