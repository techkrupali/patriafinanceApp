import React, { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtNote, PtPills } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { useStatementMonths, useStatementWallets, type StatementMonth } from '../../api/insights';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';
import { HeaderIcon, Loaded, dayMonth } from './parts';

type Pick = number | 'all' | 'more';

/**
 * INS-07 Statements: Main, All wallets or one wallet, then a statement for each
 * month (this one "in progress") and each full year before. "+" makes
 * statements for several wallets at once (STM-01).
 */
export function StatementsScreen({ navigation, route }: RootScreenProps<'Statements'>) {
  const wallets = useStatementWallets();
  const list = wallets.data?.wallets ?? [];
  const main = list.find((w) => w.type === 'main') ?? list[0];
  const [picked, setPicked] = useState<number | 'all' | null>(route.params?.wallet ?? null);
  const [more, setMore] = useState(false);
  const current: number | 'all' = picked ?? main?.id ?? 'all';
  const months = useStatementMonths(current);
  const name = current === 'all' ? 'All wallets' : list.find((w) => w.id === current)?.name;

  // Main, All wallets, a few more of yours, and "More" for the rest.
  const others = list.filter((w) => w.id !== main?.id && w.status !== 'closed');
  const shown = others.slice(0, 3);
  const extra = typeof current === 'number' && current !== main?.id && !shown.some((w) => w.id === current) ? list.find((w) => w.id === current) : undefined;
  const pills: { value: Pick; label: string }[] = [
    ...(main ? [{ value: main.id as Pick, label: main.type === 'main' ? 'Main' : main.name }] : []),
    { value: 'all', label: 'All wallets' },
    ...shown.map((w) => ({ value: w.id as Pick, label: w.name })),
    ...(extra ? [{ value: extra.id as Pick, label: extra.name }] : []),
    ...(list.length > shown.length + 1 ? [{ value: 'more' as Pick, label: 'More…' }] : []),
  ];

  const open = (m: StatementMonth) => {
    if (current === 'all') navigation.navigate('StatementsPick', { walletIds: list.filter((w) => w.status !== 'closed').map((w) => w.id), from: m.from, to: m.to });
    else navigation.navigate('WalletStatement', { walletId: current, from: m.from, to: m.to });
  };

  return (
    <PtPageScreen
      title="Statements"
      subtitle={name}
      onBack={() => navigation.goBack()}
      right={<HeaderIcon icon="plus" label="Statements for several wallets" onPress={() => navigation.navigate('StatementsPick')} />}
    >
      <Loaded query={wallets}>
        {() => (
          <>
            <PtPills
              compact
              options={pills}
              value={current}
              onChange={(v) => {
                if (v === 'more') setMore(true);
                else setPicked(v);
              }}
            />
            <Loaded query={months}>
              {() => {
                const rows = [...(months.data?.months ?? []), ...(months.data?.years ?? [])];
                return (
                  <PtCard>
                    {rows.map((m, i) => (
                      <PtRow
                        key={m.key}
                        title={m.label}
                        subtitle={
                          m.in_progress
                            ? `In progress · ready ${dayMonth(m.ready_on)}`
                            : m.key.length === 4
                              ? `For tax and visa applications · ${m.count} transaction${m.count === 1 ? '' : 's'}`
                              : `${m.count} transaction${m.count === 1 ? '' : 's'}`
                        }
                        left={<PtIconTile><Feather name="file-text" size={18} color={pt.brand} /></PtIconTile>}
                        chevron
                        last={i === rows.length - 1}
                        onPress={() => open(m)}
                      />
                    ))}
                  </PtCard>
                );
              }}
            </Loaded>
            <PtNote tone="info">Each statement shows the account number, the opening and closing balance and every payment with its date.</PtNote>
            <PtCard>
              <PtRow
                title="Export and sync"
                subtitle="Send your records elsewhere"
                left={<PtIconTile><Feather name="share" size={18} color={pt.brand} /></PtIconTile>}
                chevron
                last
                onPress={() => navigation.navigate('ExportSync')}
              />
            </PtCard>
            <View />
          </>
        )}
      </Loaded>

      <PtOptionSheet
        visible={more}
        title="Which wallet?"
        options={list.map((w) => ({ value: w.id, label: w.name, hint: w.status === 'closed' ? 'Closed' : formatNaira(w.balance) }))}
        value={typeof current === 'number' ? current : null}
        onPick={(id) => {
          setPicked(id);
          setMore(false);
        }}
        onClose={() => setMore(false)}
      />
    </PtPageScreen>
  );
}
