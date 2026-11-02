import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtPanel, PtPills, PtSegmented } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtRow } from '../../components/pt/PtList';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { useBanks, useOrganisations, useSaveAccount, useSavedAccounts, useUserSearch, useVerifyAccount } from '../../api/hooks';
import { useSavePayee } from '../../api/payments';
import { initialsOf } from '../../store/sendDraft';
import { PAYEE_CATEGORIES } from './SendBankScreen';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type Kind = 'bank' | 'patriai' | 'organisation';

/**
 * BEN-02 Add a saved account: a bank account (checked with the bank), a
 * Patriai user, or a verified organisation — with a nickname, a category (or a
 * new one) and, if wanted, a group ("Add to group "Our churches"").
 */
export function SavedAccountAddScreen({ navigation }: RootScreenProps<'SavedAccountAdd'>) {
  const saved = useSavedAccounts();
  const banks = useBanks();
  const verify = useVerifyAccount();
  const saveAccount = useSaveAccount();
  const savePayee = useSavePayee();
  const [kind, setKind] = useState<Kind>('bank');
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [person, setPerson] = useState<{ handle: string; name: string } | null>(null);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState('family');
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const people = useUserSearch(kind === 'patriai' ? term : '');
  const orgs = useOrganisations({ q: term.trim() || undefined }, kind === 'organisation');

  useEffect(() => {
    setChecked(null);
    setCheckError(null);
    if (kind !== 'bank' || number.length !== 10 || !bank) return;
    verify.mutate(
      { account_number: number, bank_code: bank.code },
      {
        onSuccess: (d) => {
          setChecked(d.account_name);
          setNickname((n) => n || d.account_name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
        },
        onError: (e) => setCheckError(e.message),
      },
    );
  }, [kind, number, bank?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = (kind === 'bank' && checked) || (kind === 'patriai' && person) || (kind === 'organisation' && orgId);
  const done = { onSuccess: () => { notifySuccess(); navigation.goBack(); }, onError: (e: Error) => setError(e.message) };
  const save = () => {
    setError(null);
    const cat = (newCategory ?? category).trim().toLowerCase() || 'family';
    const extra = { nickname: nickname.trim() || undefined, category: cat, ...(group ? { group } : {}) };
    if (kind === 'bank' && bank) saveAccount.mutate({ account_number: number, bank_code: bank.code, ...extra }, done);
    else if (kind === 'patriai' && person) savePayee.mutate({ identifier: person.handle, ...extra }, done);
    else if (kind === 'organisation' && orgId) saveAccount.mutate({ organisation_id: orgId, ...(group ? { group } : {}) }, done);
  };

  return (
    <PtPageScreen title="Add a saved account" onBack={() => navigation.goBack()} footer={<PtButton title="Save" onPress={save} disabled={!ready} loading={saveAccount.isPending || savePayee.isPending} />}>
      <PtSegmented
        options={[
          { value: 'bank', label: 'Bank account' },
          { value: 'patriai', label: 'Patriai user' },
          { value: 'organisation', label: 'Verified organisation' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setTerm('');
          setError(null);
        }}
      />

      {kind === 'bank' ? (
        <>
          <PtField label="Account number" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10} placeholder="10 digits" />
          <PtField label="Bank" value={bank?.name ?? ''} editable={false} placeholder="Choose the bank" onPressBox={() => setPicking(true)} />
          {verify.isPending ? <ActivityIndicator color={pt.brand} /> : null}
          {checked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 14 }}>
              <Feather name="check-circle" size={18} color={pt.brand} />
              <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>{`${checked} · checked with the bank`}</Text>
            </View>
          ) : checkError ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{checkError}</Text>
          ) : null}
        </>
      ) : (
        <>
          <PtField label={kind === 'patriai' ? 'Their @tag, phone or email' : 'Search verified organisations'} value={term} onChangeText={setTerm} autoCapitalize="none" placeholder={kind === 'patriai' ? '@chidi.eze' : 'Church, school, hospital'} />
          <PtPanel>
            {kind === 'patriai'
              ? (people.data ?? []).map((u, i, all) => (
                  <PtRow
                    key={u.id}
                    title={u.full_name}
                    subtitle={u.username ? `@${u.username}` : 'Patriai'}
                    left={<PtAvatar initials={initialsOf(u.full_name)} size={36} uri={u.avatar_url} />}
                    right={person?.handle === (u.username ? `@${u.username}` : u.full_name) ? <PtChip label="Chosen" tone="success" icon="check" /> : undefined}
                    onPress={() => {
                      setPerson({ handle: u.username ? `@${u.username}` : u.full_name, name: u.full_name });
                      setNickname(u.full_name);
                    }}
                    last={i === all.length - 1}
                  />
                ))
              : (orgs.data?.organisations ?? []).slice(0, 8).map((o, i, all) => (
                  <PtRow
                    key={o.id}
                    title={o.name}
                    subtitle={`${[o.area, o.state].filter(Boolean).join(', ')}${o.verified ? ' · verified' : ''}`}
                    right={orgId === o.id ? <PtChip label="Chosen" tone="success" icon="check" /> : undefined}
                    onPress={() => {
                      setOrgId(o.id);
                      setNickname(o.name);
                    }}
                    last={i === all.length - 1}
                  />
                ))}
          </PtPanel>
        </>
      )}

      {kind !== 'organisation' ? (
        <>
          <PtField label="Nickname" value={nickname} onChangeText={setNickname} maxLength={80} />
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Category</PtGroupLabel>
            <PtPills
              compact
              options={[...PAYEE_CATEGORIES, { value: '__new', label: '+ New category' }]}
              value={newCategory !== null ? '__new' : category}
              onChange={(v) => (v === '__new' ? setNewCategory('') : (setNewCategory(null), setCategory(v)))}
            />
            {newCategory !== null ? <PtField label="New category" value={newCategory} onChangeText={setNewCategory} placeholder="Church" maxLength={40} /> : null}
          </View>
        </>
      ) : null}

      {saved.data?.groups.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Add to a group</PtGroupLabel>
          <PtPills compact options={[{ value: '', label: 'No group' }, ...saved.data.groups.map((g) => ({ value: g.name, label: g.name }))]} value={group ?? ''} onChange={(v) => setGroup(v || null)} />
        </View>
      ) : null}
      {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}

      <PtOptionSheet
        visible={picking}
        title="Choose the bank"
        options={(banks.data ?? []).map((b) => ({ value: b.bank_code, label: b.bank_name }))}
        value={bank?.code ?? null}
        onPick={(code) => {
          setBank({ code, name: banks.data?.find((b) => b.bank_code === code)?.bank_name ?? code });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
