import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPills, PtNote } from '../../components/pt/PtForm';
import { PtCard } from '../../components/pt/PtList';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtButton } from '../../components/pt/PtButton';
import { LoadError } from '../../components/LoadError';
import { HeaderIcon, stampLabel } from '../../components/wallet/WalletManageUi';
import { useWallet } from '../../api/hooks';
import { useAuditLog, type AuditCategory } from '../../api/walletManage';
import type { RootScreenProps } from '../../navigation/types';

/**
 * WAL-14 Audit log: every change, who made it, when and from which device —
 * Everything · Rules · Members · Approvals. Nobody can edit or delete it.
 * Export opens the statement with the log included (WAL-15).
 */
export function WalletAuditLogScreen({ navigation, route }: RootScreenProps<'WalletAuditLog'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const [category, setCategory] = useState<AuditCategory>('all');
  const log = useAuditLog(walletId, category);
  const rows = log.data?.pages.flatMap((p) => p.audit_log) ?? [];
  const tones = new Map<number, (typeof AVATAR_CYCLE)[number]>();
  const toneFor = (id: number | undefined) => {
    if (id === undefined) return 'deep' as const;
    if (!tones.has(id)) tones.set(id, AVATAR_CYCLE[tones.size % AVATAR_CYCLE.length]);
    return tones.get(id)!;
  };

  return (
    <PtPageScreen
      title="Audit log"
      subtitle={detail.data?.wallet.name}
      onBack={() => navigation.goBack()}
      right={<HeaderIcon icon="download" label="Export" onPress={() => navigation.navigate('WalletStatement', { walletId, audit: true })} />}
    >
      <PtPills
        compact
        options={[
          { value: 'all', label: 'Everything' },
          { value: 'rules', label: 'Rules' },
          { value: 'members', label: 'Members' },
          { value: 'approvals', label: 'Approvals' },
        ]}
        value={category}
        onChange={setCategory}
      />

      {log.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : log.error ? (
        <LoadError message={(log.error as Error).message} onRetry={() => void log.refetch()} />
      ) : rows.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, textAlign: 'center', paddingVertical: 24 }}>Nothing here yet.</Text>
      ) : (
        <PtCard>
          {rows.map((r, i) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <PtAvatar initials={r.actor?.initials ?? 'P'} tone={toneFor(r.actor?.id)} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{r.title ?? r.description}</Text>
                {r.detail ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{r.detail}</Text> : null}
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.inkSubtle }}>
                  {[stampLabel(r.created_at), r.device].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          ))}
        </PtCard>
      )}
      {log.hasNextPage ? <PtButton title="Show more" variant="ghost" loading={log.isFetchingNextPage} onPress={() => void log.fetchNextPage()} /> : null}

      <PtNote tone="info" icon="lock">
        Nobody can edit or delete this log, including owners.
      </PtNote>
    </PtPageScreen>
  );
}
