import React from 'react';
import { ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt } from '../../theme';
import { useWallet } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { DoneHero, LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

const groupAccount = (n: string) => n.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');

/**
 * INV-O3 "Your joint wallet is open": you're co-owners, when your first share
 * moves, the account number, what you can spend alone, and that rule changes
 * need both — then See the joint wallet or Back home.
 */
export function JointOpenScreen({ navigation, route }: RootScreenProps<'JointOpen'>) {
  const { walletId } = route.params;
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const q = useWallet(walletId);
  const wallet = q.data?.wallet;
  const j = wallet?.joint;
  const ownerFirst = (wallet?.owner?.name ?? 'your partner').split(/\s+/)[0];
  const mine = j ? Number(wallet?.owner?.id === me?.id ? j.contribution.mine : j.contribution.partner) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        {!wallet || !j ? (
          <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <DoneHero />
              <PtText variant="headline" style={{ textAlign: 'center' }}>Your joint wallet is open</PtText>
              <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
                {`You and ${ownerFirst} are co-owners.${mine > 0 && j.first_contribution ? ` Your first ${formatNaira(mine)} moves on ${formatYmd(j.first_contribution).replace(/ \d{4}$/, '')}.` : ''}`}
              </PtText>
            </View>
            <PtPanel>
              <PtReviewRow
                label="Account number"
                value={wallet.virtual_account ? groupAccount(wallet.virtual_account) : 'Coming in a moment'}
                sub={[wallet.virtual_account_bank, wallet.name].filter(Boolean).join(' · ')}
              />
              <PtReviewRow label="You can spend alone" value={`Up to ${formatNaira(j.limits.per_payment)} a payment`} sub={`${formatNaira(j.limits.per_day)} a day`} />
              <PtReviewRow label="Rule changes" value={j.always.rules ? 'Need both of you' : 'Either of you, and both are told'} last />
            </PtPanel>
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        <PtButton title="See the joint wallet" onPress={() => navigation.replace('WalletDetail', { walletId })} />
        <PtButton title="Back home" variant="ghost" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] })} />
      </View>
    </View>
  );
}
