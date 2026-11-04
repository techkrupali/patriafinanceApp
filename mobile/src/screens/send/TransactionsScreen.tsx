import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtPanel } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { LoadError } from '../../components/LoadError';
import { useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useTransactions, type TxnRow, type TxnWaiting } from '../../api/payments';
import { useMoneyRequests } from '../../api/requests';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const DATES = [
  { value: 'all', label: 'Any date' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
] as const;
type DateKey = (typeof DATES)[number]['value'];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function fromFor(k: DateKey): string | undefined {
  const d = new Date();
  if (k === 'week') d.setDate(d.getDate() - 6);
  else if (k === 'month') d.setDate(1);
  else if (k === 'year') d.setMonth(0, 1);
  else return undefined;
  return ymd(d);
}

/** "TODAY" · "YESTERDAY" · "MON 26 OCT" */
function dayLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
const time = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
};

function Line({ title, sub, amount, credit, status, onPress, last }: { title: string; sub: string; amount: string; credit: boolean; status?: 'waiting' | 'failed' | 'pending' | null; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: credit ? pt.brandSoft : pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={credit ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={credit ? pt.brand : pt.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: status === 'failed' ? pt.inkMuted : credit ? pt.brand : pt.ink, textDecorationLine: status === 'failed' ? 'line-through' : 'none' }}>
          {`${credit ? '+' : '−'}${formatNaira(amount)}`}
        </Text>
        {status ? (
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 12, color: status === 'failed' ? pt.danger : '#8F5400' }}>{status === 'waiting' ? 'Waiting' : status === 'failed' ? 'Failed' : 'Processing'}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * TXN-01 Transactions, all wallets: what went out in the last 7 days against
 * the week before, a bar per day, search, filters by wallet, date and money in
 * or out, requests still waiting for a yes, then every payment by day.
 */
export function TransactionsScreen({ navigation, route }: RootScreenProps<'Activity'>) {
  const wallets = useWallets();
  const me = useAuth((s) => s.user);
  const [walletId, setWalletId] = useState<number | undefined>(route.params?.walletId);
  const [date, setDate] = useState<DateKey>('all');
  const [direction, setDirection] = useState<'credit' | 'debit' | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [sheet, setSheet] = useState<'wallet' | 'date' | 'kind' | null>(null);
  const q = useTransactions({ wallet_id: walletId, from: fromFor(date), direction, page });
  const [older, setOlder] = useState<TxnRow[]>([]);
  const wallet = (wallets.data ?? []).find((w) => w.id === walletId);

  const rows = useMemo(() => {
    const all = [...older, ...(q.data?.transactions ?? [])].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    const t = term.trim().toLowerCase();
    return t ? all.filter((r) => [r.title, r.description ?? '', r.wallet?.name ?? '', r.category ?? '', r.reference].some((v) => v.toLowerCase().includes(t))) : all;
  }, [older, q.data, term]);
  const groups = useMemo(() => {
    // One heading per day, even if a later page brings more of an earlier day.
    const out = new Map<string, TxnRow[]>();
    for (const r of rows) {
      const label = dayLabel(r.created_at);
      out.set(label, [...(out.get(label) ?? []), r]);
    }
    return [...out].map(([label, list]) => ({ label, rows: list }));
  }, [rows]);
  const week = q.data?.week;
  const max = Math.max(1, ...(week?.days ?? []).map((d) => parseFloat(d.out)));
  const reset = () => { setPage(1); setOlder([]); };
  const waiting: TxnWaiting[] = q.data?.waiting ?? [];
  // REQ-03: money people asked you for, and what you asked for that's still to come.
  const requests = useMoneyRequests();
  const open = [...(requests.data?.to_me ?? []), ...(requests.data?.sent ?? [])].filter((r) => r.status === 'pending' && !(r.mine && r.split));
  // SPL-01: a bill you split shows once, with what's still to come back.
  const splits = Object.values(
    (requests.data?.sent ?? []).filter((r) => r.split).reduce<Record<string, { key: string; title: string; left: number; waiting: number }>>((acc, r) => {
      const s = (acc[r.split!.key] ??= { key: r.split!.key, title: r.split!.title, left: 0, waiting: 0 });
      if (r.status === 'pending') {
        s.left += parseFloat(r.left);
        s.waiting += 1;
      }
      return acc;
    }, {}),
  ).filter((s) => s.waiting > 0);

  return (
    <PtPageScreen title="Transactions" subtitle={wallet?.name ?? 'All wallets'} onBack={() => navigation.goBack()}>
      {week ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.lg, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Out in the last 7 days</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, color: pt.ink }}>{formatNaira(week.out)}</Text>
            </View>
            {week.change_percent !== null ? (
              <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: week.change_percent <= 0 ? pt.brand : pt.danger }}>
                {`${Math.abs(week.change_percent)}% ${week.change_percent <= 0 ? 'less' : 'more'} than last week`}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 86 }} accessibilityLabel="Money out per day, last 7 days">
            {week.days.map((d, i) => {
              const v = parseFloat(d.out);
              const top = v === max && v > 0;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: '100%', height: Math.max(3, (v / max) * 64), borderRadius: 6, backgroundColor: v ? (top ? pt.emerald700 : pt.emerald300) : pt.line }} />
                  <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.inkMuted }}>{d.day.slice(0, 2)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, paddingHorizontal: 14 }}>
        <Feather name="search" size={18} color={pt.inkMuted} />
        <TextInput value={term} onChangeText={setTerm} placeholder="Search payments, people, notes" placeholderTextColor={pt.inkSubtle} accessibilityLabel="Search transactions" style={{ flex: 1, paddingVertical: 14, fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          { key: 'all', label: 'All', on: !walletId && date === 'all' && !direction, press: () => { setWalletId(undefined); setDate('all'); setDirection(undefined); reset(); } },
          { key: 'wallet', label: wallet ? wallet.name : 'Wallet ▾', on: Boolean(walletId), press: () => setSheet('wallet') },
          { key: 'date', label: date === 'all' ? 'Date ▾' : DATES.find((d) => d.value === date)!.label, on: date !== 'all', press: () => setSheet('date') },
          { key: 'kind', label: direction === 'credit' ? 'Money in' : direction === 'debit' ? 'Money out' : 'In or out ▾', on: Boolean(direction), press: () => setSheet('kind') },
        ].map((c) => (
          <Pressable key={c.key} onPress={() => { selection(); c.press(); }} accessibilityRole="button" style={{ borderRadius: 999 }}>
            {/* Fill on a View so it shows on every Android phone. */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: c.on ? pt.emerald900 : pt.lineStrong, backgroundColor: c.on ? pt.emerald900 : 'transparent' }}>
              <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: c.on ? '#FFFFFF' : pt.ink }}>{c.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {q.isLoading && page === 1 ? <ActivityIndicator color={pt.brand} /> : q.error ? <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} /> : null}

      {waiting.length && !term ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Waiting for a yes</PtGroupLabel>
          <PtPanel>
            {waiting.map((w, i) => (
              <Line key={`w${w.approval_id}`} title={w.title} sub={`${w.waiting_on.length ? `Needs ${w.waiting_on.map((n) => (n === me?.first_name ? 'you' : n)).join(', ')}` : 'Waiting'} · ${time(w.created_at)}`} amount={w.amount} credit={false} status="waiting" onPress={() => navigation.navigate('ApprovalDetail', { approvalId: w.approval_id })} last={i === waiting.length - 1} />
            ))}
          </PtPanel>
        </View>
      ) : null}

      {(open.length || splits.length) && !term && page === 1 ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Requests</PtGroupLabel>
          <PtPanel>
            {open.map((r, i) => (
              <Line
                key={`r${r.code}`}
                title={r.mine ? `You asked ${(r.payer.name ?? '').split(' ')[0]}${r.note ? ` · ${r.note}` : ''}` : `${r.requester.first_name} asked you${r.note ? ` · ${r.note}` : ''}`}
                sub={[r.mine ? `Into ${r.wallet.name}` : 'Pay or decline', r.due_on ? `due ${new Date(r.due_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ')}
                amount={r.left}
                credit={r.mine}
                status="waiting"
                onPress={() => navigation.navigate('IncomingRequest', { code: r.code })}
                last={i === open.length - 1 && !splits.length}
              />
            ))}
            {splits.map((s, i) => (
              <Line
                key={`s${s.key}`}
                title={`Split · ${s.title}`}
                sub={`${s.waiting} still to pay you back`}
                amount={String(s.left)}
                credit
                status="waiting"
                onPress={() => navigation.navigate('SplitBill', { key: s.key })}
                last={i === splits.length - 1}
              />
            ))}
          </PtPanel>
        </View>
      ) : null}

      {groups.map((g) => (
        <View key={g.label} style={{ gap: 10 }}>
          <PtGroupLabel>{g.label}</PtGroupLabel>
          <PtPanel>
            {g.rows.map((r, i) => (
              <Line
                key={r.id}
                title={r.description && r.direction === 'debit' && !/^(Transfer to|Withdrawal to|Transfer from)/.test(r.description) ? `${r.counterparty_name ?? r.title.replace(/^To /, '')} · ${r.description}` : r.title}
                sub={[r.category, r.wallet?.name, time(r.created_at)].filter(Boolean).join(' · ')}
                amount={r.amount}
                credit={r.direction === 'credit'}
                status={r.status === 'failed' ? 'failed' : r.status === 'pending' ? 'pending' : null}
                onPress={() => navigation.navigate('TransactionDetail', { id: r.id })}
                last={i === g.rows.length - 1}
              />
            ))}
          </PtPanel>
        </View>
      ))}

      {q.data && !rows.length && !waiting.length ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center', paddingVertical: 16 }}>{term ? 'Nothing matches that search.' : 'No transactions here yet.'}</Text>
      ) : null}
      {q.data && q.data.pagination.page < q.data.pagination.last_page && !term ? (
        <PtButton title="Show more" variant="secondary" loading={q.isFetching} onPress={() => { setOlder(rows); setPage((p) => p + 1); }} />
      ) : null}

      <PtOptionSheet visible={sheet === 'wallet'} title="Wallet" options={[{ value: 0, label: 'All wallets' }, ...(wallets.data ?? []).map((w) => ({ value: w.id, label: w.name }))]} value={walletId ?? 0} onPick={(v) => { setWalletId(v || undefined); reset(); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'date'} title="Date" options={DATES.map((d) => ({ value: d.value, label: d.label }))} value={date} onPick={(v) => { setDate(v); reset(); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'kind'} title="Money in or out" options={[{ value: 'both', label: 'Both' }, { value: 'credit', label: 'Money in' }, { value: 'debit', label: 'Money out' }]} value={direction ?? 'both'} onPick={(v) => { setDirection(v === 'both' ? undefined : (v as 'credit' | 'debit')); reset(); setSheet(null); }} onClose={() => setSheet(null)} />
    </PtPageScreen>
  );
}
