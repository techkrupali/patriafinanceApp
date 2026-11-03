import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPanel } from '../../components/pt/PtForm';
import { useStewardActions } from '../../api/steward';
import { activityWhen } from '../family/CircleMemberScreen';
import type { RootScreenProps } from '../../navigation/types';

const NOTE: Record<string, string> = {
  move: 'Within your limit, no PIN needed',
  auto_rule: 'From an auto-action you turned on',
  answer: "From the project's records",
  suggest: 'You decide',
};

/** AIS-06 "What Steward did — every suggestion and action". */
export function StewardLogScreen({ navigation }: RootScreenProps<'StewardLog'>) {
  const q = useStewardActions();
  const rows = q.data ?? [];

  return (
    <PtPageScreen title="What Steward did" subtitle="Every suggestion and action" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : rows.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>Nothing yet. When Steward moves money, answers a vendor or suggests a plan, it shows here.</Text>
      ) : (
        <PtPanel>
          {rows.map((a, i) => (
            <View key={a.id} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="shield" size={18} color={pt.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{a.summary}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{NOTE[a.kind] ?? ''}</Text>
                {a.at ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{activityWhen(a.at)}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: a.kind === 'suggest' ? pt.sunken : pt.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Feather name={a.kind === 'suggest' ? 'circle' : 'check'} size={a.kind === 'suggest' ? 8 : 13} color={a.kind === 'suggest' ? pt.inkMuted : pt.brand} />
                <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: a.kind === 'suggest' ? pt.inkMuted : pt.brand }}>{a.kind === 'suggest' ? 'Suggested' : 'Done'}</Text>
              </View>
            </View>
          ))}
        </PtPanel>
      )}
    </PtPageScreen>
  );
}
