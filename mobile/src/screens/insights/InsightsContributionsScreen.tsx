import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard } from '../../components/pt/PtList';
import { PtNote } from '../../components/pt/PtForm';
import { useContributions } from '../../api/insights';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { Empty, Loaded, StatPair, Track } from './parts';

const BAR = [pt.emerald700, pt.emerald300, pt.emerald900, pt.emerald500, pt.gold500, '#1D5FA8', '#6B4FA0'];

/**
 * INS-06 Who put in what: this year across the shared wallets — each person's
 * total, and how often set payments came on time. Owners see everyone;
 * contributors see their own.
 */
export function InsightsContributionsScreen({ navigation }: RootScreenProps<'InsightsContributions'>) {
  const q = useContributions();
  const d = q.data;
  const max = d ? Math.max(1, ...d.people.map((p) => parseFloat(p.amount)), d.others ? parseFloat(d.others) : 0) : 1;

  return (
    <PtPageScreen title="Who put in what" subtitle={d ? `All shared wallets · ${d.year}` : null} onBack={() => navigation.goBack()}>
      <Loaded query={q}>
        {() =>
          !d ? null : d.wallets === 0 ? (
            <Empty
              icon="users"
              title="No shared wallets yet"
              body="When family put money into a wallet with you, each person's total shows here."
              action="Invite someone"
              onAction={() => navigation.navigate('Invitations')}
            />
          ) : (
            <>
              <StatPair
                dark={{ label: `Total in ${d.year}`, value: formatNaira(d.total), note: `${d.people_count} ${d.people_count === 1 ? 'person' : 'people'}` }}
                light={{
                  label: 'On time',
                  value: d.on_time.percent !== null ? `${d.on_time.percent}%` : '—',
                  note: d.on_time.of > 0 ? `${d.on_time.done} of ${d.on_time.of}` : 'No set dates yet',
                }}
              />
              {d.people.length === 0 ? (
                <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 16 }}>Nothing put in yet this year.</Text>
              ) : (
                <PtCard>
                  {d.people.map((p, i) => (
                    <View key={p.user_id} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: i === d.people.length - 1 && !d.others ? 0 : 1, borderBottomColor: pt.line }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(p.amount)}</Text>
                      </View>
                      <Track percent={(parseFloat(p.amount) / max) * 100} color={BAR[i % BAR.length]} />
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{p.note}</Text>
                    </View>
                  ))}
                  {d.others ? (
                    <View style={{ paddingVertical: 12, gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }}>Others</Text>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(d.others)}</Text>
                      </View>
                      <Track percent={(parseFloat(d.others) / max) * 100} color={pt.lineStrong} />
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Bank transfers and contribution links</Text>
                    </View>
                  ) : null}
                </PtCard>
              )}
              <PtNote tone="info" icon="lock">
                {d.owner_view
                  ? "Only owners see everyone. Contributors see their own total and the wallet's progress."
                  : "You see your own total. The wallet's owners see everyone's."}
              </PtNote>
            </>
          )
        }
      </Loaded>
    </PtPageScreen>
  );
}
