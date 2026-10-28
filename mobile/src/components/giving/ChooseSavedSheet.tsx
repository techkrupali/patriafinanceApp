import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtSheet } from '../pt/PtSheet';
import { PtField } from '../pt/PtField';
import { PtButton } from '../pt/PtButton';
import { PtAvatar, AVATAR_CYCLE } from '../pt/PtAvatar';
import { PtCheckbox } from '../pt/PtCheck';
import { PtAddRow } from '../pt/PtPeople';
import { PtDivider, PtGroupLabel, PtPanel, PtPills } from '../pt/PtForm';
import { useSavedAccounts } from '../../api/hooks';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { SavedAccount } from '../../api/types';

/** A chosen recipient: a saved account (`a12`) or a group (`g3`). */
export type RecipientKey = `a${number}` | `g${number}`;

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
  { value: 'institutions', label: 'Institutions' },
  { value: 'partners', label: 'Partners' },
  { value: 'groups', label: 'Groups' },
];

/** "Verified · Ikeja · in Our churches" / "Zenith Bank •••• 89 · name checked". */
export function accountLine(a: SavedAccount): string {
  if (a.verified) return ['Verified', a.organisation?.area, a.groups.length ? `in ${a.groups.join(', ')}` : null].filter(Boolean).join(' · ');
  return `${a.bank_name} ${a.masked_number} · name checked`;
}

const title = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

/**
 * SND-16 "Choose saved accounts — pick one or more": groups first, then accounts
 * by category, with search and category filters.
 */
export function ChooseSavedSheet({
  visible,
  chosen,
  onDone,
  onAddNew,
  onClose,
}: {
  visible: boolean;
  chosen: RecipientKey[];
  onDone: (keys: RecipientKey[]) => void;
  onAddNew: () => void;
  onClose: () => void;
}) {
  const saved = useSavedAccounts();
  const [picked, setPicked] = useState<RecipientKey[]>(chosen);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPicked(chosen);
  }

  const term = q.trim().toLowerCase();
  const matches = (name: string) => !term || name.toLowerCase().includes(term);
  const groups = (saved.data?.groups ?? []).filter((g) => (filter === 'all' || filter === 'groups') && matches(g.name));
  const accounts = (saved.data?.accounts ?? []).filter((a) => filter !== 'groups' && (filter === 'all' || a.category === filter) && matches(a.nickname));
  const byCategory = accounts.reduce<Record<string, SavedAccount[]>>((out, a) => ({ ...out, [a.category]: [...(out[a.category] ?? []), a] }), {});
  const added = picked.filter((k) => !chosen.includes(k)).length;

  const toggle = (key: RecipientKey) => {
    selection();
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  };

  const row = (key: RecipientKey, name: string, sub: string, i: number, dark = false) => (
    <Pressable
      onPress={() => toggle(key)}
      accessibilityRole="button"
      accessibilityState={{ selected: picked.includes(key) }}
      accessibilityLabel={name}
      style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
    >
      <PtAvatar initials={initials(name)} tone={dark ? 'deep' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <PtCheckbox checked={picked.includes(key)} />
    </Pressable>
  );

  return (
    <PtSheet
      visible={visible}
      title="Choose saved accounts"
      subtitle="Pick one or more"
      onClose={onClose}
      footer={<PtButton title={added > 0 ? `Add ${added} recipient${added === 1 ? '' : 's'}` : 'Done'} onPress={() => onDone(picked)} />}
    >
      <PtField label="Search saved accounts" value={q} onChangeText={setQ} placeholder="Search saved accounts" />
      <PtPills options={FILTERS} value={filter} onChange={setFilter} />
      {saved.isLoading ? <ActivityIndicator color={pt.brand} /> : null}
      {groups.length ? (
        <View style={{ gap: 8 }}>
          <PtGroupLabel>Groups</PtGroupLabel>
          <PtPanel>
            {groups.map((g, i) => (
              <React.Fragment key={g.id}>
                {i > 0 ? <PtDivider /> : null}
                {row(`g${g.id}`, g.name, g.accounts.map((a) => a.nickname).join(', '), i, true)}
              </React.Fragment>
            ))}
          </PtPanel>
        </View>
      ) : null}
      {Object.entries(byCategory).map(([category, list]) => (
        <View key={category} style={{ gap: 8 }}>
          <PtGroupLabel>{title(category)}</PtGroupLabel>
          <PtPanel>
            {list.map((a, i) => (
              <React.Fragment key={a.id}>
                {i > 0 ? <PtDivider /> : null}
                {row(`a${a.id}`, a.nickname, accountLine(a), i)}
              </React.Fragment>
            ))}
          </PtPanel>
        </View>
      ))}
      {!saved.isLoading && !groups.length && !accounts.length ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{term ? 'Nothing matches.' : 'No saved accounts yet.'}</Text>
      ) : null}
      <PtAddRow label="Add a new account" onPress={onAddNew} />
    </PtSheet>
  );
}
