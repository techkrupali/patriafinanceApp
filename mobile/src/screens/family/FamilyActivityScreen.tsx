import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtGroupLabel, PtPanel, PtPills } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useFamily } from '../../api/hooks';
import { useCircleActivity, type ActivityItem } from '../../api/circles';
import { activityWhen } from './CircleMemberScreen';
import type { RootScreenProps } from '../../navigation/types';

type Filter = 'everyone' | 'money' | 'approvals' | 'people';

/** "TODAY", "YESTERDAY", "20 OCT". */
function dayKey(iso: string): string {
  return activityWhen(iso, false);
}

/**
 * FAM-10 "Family activity": Everyone / Money / Approvals / People, by day.
 * "Emeka added ₦40,000 to School fees 2027 · 9:12 am".
 */
export function FamilyActivityScreen({ navigation, route }: RootScreenProps<'FamilyActivity'>) {
  const { circleId } = route.params;
  const [filter, setFilter] = useState<Filter>('everyone');
  const q = useCircleActivity(circleId, filter);
  const family = useFamily({ circle: circleId });
  const toneOf = useMemo(() => {
    const ids = (family.data?.members ?? []).map((m) => m.id);
    return (id: number | undefined) => (id === undefined ? 'mint' : AVATAR_CYCLE[(ids.indexOf(id) + 1) % AVATAR_CYCLE.length]);
  }, [family.data]);

  const groups = useMemo(() => {
    const out: { label: string; items: ActivityItem[] }[] = [];
    for (const item of q.data ?? []) {
      const label = dayKey(item.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(item);
      else out.push({ label, items: [item] });
    }
    return out;
  }, [q.data]);

  return (
    <PtPageScreen title="Family activity" subtitle={family.data?.circle?.name} onBack={() => navigation.goBack()}>
      <PtPills
        options={[
          { value: 'everyone' as Filter, label: 'Everyone' },
          { value: 'money' as Filter, label: 'Money' },
          { value: 'approvals' as Filter, label: 'Approvals' },
          { value: 'people' as Filter, label: 'People' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : groups.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 24 }}>Nothing here yet.</Text>
      ) : (
        groups.map((g) => (
          <View key={g.label} style={{ gap: 8 }}>
            <PtGroupLabel>{g.label}</PtGroupLabel>
            <PtPanel>
              {g.items.map((item, i) => (
                <View key={item.id} style={{ flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: i === g.items.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <PtAvatar initials={item.actor?.initials ?? '?'} tone={toneOf(item.actor?.id)} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: ptFont.medium, fontSize: 15, lineHeight: 21, color: pt.ink }}>{item.text}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                      {new Date(item.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  </View>
                </View>
              ))}
            </PtPanel>
          </View>
        ))
      )}
    </PtPageScreen>
  );
}
