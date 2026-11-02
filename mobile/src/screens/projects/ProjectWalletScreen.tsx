import React from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject, useWalletTransactions } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtPanel } from '../../components/pt/PtForm';
import { ActivityRow } from '../../components/wallet/WalletManageUi';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatMoney, formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const SHARES = ['#0E5A44', '#1FA07A', '#5FD3A4', '#F2A93B', '#7FB8E8', '#C38BE0'];

/**
 * PJH-06 Project wallet: the balance and its account number, Add money and
 * Copy account, who put in what, and the money in and out.
 */
export function ProjectWalletScreen({ navigation, route }: RootScreenProps<'ProjectWallet'>) {
  const { projectId } = route.params;
  const me = useAuth((s) => s.user);
  const query = useProject(projectId);
  const walletId = query.data?.project.wallet_id ?? 0;
  const txns = useWalletTransactions(walletId, walletId > 0);

  if (!query.data) {
    return (
      <PtPageScreen title="Project wallet" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const p = query.data.project;
  const w = query.data.wallet;
  const account = w?.virtual_account ?? null;
  const funders = query.data.people.family.filter((f) => Number(f.put_in) > 0).sort((a, b) => Number(b.put_in) - Number(a.put_in));
  const total = Number(query.data.people.put_in_total ?? 0);
  const rows = (txns.data?.pages.flatMap((pg) => pg.transactions) ?? []).slice(0, 15);
  const myRole = query.data.my_role;
  const canAdd = myRole !== 'viewer';

  return (
    <PtPageScreen title="Project wallet" subtitle={p.title} onBack={() => navigation.goBack()}>
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 6 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Balance</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 32, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatMoney(p.in_wallet)}</Text>
        {account ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.onDarkMuted }}>
            {`Account ${account.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}${w?.virtual_account_bank ? ` · ${w.virtual_account_bank}` : ''} · Patriai / ${p.title}`}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PtButton title="Add money" disabled={!canAdd} onPress={() => navigation.navigate('MoveMoney', { toWalletId: p.wallet_id })} />
        </View>
        <View style={{ flex: 1 }}>
          <PtButton
            title="Copy account"
            variant="mint"
            disabled={!account}
            onPress={async () => {
              await Clipboard.setStringAsync(account ?? '');
              notifySuccess();
              showAlert('Copied', `${account} — anyone can pay into the project from their bank.`);
            }}
          />
        </View>
      </View>

      {total > 0 ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>{`Who put in what · ${formatNaira(total)}`}</PtGroupLabel>
          <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
            {funders.map((f, i) => (
              <View key={f.id} style={{ flex: Number(f.put_in) / total, backgroundColor: SHARES[i % SHARES.length] }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8 }}>
            {funders.map((f, i) => (
              <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: SHARES[i % SHARES.length] }} />
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`${f.id === me?.id ? 'You' : f.first_name} ${formatNaira(f.put_in)}`}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {rows.length ? (
        <PtPanel>
          {rows.map((t, i) => (
            <ActivityRow key={t.id} t={t} myId={me?.id} last={i === rows.length - 1} />
          ))}
        </PtPanel>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 12 }}>No money in or out yet.</Text>
      )}
    </PtPageScreen>
  );
}
