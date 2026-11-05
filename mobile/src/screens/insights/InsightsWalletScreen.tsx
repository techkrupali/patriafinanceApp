import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { useStatementWallets, useWalletReport } from '../../api/insights';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { Empty, HeaderIcon, Loaded, StatPair } from './parts';

/**
 * INS-03 Wallet report: one wallet since it opened — balance, what was put in
 * and paid out, who put in most and how approvals went — and a download.
 */
export function InsightsWalletScreen({ navigation, route }: RootScreenProps<'InsightsWallet'>) {
  const wallets = useStatementWallets();
  const list = wallets.data?.wallets ?? [];
  const [picked, setPicked] = useState<number | null>(route.params?.walletId ?? null);
  const [choosing, setChoosing] = useState(false);
  const walletId = picked ?? list.find((w) => w.type !== 'main' && w.status !== 'closed')?.id ?? list[0]?.id ?? null;
  const q = useWalletReport(walletId);
  const d = q.data;

  const block = (label: string, value: string, sub?: string | null, last = false) => (
    <View style={{ paddingVertical: 12, gap: 2, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{label}</Text>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 23, color: pt.ink }}>{value}</Text>
      {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{sub}</Text> : null}
    </View>
  );

  return (
    <PtPageScreen
      title="Wallet report"
      subtitle={d ? `${d.wallet.name} · since ${d.since_label}` : null}
      onBack={() => navigation.goBack()}
      right={list.length > 1 ? <HeaderIcon icon="repeat" label="Choose another wallet" onPress={() => setChoosing(true)} /> : undefined}
    >
      <Loaded query={walletId === null ? wallets : q}>
        {() =>
          walletId === null ? (
            <Empty icon="briefcase" title="No wallets yet" body="Open a wallet and its report shows here." />
          ) : d ? (
            <>
              <StatPair
                dark={{ label: 'Balance', value: formatNaira(d.balance), note: d.balance_note }}
                light={{ label: 'Put in', value: formatNaira(d.put_in), note: `${d.months} month${d.months === 1 ? '' : 's'}` }}
              />
              <PtCard>
                {block(
                  'Paid out',
                  formatNaira(d.paid_out),
                  d.biggest_out ? `Biggest: ${d.biggest_out.description} · ${formatNaira(d.biggest_out.amount)}` : 'Nothing paid out yet',
                  !d.biggest_contributor && !d.approvals,
                )}
                {d.biggest_contributor ? block('Biggest contributor', `${d.biggest_contributor.name} · ${d.biggest_contributor.percent}%`, null, !d.approvals) : null}
                {d.approvals
                  ? block(
                      'Approvals',
                      [
                        `${d.approvals.count} request${d.approvals.count === 1 ? '' : 's'}`,
                        `${d.approvals.approved} approved`,
                        d.approvals.declined ? `${d.approvals.declined} declined` : null,
                        d.approvals.avg_hours !== null ? `avg ${d.approvals.avg_hours < 1 ? 'under an hour' : `${d.approvals.avg_hours} hour${d.approvals.avg_hours === 1 ? '' : 's'}`}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                      d.approvals.waiting ? `${d.approvals.waiting} waiting now` : null,
                      true,
                    )
                  : null}
              </PtCard>
              <PtCard>
                <PtRow
                  title="Download this report"
                  subtitle="PDF or spreadsheet"
                  left={<PtIconTile><Feather name="download" size={18} color={pt.brand} /></PtIconTile>}
                  chevron
                  last
                  onPress={() => navigation.navigate('WalletStatement', { walletId: d.wallet.id })}
                />
              </PtCard>
            </>
          ) : null
        }
      </Loaded>

      <PtOptionSheet
        visible={choosing}
        title="Which wallet?"
        options={list.map((w) => ({ value: w.id, label: w.name, hint: w.status === 'closed' ? 'Closed' : formatNaira(w.balance) }))}
        value={walletId}
        onPick={(id) => {
          setPicked(id);
          setChoosing(false);
        }}
        onClose={() => setChoosing(false)}
      />
    </PtPageScreen>
  );
}
