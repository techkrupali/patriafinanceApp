import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../theme';
import { PtPageScreen } from '../components/pt/PtPageScreen';
import { PtCard, PtSectionTitle } from '../components/pt/PtList';
import { PtWalletRow } from '../components/pt/PtWalletRow';
import { PtPills } from '../components/pt/PtForm';
import { WalletActionsSheet } from '../components/WalletActionsSheet';
import { DraftWalletCard } from '../components/DraftWalletCard';
import { LoadError } from '../components/LoadError';
import { useWalletDrafts, useWallets } from '../api/hooks';
import { useHomePrefs } from '../store/homePrefs';
import { formatNaira } from '../lib/format';
import { resumeDraft } from '../lib/drafts';
import { selection } from '../lib/haptics';
import { walletBucket, type WalletBucket } from '../lib/walletRows';
import type { Wallet } from '../api/types';
import type { RootScreenProps } from '../navigation/types';

type Filter = 'all' | WalletBucket | 'goals' | 'locked';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'shared', label: 'Shared' },
  { key: 'goals', label: 'Goals' },
  { key: 'locked', label: 'Locked' },
];

const GROUPS: { key: WalletBucket; title: string }[] = [
  { key: 'mine', title: 'Mine' },
  { key: 'shared', title: 'Shared' },
  { key: 'children', title: 'Children' },
  { key: 'circles', title: 'Other circles' },
];

const isGoal = (w: Wallet) => (parseFloat(w.target_amount ?? '') || 0) > 0 || w.type === 'goal' || w.type === 'savings';
const isLocked = (w: Wallet) => (w.status && w.status !== 'active') || Boolean(w.emergency_locked) || Boolean(w.access_schedule);

/** Other circles (ajo pots) aren't counted in your total. */
const sum = (ws: Wallet[]) => ws.filter((w) => w.type !== 'ajo').reduce((t, w) => t + (parseFloat(w.balance) || 0), 0);

/** TRS-02 All wallets: grouped Mine / Shared / Children, filters, and unfinished setups. */
export function AllWalletsScreen({ navigation }: RootScreenProps<'AllWallets'>) {
  const wallets = useWallets({ circles: true });
  const drafts = useWalletDrafts();
  const hidden = useHomePrefs((s) => s.hidden);
  const [filter, setFilter] = useState<Filter>('all');
  const [actions, setActions] = useState<Wallet | null>(null);

  const list = useMemo(() => wallets.data ?? [], [wallets.data]);
  const visible = useMemo(
    () =>
      list.filter((w) =>
        filter === 'all' ? true : filter === 'goals' ? isGoal(w) : filter === 'locked' ? isLocked(w) : walletBucket(w) === filter,
      ),
    [list, filter],
  );
  const money = (n: number) => (hidden ? '₦ ••••' : formatNaira(n));

  return (
    <PtPageScreen
      onBack={() => navigation.goBack()}
      title="All wallets"
      subtitle={`${list.length} wallet${list.length === 1 ? '' : 's'} · ${money(sum(list))}`}
      gap={16}
      right={
        <Pressable
          onPress={() => {
            selection();
            navigation.navigate('AddToTreasury');
          }}
          accessibilityRole="button"
          accessibilityLabel="Add to Treasury"
          hitSlop={10}
        >
          <Feather name="plus" size={24} color={pt.ink} />
        </Pressable>
      }
    >
      <PtPills options={FILTERS.map((f) => ({ value: f.key, label: f.label }))} value={filter} onChange={setFilter} />

      {wallets.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 32 }} />
      ) : wallets.error ? (
        <LoadError message={(wallets.error as Error).message} onRetry={() => void wallets.refetch()} />
      ) : visible.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>No wallets here yet.</Text>
      ) : (
        GROUPS.map((g) => {
          // Main first: the everyday wallet.
          const items = visible.filter((w) => walletBucket(w) === g.key).sort((a, b) => Number(b.type === 'main') - Number(a.type === 'main'));
          if (items.length === 0) return null;
          return (
            <View key={g.key} style={{ gap: 8 }}>
              <PtSectionTitle title={g.key === 'circles' ? g.title : `${g.title} · ${money(sum(items))}`} />
              <PtCard>
                {items.map((w, i) => (
                  <PtWalletRow
                    key={w.id}
                    wallet={w}
                    hideAmount={hidden}
                    long
                    last={i === items.length - 1}
                    // TRS-02: Main opens its transactions (TXN-01); an ajo opens the circle (AJO-03).
                    onPress={() => (w.type === 'main' ? navigation.navigate('Activity', { walletId: w.id }) : w.type === 'ajo' ? navigation.navigate('Ajo', { walletId: w.id }) : w.type === 'project' && w.project_id ? navigation.navigate('ProjectDetail', { projectId: w.project_id }) : navigation.navigate('WalletDetail', { walletId: w.id }))}
                    onLongPress={w.type === 'ajo' ? undefined : () => setActions(w)}
                  />
                ))}
              </PtCard>
              {g.key === 'circles' ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Other circles aren't counted in your total.</Text> : null}
            </View>
          );
        })
      )}

      {filter === 'all' && (drafts.data ?? []).length > 0 ? (
        <View style={{ gap: 8 }}>
          <PtSectionTitle title="Unfinished setups" />
          {(drafts.data ?? []).map((d) => (
            <DraftWalletCard key={d.id} draft={d} onResume={() => resumeDraft(navigation, d)} />
          ))}
        </View>
      ) : null}
      <WalletActionsSheet wallet={actions} onClose={() => setActions(null)} />
    </PtPageScreen>
  );
}
