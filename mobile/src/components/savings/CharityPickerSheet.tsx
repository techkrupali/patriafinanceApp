import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtSheet } from '../pt/PtSheet';
import { PtAvatar, AVATAR_CYCLE } from '../pt/PtAvatar';
import { PtDivider, PtGroupLabel, PtPanel, PtPills } from '../pt/PtForm';
import { PtButton } from '../pt/PtButton';
import { PtChip } from '../pt/PtChip';
import { useOrganisations } from '../../api/hooks';
import { useOrganisation } from '../../api/savingsBreak';
import { formatNaira, initials } from '../../lib/format';
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

/** BRK-03 a charity's profile: who they help, since when, what Patriai users gave this year. */
function CharityProfile({ org, onChoose, onBack }: { org: Organisation; onChoose: () => void; onBack: () => void }) {
  const q = useOrganisation(org.id);
  const p = q.data;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PtAvatar initials={initials(org.name)} tone="mint" size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 18, color: pt.ink }}>{org.name}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{[org.state, org.area].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {org.verified ? <PtChip label="Verified charity" tone="success" icon="check" /> : null}
        {org.cause ? <PtChip label={CAUSES.find((c) => c.value === org.cause)?.label ?? org.cause} tone="neutral" /> : null}
        {p?.since ? <PtChip label={`On Patriai since ${p.since}`} tone="neutral" /> : null}
      </View>
      {org.about ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{org.about}</Text> : null}
      <PtPanel>
        <View style={{ paddingVertical: 10, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Paid to</Text>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{`${org.bank_name} ${org.masked_number}`}</Text>
        </View>
        <PtDivider />
        <View style={{ paddingVertical: 10, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>From Patriai users</Text>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{p ? `${formatNaira(p.given_this_year)} this year` : '…'}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>From early-break fees and gifts</Text>
        </View>
      </PtPanel>
      <PtButton title="Choose this charity" onPress={onChoose} />
      <PtButton title="Back to the list" variant="ghost" onPress={onBack} />
    </View>
  );
}

/**
 * BRK-02 "Choose a charity" for half of an early-break fee: the charities
 * Patriai lists, by state and cause, verified first; each opens its profile
 * (BRK-03).
 */
export function CharityPickerSheet({ visible, value, onPick, onClose }: { visible: boolean; value: number | null; onPick: (o: Organisation) => void; onClose: () => void }) {
  const [state, setState] = useState<string | undefined>(undefined);
  const [cause, setCause] = useState<CharityCause | undefined>(undefined);
  const [open, setOpen] = useState<Organisation | null>(null);
  const list = useOrganisations({ kind: 'charity', state, cause }, visible);
  const states = list.data?.states ?? [];
  const orgs = list.data?.organisations ?? [];

  if (open) {
    return (
      <PtSheet visible={visible} title="Charity" onClose={() => { setOpen(null); onClose(); }}>
        <CharityProfile org={open} onChoose={() => { setOpen(null); onPick(open); }} onBack={() => setOpen(null)} />
      </PtSheet>
    );
  }

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
                  setOpen(o);
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
