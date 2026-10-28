import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtSheet } from '../pt/PtSheet';
import { PtField } from '../pt/PtField';
import { PtAvatar, AVATAR_CYCLE } from '../pt/PtAvatar';
import { PtAddRow } from '../pt/PtPeople';
import { PtDivider, PtGroupLabel, PtPanel } from '../pt/PtForm';
import { accountLine } from './ChooseSavedSheet';
import { useOrganisations, useSavedAccounts } from '../../api/hooks';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { OrganisationKind } from '../../api/types';

/** Who a wallet pays directly: a verified organisation, or one of your saved accounts. */
export type Payee = { organisationId: number; name: string } | { savedAccountId: number; name: string };

/**
 * GLW-05 "Pay the school directly — to whom": verified organisations (schools
 * first for school fees) and saved accounts; a new account is added on GIV-07.
 */
export function PayeePickerSheet({
  visible,
  title,
  kind,
  onPick,
  onAddNew,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** Organisations of this kind come first (a school for school fees). */
  kind?: OrganisationKind;
  onPick: (p: Payee) => void;
  onAddNew: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const orgs = useOrganisations({ q: q.trim() || undefined, kind: q.trim() ? undefined : kind }, visible);
  const saved = useSavedAccounts();
  const term = q.trim().toLowerCase();
  const accounts = (saved.data?.accounts ?? []).filter((a) => !term || a.nickname.toLowerCase().includes(term));
  const row = (key: string, name: string, sub: string, i: number, onPress: () => void, verified = false) => (
    <React.Fragment key={key}>
      {i > 0 ? <PtDivider /> : null}
      <Pressable
        onPress={() => {
          selection();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={name}
        style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
      >
        <PtAvatar initials={initials(name)} tone={AVATAR_CYCLE[(i + 1) % AVATAR_CYCLE.length]} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {verified ? <Feather name="check-circle" size={18} color={pt.brand} /> : null}
      </Pressable>
    </React.Fragment>
  );

  return (
    <PtSheet visible={visible} title={title} subtitle="Pick a verified organisation or one of your accounts" onClose={onClose}>
      <PtField label="Search" value={q} onChangeText={setQ} placeholder="Search schools, churches, charities" />
      {orgs.isLoading ? <ActivityIndicator color={pt.brand} /> : null}
      {orgs.data?.organisations.length ? (
        <View style={{ gap: 8 }}>
          <PtGroupLabel>Verified organisations</PtGroupLabel>
          <PtPanel>
            {orgs.data.organisations.map((o, i) =>
              row(`o${o.id}`, o.name, [o.kind.charAt(0).toUpperCase() + o.kind.slice(1), o.area].filter(Boolean).join(' · '), i, () => onPick({ organisationId: o.id, name: o.name }), o.verified),
            )}
          </PtPanel>
        </View>
      ) : null}
      {accounts.length ? (
        <View style={{ gap: 8 }}>
          <PtGroupLabel>Your saved accounts</PtGroupLabel>
          <PtPanel>{accounts.map((a, i) => row(`a${a.id}`, a.nickname, accountLine(a), i, () => onPick({ savedAccountId: a.id, name: a.nickname }), a.verified))}</PtPanel>
        </View>
      ) : null}
      <PtAddRow label="Add a new account" onPress={onAddNew} />
    </PtSheet>
  );
}
