import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPills } from '../../components/pt/PtForm';
import { PtCard, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { LoadError } from '../../components/LoadError';
import { ActivityRow, HeaderIcon, monthHeading, stampLabel } from '../../components/wallet/WalletManageUi';
import { useWallet } from '../../api/hooks';
import { useAuditLog, useWalletActivity, useWalletRequests, type ActivityFilter } from '../../api/walletManage';
import { useAuth } from '../../store/auth';
import { formatNaira } from '../../lib/format';
import type { ApprovalRequest, Transaction } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const STATUS_CHIP: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  executed: { label: 'Paid', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Groups rows by the month they happened in, newest first. */
function byMonth<T>(rows: T[], when: (row: T) => string | null): { month: string; rows: T[] }[] {
  const groups: { month: string; rows: T[] }[] = [];
  for (const row of rows) {
    const month = monthHeading(when(row));
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}

/**
 * WAL-03 Activity: All · Money in · Money out · Requests · Rule changes, what
 * came in this month and since the start, and everything by month. The
 * download icon opens the statement (WAL-15).
 */
export function WalletActivityScreen({ navigation, route }: RootScreenProps<'WalletActivity'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const detail = useWallet(walletId);
  const role = detail.data?.my_role;
  const governs = role === 'owner' || role === 'co_owner';
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const money = filter === 'all' || filter === 'in' || filter === 'out';
  const all = useWalletActivity(walletId, null, filter === 'all');
  const moneyIn = useWalletActivity(walletId, 'credit', filter === 'in');
  const moneyOut = useWalletActivity(walletId, 'debit', filter === 'out');
  const txns = filter === 'in' ? moneyIn : filter === 'out' ? moneyOut : all;
  const requests = useWalletRequests(walletId, filter === 'requests');
  const rules = useAuditLog(walletId, 'rules', filter === 'rules' && governs);

  const rows = useMemo(() => txns.data?.pages.flatMap((p) => p.transactions) ?? [], [txns.data]);
  const summary = all.data?.pages[0]?.summary ?? txns.data?.pages[0]?.summary;
  const ruleRows = rules.data?.pages.flatMap((p) => p.audit_log) ?? [];

  const pills: { value: ActivityFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'in', label: 'Money in' },
    { value: 'out', label: 'Money out' },
    { value: 'requests', label: 'Requests' },
    ...(governs ? [{ value: 'rules' as const, label: 'Rule changes' }] : []),
  ];

  const empty = (text: string) => (
    <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, textAlign: 'center', paddingVertical: 24 }}>{text}</Text>
  );

  const requestRow = (r: ApprovalRequest, i: number, n: number) => {
    const chip = STATUS_CHIP[r.status] ?? STATUS_CHIP.pending;
    const who = r.initiator?.id === me?.id ? 'You' : (r.initiator?.name ?? 'Someone').split(' ')[0];
    return (
      <PtRow
        key={r.id}
        minHeight={68}
        last={i === n - 1}
        left={<PtAvatar initials={who === 'You' ? 'Y' : who.charAt(0)} tone="mint" size={36} />}
        title={r.governance ? (r.description ?? 'A change') : `${who} asked for ${formatNaira(r.amount)}`}
        subtitle={[r.governance ? who : r.description, stampLabel(r.created_at)].filter(Boolean).join(' · ')}
        right={<PtChip label={chip.label} tone={chip.tone} />}
        onPress={() => navigation.navigate('ApprovalDetail', { approvalId: r.id })}
      />
    );
  };

  return (
    <PtPageScreen
      title="Activity"
      subtitle={detail.data?.wallet.name}
      onBack={() => navigation.goBack()}
      right={<HeaderIcon icon="download" label="Download statement" onPress={() => navigation.navigate('WalletStatement', { walletId })} />}
    >
      <PtPills compact options={pills} value={filter} onChange={setFilter} />

      {summary ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>In this month</Text>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 19, color: pt.ink }} numberOfLines={1} adjustsFontSizeToFit>
              {formatNaira(summary.in_this_month)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>In since start</Text>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 19, color: pt.ink }} numberOfLines={1} adjustsFontSizeToFit>
              {formatNaira(summary.in_since_start)}
            </Text>
          </View>
        </View>
      ) : null}

      {money ? (
        txns.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
        ) : txns.error ? (
          <LoadError message={(txns.error as Error).message} onRetry={() => void txns.refetch()} />
        ) : rows.length === 0 ? (
          empty(filter === 'out' ? 'Nothing has gone out yet.' : filter === 'in' ? 'No money in yet.' : 'No money in or out yet. Add money to get started.')
        ) : (
          <>
            {byMonth<Transaction>(rows, (t) => t.created_at).map((g) => (
              <View key={g.month} style={{ gap: 10 }}>
                <PtSectionTitle title={g.month} />
                <PtCard>
                  {g.rows.map((t, i) => (
                    <ActivityRow key={t.id} t={t} myId={me?.id} last={i === g.rows.length - 1} />
                  ))}
                </PtCard>
              </View>
            ))}
            {txns.hasNextPage ? <PtButton title="Show more" variant="ghost" loading={txns.isFetchingNextPage} onPress={() => void txns.fetchNextPage()} /> : null}
          </>
        )
      ) : filter === 'requests' ? (
        requests.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
        ) : requests.error ? (
          <LoadError message={(requests.error as Error).message} onRetry={() => void requests.refetch()} />
        ) : !requests.data?.length ? (
          empty('No requests yet. When someone asks to take money out or change the rules, it shows here.')
        ) : (
          byMonth<ApprovalRequest>(requests.data, (r) => r.created_at).map((g) => (
            <View key={g.month} style={{ gap: 10 }}>
              <PtSectionTitle title={g.month} />
              <PtCard>{g.rows.map((r, i) => requestRow(r, i, g.rows.length))}</PtCard>
            </View>
          ))
        )
      ) : rules.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : rules.error ? (
        <LoadError message={(rules.error as Error).message} onRetry={() => void rules.refetch()} />
      ) : ruleRows.length === 0 ? (
        empty('No rule changes yet.')
      ) : (
        byMonth(ruleRows, (r) => r.created_at).map((g) => (
          <View key={g.month} style={{ gap: 10 }}>
            <PtSectionTitle title={g.month} />
            <PtCard>
              {g.rows.map((r, i) => (
                <PtRow
                  key={r.id}
                  minHeight={68}
                  last={i === g.rows.length - 1}
                  left={<PtAvatar initials={r.actor?.initials ?? 'P'} tone="mint" size={36} />}
                  title={r.title ?? r.description}
                  subtitle={[r.detail, stampLabel(r.created_at)].filter(Boolean).join(' · ')}
                />
              ))}
            </PtCard>
          </View>
        ))
      )}
    </PtPageScreen>
  );
}
