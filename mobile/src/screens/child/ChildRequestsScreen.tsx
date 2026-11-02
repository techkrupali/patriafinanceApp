import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { pt, ptFont } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtPills, PtPanel } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useChildRequests, type ChildRequest } from '../../api/child';
import { formatNaira } from '../../lib/format';
import { RequestChip } from './ChildUi';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Waiting' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** "Sent today · Ngozi is looking" · "Mum: "Have fun!"" · "Approved automatically" */
function line(r: ChildRequest): string {
  if (r.status === 'pending') {
    const d = r.created_at ? new Date(r.created_at) : null;
    const today = d && d.toDateString() === new Date().toDateString();
    return `Sent ${today ? 'today' : d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''} · waiting for a parent`;
  }
  if (r.auto) return 'Approved automatically';
  if (r.reason) return r.reason;
  return r.by ? `${r.by}${r.said ? `: "${r.said}"` : r.status === 'yes' ? ' said yes' : ' said no'}` : r.status === 'yes' ? 'Approved' : 'Not this time';
}

/** CHD-05 My requests: all, waiting, yes and no — and what the parent said. */
export function ChildRequestsScreen() {
  const navigation = useNavigation();
  const q = useChildRequests();
  const [filter, setFilter] = useState('all');
  const list = (q.data ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <PtTabScreen title="My requests" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <PtPills options={FILTERS} value={filter} onChange={setFilter} />
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : list.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 20 }}>Nothing here yet.</Text>
      ) : (
        <PtPanel>
          {list.map((r, i) => (
            <View key={r.id} style={{ paddingVertical: 14, gap: 6, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{r.title}</Text>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{formatNaira(r.amount)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RequestChip r={r} />
                <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={2}>{line(r)}</Text>
              </View>
            </View>
          ))}
        </PtPanel>
      )}
    </PtTabScreen>
  );
}
