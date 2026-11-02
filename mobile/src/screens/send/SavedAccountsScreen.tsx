import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtGroupLabel, PtPanel, PtPills } from '../../components/pt/PtForm';
import { PtRow } from '../../components/pt/PtList';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { LoadError } from '../../components/LoadError';
import { HeaderIcon } from '../../components/wallet/WalletManageUi';
import { useSavedAccounts } from '../../api/hooks';
import { initialsOf } from '../../store/sendDraft';
import type { SavedAccount } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const ORDER = ['family', 'friends', 'institutions', 'partners'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "[Bank A] · 2210 •••• 41" · "Patriai · @chidi" · "Verified · in group "Our churches"" */
function line(a: SavedAccount): string {
  if (a.kind === 'patriai') return `Patriai${a.payee?.username ? ` · @${a.payee.username}` : ''}`;
  const where = `${a.bank_name ?? 'Bank'} · ${(a.account_number ?? '').slice(0, 4)} •••• ${(a.account_number ?? '').slice(-2)}`;
  if (a.verified) return a.groups.length ? `Verified · in group "${a.groups[0]}"` : `Verified · ${where}`;
  return a.groups.length ? `${where} · in "${a.groups[0]}"` : where;
}

/**
 * BEN-01 Saved accounts by category: Family, Friends, Institutions, Partners
 * (and any new one), the groups paid together, and + to add another.
 */
export function SavedAccountsScreen({ navigation }: RootScreenProps<'SavedAccounts'>) {
  const q = useSavedAccounts();
  const [chip, setChip] = useState('all');
  const accounts = q.data?.accounts ?? [];
  const groups = q.data?.groups ?? [];
  const cats = [...ORDER, ...[...new Set(accounts.map((a) => a.category))].filter((c) => !ORDER.includes(c))];
  const shown = cats.filter((c) => chip === 'all' || chip === c);

  return (
    <PtPageScreen
      title="Saved accounts"
      subtitle={q.data ? `${accounts.length} saved${groups.length ? ` · ${groups.length} group${groups.length === 1 ? '' : 's'}` : ''}` : null}
      onBack={() => navigation.goBack()}
      right={<HeaderIcon icon="plus" label="Add a saved account" onPress={() => navigation.navigate('SavedAccountAdd')} />}
    >
      <PtPills
        compact
        options={[{ value: 'all', label: 'All' }, ...cats.map((c) => ({ value: c, label: cap(c) })), { value: 'groups', label: 'Groups' }]}
        value={chip}
        onChange={setChip}
      />
      {q.isLoading ? <ActivityIndicator color={pt.brand} /> : q.error ? <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : null}

      {(chip === 'all' || chip === 'groups') && groups.length ? (
        <PtPanel>
          {groups.map((g, i) => (
            <PtRow
              key={g.id}
              title={g.name}
              subtitle={`${g.accounts.length} accounts${g.split_label ? ` · ${g.split_label}` : ''}`}
              left={<PtAvatar initials={initialsOf(g.name)} size={40} tone="deep" />}
              chevron
              onPress={() => navigation.navigate('SavedGroup', { id: g.id })}
              last={i === groups.length - 1}
            />
          ))}
        </PtPanel>
      ) : null}

      {chip !== 'groups'
        ? shown.map((c) => {
            const list = accounts.filter((a) => a.category === c);
            if (!list.length) return null;
            return (
              <View key={c} style={{ gap: 10 }}>
                <PtGroupLabel>{c}</PtGroupLabel>
                <PtPanel>
                  {list.map((a, i) => (
                    <PtRow
                      key={a.id}
                      title={a.nickname}
                      subtitle={line(a)}
                      left={<PtAvatar initials={initialsOf(a.nickname)} size={40} tone={a.kind === 'patriai' ? 'brand' : 'mint'} uri={a.payee?.avatar_url} />}
                      chevron
                      onPress={() => navigation.navigate('SavedAccountDetail', { id: a.id })}
                      last={i === list.length - 1}
                    />
                  ))}
                </PtPanel>
              </View>
            );
          })
        : null}

      {q.data && !accounts.length ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center', paddingVertical: 16 }}>
          Nothing saved yet. Tap + to save a bank account or a Patriai user.
        </Text>
      ) : null}
    </PtPageScreen>
  );
}
