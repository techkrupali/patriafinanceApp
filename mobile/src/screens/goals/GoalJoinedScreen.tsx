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
import { roleTitle } from '../../components/wallet/RoleSheet';
import { formatNaira } from '../../lib/format';
import { namesList } from '../../lib/projects';
import type { RootScreenProps } from '../../navigation/types';

const groupAccount = (n: string) => n.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');

/**
 * INV-C3 Contributor joined: "Welcome, Chidi. Ngozi and Emeka have been told.
 * Add money whenever you like." The goal and how far along it is, its account
 * number, your role — then See the wallet or Add money now.
 */
export function GoalJoinedScreen({ navigation, route }: RootScreenProps<'GoalJoined'>) {
  const { walletId } = route.params;
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const q = useWallet(walletId);
  const w = q.data?.wallet;
  const members = q.data?.members ?? [];
  const role = q.data?.my_role ?? w?.my_role;
  // Who heard: the owner and co-owners.
  const told = members.filter((m) => m.user_id !== me?.id && ['owner', 'co_owner'].includes(m.role)).map((m) => m.name.split(' ')[0]);
  const target = Number(w?.target_amount ?? 0);
  const title = roleTitle(w?.type, role);

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        {!w ? (
          <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <DoneHero />
              <PtText variant="headline" style={{ textAlign: 'center' }}>{"You've joined"}</PtText>
              <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
                {`Welcome, ${me?.first_name ?? 'you'}.${told.length ? ` ${namesList(told)} ${told.length === 1 ? 'has' : 'have'} been told.` : ''} Add money whenever you like.`}
              </PtText>
            </View>
            <PtPanel>
              <PtReviewRow label="Wallet" value={w.name} sub={target ? `${formatNaira(w.balance)} of ${formatNaira(target)}` : `${formatNaira(w.balance)} saved`} />
              <PtReviewRow label="Account number" value={w.virtual_account ? groupAccount(w.virtual_account) : 'Coming in a moment'} sub={[w.virtual_account_bank, `Patriai / ${w.name}`].filter(Boolean).join(' · ')} />
              <PtReviewRow label="Your role" value={title} sub={role === 'viewer' ? 'Sees progress' : 'Add money and see progress'} last />
            </PtPanel>
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        <PtButton title="See the wallet" onPress={() => navigation.replace('WalletDetail', { walletId })} />
        {role !== 'viewer' ? <PtButton title="Add money now" variant="ghost" onPress={() => navigation.replace('MoveMoney', { toWalletId: walletId })} /> : null}
      </View>
    </View>
  );
}
