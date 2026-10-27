import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../theme';
import { PtStepScreen } from '../components/pt/PtStepScreen';
import { PtCard, PtSectionTitle } from '../components/pt/PtList';
import { PtWalletRow } from '../components/pt/PtWalletRow';
import { PtButton } from '../components/pt/PtButton';
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
];

const isGoal = (w: Wallet) => (parseFloat(w.target_amount ?? '') || 0) > 0 || w.type === 'goal' || w.type === 'savings';
const isLocked = (w: Wallet) => (w.status && w.status !== 'active') || Boolean(w.emergency_locked) || Boolean(w.access_schedule);

const sum = (ws: Wallet[]) => ws.reduce((t, w) => t + (parseFloat(w.balance) || 0), 0);

/** TRS-02 All wallets: grouped Mine / Shared / Children, filters, and unfinished setups. */
export function AllWalletsScreen({ navigation }: RootScreenProps<'AllWallets'>) {
  const wallets = useWallets();
  const drafts = useWalletDrafts();
  const hidden = useHomePrefs((s) => s.hidden);
  const [filter, setFilter] = useState<Filter>('all');

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
    <PtStepScreen
      onBack={() => navigation.goBack()}
      title="All wallets"
      subtitle={`${list.length} wallet${list.length === 1 ? '' : 's'} · ${money(sum(list))}`}
      gap={16}
      footer={<PtButton title="Create a wallet" onPress={() => navigation.navigate('CreateWallet')} />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                selection();
                setFilter(f.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                justifyContent: 'center',
                backgroundColor: on ? pt.brand : pt.raised,
                borderWidth: on ? 0 : 1.5,
                borderColor: pt.line,
              }}
            >
              <Text style={{ fontFamily: on ? ptFont.bold : ptFont.semibold, fontSize: 13, color: on ? pt.onBrand : pt.ink }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {wallets.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 32 }} />
      ) : wallets.error ? (
        <LoadError message={(wallets.error as Error).message} onRetry={() => void wallets.refetch()} />
      ) : visible.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>No wallets here yet.</Text>
      ) : (
        GROUPS.map((g) => {
          const items = visible.filter((w) => walletBucket(w) === g.key);
          if (items.length === 0) return null;
          return (
            <View key={g.key} style={{ gap: 8 }}>
              <PtSectionTitle title={`${g.title} · ${money(sum(items))}`} />
              <PtCard>
                {items.map((w, i) => (
                  <PtWalletRow
                    key={w.id}
                    wallet={w}
                    hideAmount={hidden}
                    last={i === items.length - 1}
                    onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                  />
                ))}
              </PtCard>
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
    </PtStepScreen>
  );
}
