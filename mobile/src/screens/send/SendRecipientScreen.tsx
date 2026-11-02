import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtGroupLabel, PtPanel, PtPills } from '../../components/pt/PtForm';
import { PtRow } from '../../components/pt/PtList';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useSavedAccounts, useUserSearch } from '../../api/hooks';
import { initialsOf, useSendDraft } from '../../store/sendDraft';
import { useRequestDraft, type AskPerson } from '../../store/requestDraft';
import { selection } from '../../lib/haptics';
import type { SavedAccount } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const CHIPS = [
  { value: 'saved', label: 'Saved' },
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
  { value: 'institutions', label: 'Institutions' },
  { value: 'partners', label: 'Partners' },
  { value: 'groups', label: 'Groups' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Family · [Bank A] •••• 41" · "Family · Patriai · @emeka" */
export function savedSub(a: SavedAccount): string {
  const where = a.kind === 'patriai' ? `Patriai${a.payee?.username ? ` · @${a.payee.username}` : ''}` : `${a.bank_name ?? 'Bank'} ${a.masked_number}`;
  return `${cap(a.category)} · ${where}`;
}

/**
 * SND-03 Who are you paying: search by name, @tag, phone or account number;
 * saved accounts by category with groups ("Our churches · split 50/50"); or
 * pay a new bank account. For REQ-01 (Change) and SPL-01 it picks who to ask
 * instead: people on Patriai, or someone not on it yet by phone.
 */
export function SendRecipientScreen({ navigation, route }: RootScreenProps<'SendRecipient'>) {
  const purpose = route.params?.purpose;
  const asking = purpose === 'request' || purpose === 'split';
  const saved = useSavedAccounts();
  const setRecipient = useSendDraft((s) => s.setRecipient);
  const { setPayer, addPerson } = useRequestDraft();
  const [outside, setOutside] = useState<{ name: string; phone: string } | null>(null);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState('saved');
  const term = q.trim().toLowerCase();
  const people = useUserSearch(term.length >= 2 && !/^\d{10}$/.test(term) ? term : '');

  const accounts = useMemo(() => {
    const all = saved.data?.accounts ?? [];
    return all.filter((a) => !asking || a.kind === 'patriai').filter((a) => (chip === 'saved' || chip === 'groups' ? true : a.category === chip)).filter((a) => !term || [a.nickname, a.account_name, a.payee?.username ?? '', a.account_number ?? ''].some((v) => v.toLowerCase().includes(term.replace(/^@/, ''))));
  }, [saved.data, chip, term, asking]);
  const groups = asking ? [] : (saved.data?.groups ?? []).filter((g) => !term || g.name.toLowerCase().includes(term));
  const savedUserIds = new Set((saved.data?.accounts ?? []).map((a) => a.payee?.id).filter(Boolean));
  const others = (people.data ?? []).filter((u) => !savedUserIds.has(u.id));

  /** REQ-01 / SPL-01: back to the request or the bill with this person. */
  const ask = (p: AskPerson) => {
    selection();
    if (purpose === 'split') addPerson(p);
    else setPayer(p);
    navigation.goBack();
  };

  const pay = (a: SavedAccount) => {
    if (asking) return ask({ kind: 'user', name: a.nickname, identifier: a.payee?.username ? `@${a.payee.username}` : '', sub: `Saved · ${savedSub(a)}`, avatarUrl: a.payee?.avatar_url });
    selection();
    setRecipient(
      a.kind === 'patriai'
        ? { kind: 'user', name: a.nickname, identifier: a.payee?.username ? `@${a.payee.username}` : '', sub: savedSub(a), savedId: a.id, avatarUrl: a.payee?.avatar_url }
        : { kind: 'bank', name: a.nickname, bankCode: a.bank_code ?? '', bankName: a.bank_name ?? '', accountNumber: a.account_number ?? '', sub: savedSub(a), savedId: a.id, verified: a.verified, saved: true },
    );
    navigation.navigate('SendAmount');
  };

  return (
    <PtPageScreen title={purpose === 'split' ? 'Split with' : asking ? 'Request money' : 'Send money'} subtitle={asking ? 'Who should pay you?' : 'Who are you paying?'} onBack={() => navigation.goBack()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingHorizontal: 14, backgroundColor: pt.raised }}>
        <Feather name="search" size={18} color={pt.inkMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={asking ? 'Name, @tag or email' : 'Name, @tag, phone or account number'}
          placeholderTextColor={pt.inkSubtle}
          autoCapitalize="none"
          accessibilityLabel="Search people and accounts"
          style={{ flex: 1, paddingVertical: 14, fontFamily: ptFont.regular, fontSize: 16, color: pt.ink }}
        />
      </View>

      <PtPills compact options={asking ? CHIPS.filter((c) => c.value !== 'groups') : CHIPS} value={chip} onChange={setChip} />

      {asking ? (
        <Pressable
          onPress={() => {
            selection();
            setOutside({ name: '', phone: /^[+\d\s]{7,}$/.test(q.trim()) ? q.trim() : '' });
          }}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 16 }}
        >
          <Feather name="plus" size={20} color={pt.brand} />
          <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>Someone not on Patriai</Text>
        </Pressable>
      ) : /^\d{10}$/.test(term) ? (
        <PtPanel>
          <PtRow title={`Pay account ${term}`} subtitle="Choose the bank, then we check the name" chevron onPress={() => navigation.navigate('SendBank', { accountNumber: term })} last />
        </PtPanel>
      ) : (
        <Pressable
          onPress={() => {
            selection();
            navigation.navigate('SendBank');
          }}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 16 }}
        >
          <Feather name="plus" size={20} color={pt.brand} />
          <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>Pay a new bank account</Text>
        </Pressable>
      )}

      {saved.isLoading ? <ActivityIndicator color={pt.brand} /> : saved.error ? <LoadError message={(saved.error as Error).message} onRetry={() => void saved.refetch()} /> : null}

      {(chip === 'saved' || chip === 'groups') && groups.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Groups</PtGroupLabel>
          <PtPanel>
            {groups.map((g, i) => (
              <PtRow
                key={g.id}
                title={g.name}
                subtitle={`${g.accounts.length} account${g.accounts.length === 1 ? '' : 's'}${g.split_label ? ` · ${g.split_label}` : ''}`}
                left={<PtAvatar initials={initialsOf(g.name)} size={40} tone="deep" />}
                chevron
                onPress={() => navigation.navigate('SavedGroup', { id: g.id, pay: true })}
                last={i === groups.length - 1}
              />
            ))}
          </PtPanel>
        </View>
      ) : null}

      {chip !== 'groups' && accounts.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Saved accounts</PtGroupLabel>
          <PtPanel>
            {accounts.map((a, i) => (
              <PtRow
                key={a.id}
                title={a.nickname}
                subtitle={savedSub(a)}
                left={<PtAvatar initials={initialsOf(a.nickname)} size={40} tone={a.kind === 'patriai' ? 'brand' : 'mint'} uri={a.payee?.avatar_url} />}
                right={a.verified ? <PtChip label="Verified" tone="success" icon="check" /> : undefined}
                chevron={!a.verified}
                onPress={() => pay(a)}
                last={i === accounts.length - 1}
              />
            ))}
          </PtPanel>
        </View>
      ) : null}

      {others.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>On Patriai</PtGroupLabel>
          <PtPanel>
            {others.map((u, i) => (
              <PtRow
                key={u.id}
                title={u.full_name}
                subtitle={u.username ? `Patriai · @${u.username}` : 'Patriai'}
                left={<PtAvatar initials={initialsOf(u.full_name)} size={40} uri={u.avatar_url} />}
                chevron
                onPress={() => {
                  if (asking) return ask({ kind: 'user', name: u.full_name, identifier: u.username ? `@${u.username}` : '', sub: u.username ? `Patriai · @${u.username}` : 'Patriai', avatarUrl: u.avatar_url });
                  selection();
                  setRecipient({ kind: 'user', name: u.full_name, identifier: u.username ? `@${u.username}` : '', sub: u.username ? `Patriai · @${u.username}` : 'Patriai', avatarUrl: u.avatar_url });
                  navigation.navigate('SendAmount');
                }}
                last={i === others.length - 1}
              />
            ))}
          </PtPanel>
        </View>
      ) : null}

      {!saved.isLoading && !accounts.length && !groups.length && !others.length ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center', paddingVertical: 12 }}>
          {term ? (asking ? 'No one on Patriai matches. Try their @tag, or add them as someone not on Patriai.' : 'No one matches. Try their @tag, phone number or account number.') : asking ? 'Search for someone on Patriai.' : 'No saved accounts here yet.'}
        </Text>
      ) : null}

      <PtSheet
        visible={outside !== null}
        title="Someone not on Patriai"
        subtitle="We'll text them a link to pay by bank transfer."
        onClose={() => setOutside(null)}
        footer={
          <PtButton
            title="Add"
            disabled={!outside?.name.trim() || (outside?.phone.replace(/\D/g, '').length ?? 0) < 10}
            onPress={() => outside && ask({ kind: 'outside', name: outside.name.trim(), phone: outside.phone.trim() })}
          />
        }
      >
        <View style={{ gap: 12 }}>
          <PtField label="Their name" value={outside?.name ?? ''} onChangeText={(name) => setOutside((o) => (o ? { ...o, name } : o))} maxLength={120} />
          <PtField label="Phone number" value={outside?.phone ?? ''} onChangeText={(phone) => setOutside((o) => (o ? { ...o, phone } : o))} keyboardType="phone-pad" placeholder="0803 000 0000" maxLength={20} />
        </View>
      </PtSheet>
    </PtPageScreen>
  );
}
