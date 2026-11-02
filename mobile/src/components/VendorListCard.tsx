import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../theme';
import { PtAvatar } from './pt/PtAvatar';
import { selection } from '../lib/haptics';
import type { VendorListAction } from '../api/types';

/** "Adeyemi Builders Ltd" → "AB", as the directory shows it. */
const monogram = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/**
 * VND-03 "Okonkwo Tiles · ★ 4.6 · Nsukka": the vendors Steward found, each
 * opening its profile. Patriai has no prices or distances, so none are shown.
 */
export function VendorListCard({ vendors, onOpen }: { vendors: VendorListAction['vendors']; onOpen: (profileId: number) => void }) {
  if (!vendors.length) return null;
  return (
    <View style={{ alignSelf: 'stretch', backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 14 }}>
      {vendors.map((v, i) => (
        <Pressable key={v.vendor_profile_id} onPress={() => { selection(); onOpen(v.vendor_profile_id); }} accessibilityRole="button" accessibilityLabel={v.name}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i === vendors.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
            <PtAvatar initials={monogram(v.name)} size={40} tone="gold" />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ flexShrink: 1, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{v.name}</Text>
                {v.verified ? <Feather name="check" size={14} color={pt.brand} accessibilityLabel="Verified" /> : null}
              </View>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                {[v.rating ? `★ ${v.rating.toFixed(1)}` : 'New on Patriai', v.location, v.projects_completed ? `${v.projects_completed} project${v.projects_completed === 1 ? '' : 's'} done` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={pt.inkSubtle} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
