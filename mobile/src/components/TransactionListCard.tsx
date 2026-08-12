import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { formatMoney } from '../lib/format';
import type { AssistantTransactionRow, TransactionListAction } from '../api/types';

interface Props {
  action: TransactionListAction;
  /** Called when the user taps "Show more" (loads the next page via the chat). */
  onShowMore?: () => void;
}

/** Colour + label for a transaction status chip, using existing theme tokens. */
function statusChip(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'successful':
      return { bg: colors.successSoft, fg: colors.success };
    case 'failed':
    case 'reversed':
      return { bg: colors.dangerSoft, fg: colors.danger };
    default: // pending, etc.
      return { bg: colors.lavFaint, fg: colors.muted };
  }
}

const humanType = (t: string) =>
  t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function TransactionRow({ t }: { t: AssistantTransactionRow }) {
  const credit = t.direction === 'credit';
  const chip = statusChip(t.status);
  const meta = [shortDate(t.date), t.wallet].filter(Boolean).join(' · ');

  return (
    <View className="flex-row items-center py-2.5">
      <View className="flex-1 pr-3">
        <Text className="text-[14px] font-semibold text-ink" numberOfLines={1}>
          {t.recipient || humanType(t.type)}
        </Text>
        <Text className="mt-0.5 text-[12px] text-muted" numberOfLines={1}>
          {humanType(t.type)}
          {meta ? ` · ${meta}` : ''}
        </Text>
        {t.reference ? (
          <Text className="mt-0.5 text-[10px] text-faded" numberOfLines={1}>
            {t.reference}
          </Text>
        ) : null}
      </View>

      <View className="items-end">
        <Text
          className="text-[14px] font-bold"
          style={{ color: credit ? colors.brand : colors.ink }}
        >
          {credit ? '+' : '−'}₦{formatMoney(t.amount)}
        </Text>
        <View className="mt-1 rounded-full px-2 py-0.5" style={{ backgroundColor: chip.bg }}>
          <Text className="text-[10px] font-semibold" style={{ color: chip.fg }}>
            {t.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Compact, native transaction list rendered inside the assistant chat from a
 * `transaction_list` action. All data comes from the authorized find_transactions
 * result — this component only presents it.
 */
export function TransactionListCard({ action, onShowMore }: Props) {
  const { summary, transactions, has_more } = action;

  return (
    <View className="mt-2 rounded-2xl bg-white p-4" style={shadow.soft}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-bold text-ink">{action.title}</Text>
        {summary.total_amount ? (
          <Text className="text-[12px] text-muted">
            {summary.count} shown · ₦{formatMoney(summary.total_amount)}
          </Text>
        ) : (
          <Text className="text-[12px] text-muted">{summary.count} shown</Text>
        )}
      </View>

      {transactions.length === 0 ? (
        <Text className="mt-3 text-[13px] text-muted">No transactions found.</Text>
      ) : (
        <View className="mt-1">
          {transactions.map((t, i) => (
            <View
              key={t.id}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.lavFaint } : undefined}
            >
              <TransactionRow t={t} />
            </View>
          ))}
        </View>
      )}

      {has_more ? (
        <Pressable
          onPress={onShowMore}
          className="mt-2 flex-row items-center justify-center rounded-full bg-lav-faint py-2.5 active:opacity-80"
        >
          <Text className="text-[13px] font-semibold text-navy">Show more</Text>
          <Ionicons name="chevron-down" size={15} color={colors.navy} style={{ marginLeft: 4 }} />
        </Pressable>
      ) : null}
    </View>
  );
}
