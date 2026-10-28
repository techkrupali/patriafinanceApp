import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtSheet } from '../pt/PtSheet';
import { PtAvatar, AVATAR_CYCLE } from '../pt/PtAvatar';
import { PtDivider, PtGroupLabel, PtPanel, PtPills } from '../pt/PtForm';
import { useOrganisations } from '../../api/hooks';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { CharityCause, Organisation } from '../../api/types';

const CAUSES: { value: CharityCause; label: string }[] = [
  { value: 'children', label: 'Children' },
  { value: 'food', label: 'Food' },
  { value: 'education', label: 'Education' },
  { value: 'health', label: 'Health' },
  { value: 'elderly', label: 'Elderly' },
  { value: 'faith', label: 'Faith-based' },
];

/**
 * BRK-02 "Choose a charity" for half of an early-break fee: the charities
 * Patriai lists, by state and cause, verified first.
 */
export function CharityPickerSheet({ visible, value, onPick, onClose }: { visible: boolean; value: number | null; onPick: (o: Organisation) => void; onClose: () => void }) {
  const [state, setState] = useState<string | undefined>(undefined);
  const [cause, setCause] = useState<CharityCause | undefined>(undefined);
  const list = useOrganisations({ kind: 'charity', state, cause }, visible);
  const states = list.data?.states ?? [];
  const orgs = list.data?.organisations ?? [];

  return (
    <PtSheet visible={visible} title="Choose a charity" subtitle="Half of any early-break fee goes to them" onClose={onClose}>
      {states.length > 1 ? (
        <View style={{ gap: 8 }}>
          <PtGroupLabel>State</PtGroupLabel>
          <PtPills options={[{ value: '', label: 'All' }, ...states.map((s) => ({ value: s, label: s }))]} value={state ?? ''} onChange={(s) => setState(s || undefined)} />
        </View>
      ) : null}
      <PtPills options={CAUSES} value={cause ?? null} onChange={(c) => setCause(cause === c ? undefined : c)} />
      {list.isLoading ? <ActivityIndicator color={pt.brand} /> : null}
      {orgs.length ? (
        <PtPanel>
          {orgs.map((o, i) => (
            <React.Fragment key={o.id}>
              {i > 0 ? <PtDivider /> : null}
              <Pressable
                onPress={() => {
                  selection();
                  onPick(o);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: value === o.id }}
                accessibilityLabel={o.name}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
              >
                <PtAvatar initials={initials(o.name)} tone={AVATAR_CYCLE[(i + 2) % AVATAR_CYCLE.length]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={2}>
                    {o.name}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {[o.cause ? CAUSES.find((c) => c.value === o.cause)?.label : null, o.area].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {value === o.id ? (
                  <Feather name="check" size={18} color={pt.brand} />
                ) : o.verified ? (
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: pt.brand }}>★ Verified</Text>
                ) : null}
              </Pressable>
            </React.Fragment>
          ))}
        </PtPanel>
      ) : !list.isLoading ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>No charities listed here yet.</Text>
      ) : null}
      {list.data ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
          {list.data.total} {list.data.total === 1 ? 'charity' : 'charities'}
          {state ? ` in ${state}` : ''}
        </Text>
      ) : null}
    </PtSheet>
  );
}
