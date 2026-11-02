import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtIconTile } from '../../components/pt/PtList';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useChangeScheduledPayment, useScheduledPayments, type ScheduledItem } from '../../api/scheduled';
import { formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const LAST: Record<NonNullable<ScheduledItem['last_result']>, string> = {
  sent: 'Sent',
  approval: 'Sent for approval',
  processing: 'Processing at the bank',
  skipped: 'Skipped',
  failed: "Didn't go through",
};

/** "Sat 7 Nov, 7:00 am" */
function onLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}, ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/**
 * SND-15 Scheduled payments: what goes out in the next 30 days — repeat
 * payments, giving and a goal's payout — each with when, from where, and
 * whether the wallet will be short. A repeat payment can be paused or cancelled.
 */
export function ScheduledPaymentsScreen({ navigation }: RootScreenProps<'ScheduledPayments'>) {
  const q = useScheduledPayments();
  const change = useChangeScheduledPayment();
  const [open, setOpen] = useState<ScheduledItem | null>(null);
  const items = q.data?.items ?? [];
  const shortOne = items.find((i) => i.short);

  const tap = (i: ScheduledItem) => {
    selection();
    if (i.kind === 'payment') setOpen(i);
    else if (i.wallet_id) navigation.navigate('WalletDetail', { walletId: i.wallet_id });
  };

  const act = (status: 'active' | 'paused' | 'cancelled') =>
    open &&
    change.mutate(
      { id: open.id, status },
      {
        onSuccess: () => {
          notifySuccess();
          setOpen(null);
        },
        onError: (e) => showAlert('Not changed', e.message),
      },
    );

  return (
    <PtPageScreen title="Scheduled payments" subtitle={q.data ? `${formatNaira(q.data.next_30_days)} goes out in the next 30 days` : null} onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : !items.length ? (
        <PtNote tone="info">Nothing scheduled yet. When you send money, choose "Repeat this payment" to set one up.</PtNote>
      ) : (
        <>
          <PtPanel>
            {items.map((i, n) => (
              <Pressable
                key={`${i.kind}-${i.id}`}
                onPress={() => tap(i)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 10, borderBottomWidth: n === items.length - 1 ? 0 : 1, borderBottomColor: pt.line, opacity: i.paused ? 0.6 : 1 }}
              >
                <PtIconTile>
                  <Feather name={i.paused ? 'pause' : 'repeat'} size={18} color={pt.brand} />
                </PtIconTile>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{i.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                    {[i.paused ? 'Paused' : i.when, i.kind !== 'giving' && i.from.name ? `from ${i.from.name}` : null].filter(Boolean).join(' · ')}
                    {i.short ? <Text style={{ color: pt.danger }}>{` · ${formatNaira(i.short)} short`}</Text> : null}
                    {!i.short && i.last_result === 'failed' ? <Text style={{ color: pt.danger }}>{" · last one didn't go"}</Text> : null}
                  </Text>
                </View>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{formatNaira(i.amount)}</Text>
              </Pressable>
            ))}
          </PtPanel>
          <PtNote tone="warning" icon="info">
            {"Scheduled payments still follow each wallet's approval rules."}
            {shortOne ? (
              <Text
                onPress={() => shortOne.from.id && navigation.navigate('BankTransfer', { walletId: shortOne.from.id })}
                style={{ fontFamily: ptFont.bold, color: pt.brand, textDecorationLine: 'underline' }}
                accessibilityRole="link"
              >
                {` ${q.data?.short_count} ${q.data?.short_count === 1 ? 'is' : 'are'} short of money`}
              </Text>
            ) : null}
            {shortOne ? '.' : ''}
          </PtNote>
        </>
      )}

      <PtSheet
        visible={open !== null}
        title={open?.title ?? ''}
        subtitle={open ? `${formatNaira(open.amount)} · ${open.when}` : undefined}
        onClose={() => setOpen(null)}
        footer={
          <View style={{ gap: 4 }}>
            <PtButton title={open?.paused ? 'Turn back on' : 'Pause'} variant="secondary" loading={change.isPending} onPress={() => act(open?.paused ? 'active' : 'paused')} />
            <PtButton
              title="Cancel this payment"
              variant="ghost"
              onPress={() =>
                showAlert('Cancel this payment?', 'Nothing more will be sent. Payments already sent stay sent.', [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel payment', style: 'destructive', onPress: () => act('cancelled') },
                ])
              }
            />
          </View>
        }
      >
        {open ? (
          <PtPanel>
            <PtReviewRow label="From" value={open.from.name ?? '—'} sub={open.short ? `${formatNaira(open.short)} short on the day` : null} />
            <PtReviewRow label="Next" value={open.paused ? 'Paused' : onLabel(open.next_on)} sub={open.approval ? 'Needs approval before it goes' : null} />
            <PtReviewRow label="Last time" value={open.last_result ? LAST[open.last_result] : 'Not yet'} sub={open.last_reason} last />
          </PtPanel>
        ) : null}
      </PtSheet>
    </PtPageScreen>
  );
}
