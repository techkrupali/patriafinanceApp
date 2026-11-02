import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useVendorListings } from '../../api/proposals';
import { PtChip } from '../pt/PtChip';
import { PtSectionTitle } from '../pt/PtList';
import { selection } from '../../lib/haptics';

/** VND-02 / VDM-07 "Finished on Patriai": the builder's listed projects (VLS-02). */
export function ListingsStrip({ profileId, onOpen, action, onAction }: { profileId: number; onOpen: (id: number) => void; action?: string; onAction?: () => void }) {
  const q = useVendorListings(profileId);
  const list = q.data ?? [];
  if (!list.length && !action) return null;
  return (
    <View style={{ gap: 10 }}>
      <PtSectionTitle title="Finished on Patriai" action={action} onAction={onAction} />
      {list.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {list.map((l) => (
            <Pressable key={l.id} onPress={() => { selection(); onOpen(l.id); }} accessibilityRole="button" accessibilityLabel={l.title} style={{ width: 200, backgroundColor: pt.raised, borderRadius: ptRadius.md, overflow: 'hidden' }}>
              <View style={{ height: 110, backgroundColor: pt.sunken }}>
                {l.photos[0] ? <Image source={{ uri: l.photos[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              </View>
              <View style={{ padding: 12, gap: 6 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.ink }} numberOfLines={2}>{l.title}</Text>
                {l.status === 'published' ? (
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{[l.milestones ? `${l.milestones} milestones` : null, l.months ? `${l.months} months` : null].filter(Boolean).join(' · ')}</Text>
                ) : (
                  <PtChip label={l.status === 'asking' ? 'Waiting for the family' : 'Kept private'} tone={l.status === 'asking' ? 'warning' : 'neutral'} icon="clock" />
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Finished projects you show appear here, with the family's yes.</Text>
      )}
    </View>
  );
}
