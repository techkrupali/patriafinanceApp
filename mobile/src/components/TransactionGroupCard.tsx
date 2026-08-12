import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { formatMoney } from '../lib/format';
import { TransactionRow } from './TransactionListCard';
import type { TransactionGroupAction } from '../api/types';

interface Props {
  action: TransactionGroupAction;
  /** Loads the next page of the SAME group via the chat. */
  onShowMore?: () => void;
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function targetIcon(type: string | undefined): keyof typeof Ionicons.glyphMap {
  if (type === 'wallet') return 'wallet-outline';
  if (type === 'bank_account') return 'business-outline';
  return 'person-outline';
}

/**
 * Grouped transaction summary + list, rendered inside the assistant chat from a
 * `transaction_group` action. Reuses TransactionRow for the list. The summary is
 * the authorized grand total computed by the backend over ALL matching rows.
 */
export function TransactionGroupCard({ action, onShowMore }: Props) {
  const { summary, transactions, has_more, target } = action;

  return (
    <View className="mt-2 rounded-2xl bg-white p-4" style={shadow.soft}>
      {/* Header */}
      <View className="flex-row items-center">
        <Ionicons name={targetIcon(target?.type)} size={16} color={colors.brand} />
        <Text className="ml-1.5 flex-1 text-[13px] font-bold text-ink" numberOfLines={1}>
          {action.title}
        </Text>
      </View>

      {/* Grand-total summary */}
      <View className="mt-3 rounded-xl bg-lav-faint p-3">
        <Text className="text-2xl font-extrabold tracking-tight text-ink">
          ₦{formatMoney(summary.total_amount)}
        </Text>
        <Text className="mt-0.5 text-[12px] text-muted">
          {summary.transaction_count} transaction{summary.transaction_count === 1 ? '' : 's'} · total
        </Text>

        <View className="mt-2 flex-row" style={{ gap: 16 }}>
          <View>
            <Text className="text-[10px] text-faded">Sent</Text>
            <Text className="text-[12px] font-semibold text-ink">₦{formatMoney(summary.total_outgoing)}</Text>
          </View>
          <View>
            <Text className="text-[10px] text-faded">Received</Text>
            <Text className="text-[12px] font-semibold text-ink">₦{formatMoney(summary.total_incoming)}</Text>
          </View>
        </View>

        {summary.transaction_count > 0 ? (
          <Text className="mt-2 text-[11px] text-muted">
            {shortDate(summary.first_transaction)} → {shortDate(summary.latest_transaction)}
          </Text>
        ) : null}
      </View>

      {/* Rows */}
      {transactions.length === 0 ? (
        <Text className="mt-3 text-[13px] text-muted">No matching transactions found.</Text>
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
