import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote } from '../../components/pt/PtForm';
import { useAjoCode } from '../../api/ajo';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** TRS-03 "Join an ajo circle · With a code from the organiser". */
export function AjoCodeScreen({ navigation }: RootScreenProps<'AjoCode'>) {
  const [code, setCode] = useState('');
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  const found = useAjoCode(clean.length === 6 ? clean : '');
  const p = found.data;

  return (
    <PtPageScreen
      title="Join an ajo circle"
      subtitle="With a code from the organiser"
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Continue" disabled={!p} onPress={() => p && navigation.replace('AjoJoin', { code: p.code })} />}
    >
      <View style={{ gap: 8 }}>
        <PtText variant="label">Circle code</PtText>
        <TextInput
          value={clean}
          onChangeText={setCode}
          placeholder="KMS482"
          placeholderTextColor={pt.inkSubtle}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          accessibilityLabel="Circle code"
          style={{ height: 64, borderRadius: ptRadius.sm, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, paddingHorizontal: 16, fontFamily: ptFont.extrabold, fontSize: 26, letterSpacing: 6, color: pt.ink }}
        />
      </View>
      {found.isLoading ? <ActivityIndicator color={pt.brand} /> : null}
      {found.error ? <PtText variant="caption" color={pt.danger}>{(found.error as Error).message}</PtText> : null}
      {p ? (
        <View style={{ backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 16, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{p.name}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
            {`${p.organiser.name ?? 'An organiser'} · ${formatNaira(p.contribution)} ${p.frequency === 'weekly' ? 'every week' : 'every month'} · ${p.members_label}`}
          </Text>
        </View>
      ) : null}
      <PtNote>Everyone in a circle must be verified. You'll see what you pay and receive before you join.</PtNote>
    </PtPageScreen>
  );
}
