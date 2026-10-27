import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../theme';
import { PtTabScreen, PtQuickAction } from '../components/pt/PtTabScreen';
import { PtButton } from '../components/pt/PtButton';
import { PtCard, PtRow, PtSectionTitle } from '../components/pt/PtList';
import { PtWalletRow } from '../components/pt/PtWalletRow';
import { LoadError } from '../components/LoadError';
import { useHome, useWalletDrafts, useWallets } from '../api/hooks';
import { useHomePrefs } from '../store/homePrefs';
import { formatMoney, formatNaira, formatNairaK } from '../lib/format';
import type { TabScreenProps } from '../navigation/types';

const SEGMENTS = [
  { key: 'yours', label: 'Mine', color: pt.emerald700 },
  { key: 'shared', label: 'Shared', color: pt.emerald500 },
  { key: 'children', label: 'Children', color: pt.gold500 },
] as const;

/**
 * Treasury tab (prototype TRS-01): all your money with a mine / shared /
 * children bar, this month in and out, money actions, and the biggest wallets.
 * Every wallet, drafts included, is one tap away under "See all".
 */
export function WalletsScreen({ navigation }: TabScreenProps<'Treasury'>) {
  const home = useHome();
  const wallets = useWallets();
  const drafts = useWalletDrafts();
  const hidden = useHomePrefs((s) => s.hidden);

  const refetchHome = home.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchHome();
    }, [refetchHome]),
  );

  const list = useMemo(() => wallets.data ?? [], [wallets.data]);
  const biggest = useMemo(
    () => [...list].sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0)).slice(0, 3),
    [list],
  );
  const main = list.find((w) => w.type === 'main');
  const totals = home.data?.totals;
  const total = parseFloat(totals?.total ?? '0') || 0;
  const draftCount = drafts.data?.length ?? 0;

  return (
    <PtTabScreen
      title="Treasury"
      action={
        <PtButton
          title="Add"
          variant="secondary"
          size="sm"
          icon={<Feather name="plus" size={16} color={pt.brand} />}
          onPress={() => navigation.navigate('CreateWallet')}
        />
      }
      refreshing={home.isRefetching || wallets.isRefetching}
      onRefresh={() => {
        void home.refetch();
        void wallets.refetch();
        void drafts.refetch();
      }}
    >
      {home.isLoading || wallets.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 48 }} />
      ) : home.error || wallets.error || !totals ? (
        <LoadError
          message={((home.error ?? wallets.error) as Error | null)?.message}
          onRetry={() => {
            void home.refetch();
            void wallets.refetch();
          }}
        />
      ) : (
        <>
          {/* All your money */}
          <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 10 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.88, color: pt.emerald50, opacity: 0.8 }}>
              ALL YOUR MONEY · {list.length} WALLET{list.length === 1 ? '' : 'S'}
            </Text>
            <Text
              style={{ fontFamily: ptFont.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.68, color: pt.emerald50, fontVariant: ['tabular-nums'] }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {hidden ? '₦ ••••••' : formatMoney(totals.total)}
            </Text>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, backgroundColor: 'rgba(255,255,255,0.14)' }}>
              {total > 0
                ? SEGMENTS.map((s) => {
                    const share = (parseFloat(totals[s.key]) || 0) / total;
                    return share > 0 ? <View key={s.key} style={{ flex: share, backgroundColor: s.color }} /> : null;
                  })
                : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
              {SEGMENTS.map((s) => (
                <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: s.color }} />
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.emerald50, opacity: 0.9 }}>
                    {s.label} {hidden ? '••' : formatNairaK(totals[s.key])}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.emerald50, opacity: 0.85 }}>
              This month: <Text style={{ fontFamily: ptFont.bold }}>+{hidden ? '••' : formatNaira(totals.month_in)}</Text> in ·{' '}
              <Text style={{ fontFamily: ptFont.bold }}>−{hidden ? '••' : formatNaira(totals.month_out)}</Text> out
            </Text>
          </View>

          {/* Money actions */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PtQuickAction
              size={52}
              label="Move"
              icon={<MaterialCommunityIcons name="swap-vertical" size={23} color={pt.brand} />}
              onPress={() => navigation.navigate('Transfer')}
            />
            <PtQuickAction
              size={52}
              label="Top up"
              icon={<Feather name="arrow-down" size={22} color={pt.brand} />}
              onPress={() => (main ? navigation.navigate('Fund', { walletId: main.id }) : navigation.navigate('CreateWallet'))}
            />
            <PtQuickAction size={52} label="Send" icon={<Feather name="send" size={21} color={pt.brand} />} onPress={() => navigation.navigate('Transfer')} />
            <PtQuickAction
              size={52}
              label="Withdraw"
              icon={<Feather name="arrow-up" size={22} color={pt.brand} />}
              onPress={() => (main ? navigation.navigate('Withdraw', { walletId: main.id }) : undefined)}
              disabled={!main}
            />
          </View>

          {/* Biggest wallets */}
          <PtSectionTitle title="Biggest wallets" action={`See all ${list.length}`} onAction={() => navigation.navigate('AllWallets')} />
          <PtCard>
            {biggest.map((w, i) => (
              <PtWalletRow
                key={w.id}
                wallet={w}
                hideAmount={hidden}
                last={i === biggest.length - 1}
                onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
              />
            ))}
          </PtCard>

          {draftCount > 0 ? (
            <PtCard>
              <PtRow
                title={`${draftCount} unfinished setup${draftCount === 1 ? '' : 's'}`}
                subtitle="Pick up where you left off"
                chevron
                last
                onPress={() => navigation.navigate('AllWallets')}
              />
            </PtCard>
          ) : null}
        </>
      )}
    </PtTabScreen>
  );
}
