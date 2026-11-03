import React from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtAvatar, AVATAR_CYCLE, type PtAvatarTone } from '../../components/pt/PtAvatar';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useCircleView } from '../../api/circles';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

const RING = 220;
const tone = (i: number): PtAvatarTone => (i === 0 ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]);

/** The circle drawn as rings, with everyone around it (FAM-02's picture). */
function CircleRing({ people }: { people: { id: number; initials: string }[] }) {
  const r = RING / 2 - 24;
  return (
    <View style={{ width: RING, height: RING, alignSelf: 'center' }}>
      <View style={{ position: 'absolute', left: 24, top: 24, width: RING - 48, height: RING - 48, borderRadius: RING, borderWidth: 14, borderColor: pt.brandSoft }} />
      <View style={{ position: 'absolute', left: 62, top: 62, width: RING - 124, height: RING - 124, borderRadius: RING, borderWidth: 12, borderColor: '#5FD3A6', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F2A93B' }} />
      </View>
      {people.slice(0, 8).map((p, i, all) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / all.length;
        return (
          <View key={p.id} style={{ position: 'absolute', left: RING / 2 + r * Math.cos(a) - 18, top: RING / 2 + r * Math.sin(a) - 18 }}>
            <PtAvatar initials={p.initials} size={36} tone={tone(i)} />
          </View>
        );
      })}
    </View>
  );
}

/** FAM-02 "Who is in which wallet": everyone across, each wallet down. */
export function CircleViewScreen({ navigation, route }: RootScreenProps<'CircleView'>) {
  const { circleId } = route.params;
  const q = useCircleView(circleId);
  const { width } = useWindowDimensions();
  const d = q.data;

  if (!d) {
    return (
      <PtPageScreen title="Who is in which wallet" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  // Fit everyone across a phone; scroll sideways only past ~7 people.
  const COL = Math.max(32, Math.min(44, Math.floor((Math.min(width, 520) - 64 - 110) / Math.max(1, d.people.length))));
  const AV = COL - 6;
  return (
    <PtPageScreen title="Who is in which wallet" subtitle={d.circle.name} onBack={() => navigation.goBack()}>
      <CircleRing people={d.people} />
      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 8, paddingHorizontal: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flex: 1, minWidth: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: pt.line }}>
              <View style={{ flex: 1, minWidth: 110 }} />
              {d.people.map((p, i) => (
                <View key={p.id} style={{ width: COL, alignItems: 'center' }} accessibilityLabel={p.name}>
                  <PtAvatar initials={p.initials} size={AV} tone={tone(i)} />
                </View>
              ))}
            </View>
            {d.wallets.map((w, wi) => (
              <View
                key={w.id}
                accessible
                accessibilityLabel={`${w.name}: ${d.people.filter((p) => w.in.includes(p.id)).map((p) => p.short).join(', ')}`}
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: wi === d.wallets.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
              >
                <View style={{ flex: 1, minWidth: 110, paddingRight: 8 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{w.name}</Text>
                  {w.balance !== null ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{formatNaira(w.balance)}</Text> : null}
                </View>
                {d.people.map((p) => {
                  const on = w.in.includes(p.id);
                  return (
                    <View key={p.id} style={{ width: COL, alignItems: 'center' }}>
                      <View style={{ width: on ? 18 : 7, height: on ? 18 : 7, borderRadius: 9, backgroundColor: on ? pt.brand : pt.lineStrong }} />
                    </View>
                  );
                })}
              </View>
            ))}
            {d.wallets.length === 0 ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 16 }}>No wallets in this circle yet.</Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 19, color: pt.inkMuted }}>
        {d.people.map((p) => `${p.initials} ${p.short}`).join(' · ')}
      </Text>
      {!d.circle.sees_all ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>You see the wallets you're in.</Text>
      ) : null}
    </PtPageScreen>
  );
}
