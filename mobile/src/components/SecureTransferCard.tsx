import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { PinSheet } from './PinSheet';
import { colors, shadow } from '../theme';
import { useTransfer } from '../api/hooks';
import { isPendingApproval, type SecureTransferAction } from '../api/types';

interface Props {
  action: SecureTransferAction;
  /** Called with a short status line once the transfer resolves (for the chat). */
  onResult?: (message: string) => void;
}

/**
 * In-chat authorization card for an AI-prepared transfer.
 *
 * SECURITY: the AI never sees the PIN. This card reuses the existing secure
 * PinSheet; the digits the user enters are handed straight to the existing
 * /transfers endpoint via useTransfer (which the backend gates with
 * PinService::verify). The PIN is never sent to the assistant, never stored, and
 * PinSheet clears it after submission. The idempotency_key from the AI hand-off
 * is forwarded so a retried submission cannot double-send.
 */
export function SecureTransferCard({ action, onResult }: Props) {
  const { summary, authorization } = action;
  const isBank = summary.destination.kind === 'bank';
  const transfer = useTransfer();
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const authorize = (pin: string) => {
    setPinError(null);
    transfer.mutate(
      {
        from_wallet_id: authorization.transfer.from_wallet_id,
        amount: authorization.transfer.amount,
        pin, // → straight to POST /transfers; never touches the assistant
        description: authorization.transfer.description ?? undefined,
        destination: authorization.transfer.destination,
        idempotency_key: authorization.transfer.idempotency_key,
      },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          const msg = isPendingApproval(data)
            ? 'Transfer submitted for approval.'
            : `Transfer sent ✓  Ref ${data.reference}`;
          setDone(msg);
          onResult?.(msg);
        },
        onError: (e) => setPinError(e.message),
      },
    );
    // NB: `pin` is not retained here; PinSheet resets it after onSubmit.
  };

  return (
    <View className="mt-2 rounded-2xl bg-white p-4" style={shadow.soft}>
      <View className="flex-row items-center">
        <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
        <Text className="ml-1.5 text-[13px] font-bold text-ink">Authorize transfer</Text>
      </View>

      <View className="mt-3 rounded-xl bg-lav-faint p-3">
        <Text className="text-2xl font-extrabold tracking-tight text-ink">
          ₦{summary.amount}
        </Text>
        <View className="mt-1.5 flex-row items-center">
          <Text className="text-[13px] text-muted" numberOfLines={1}>
            {summary.source_wallet.name}
          </Text>
          <Ionicons name="arrow-forward" size={13} color={colors.muted} style={{ marginHorizontal: 6 }} />
          <Text className="text-[13px] font-semibold text-ink" numberOfLines={1}>
            {summary.destination.name}
          </Text>
        </View>

        {isBank ? (
          <View className="mt-1 flex-row items-center">
            <Ionicons name="business-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text className="text-[12px] text-muted" numberOfLines={1}>
              {summary.destination.bank_name}
              {summary.destination.account_masked ? ` · ${summary.destination.account_masked}` : ''}
            </Text>
          </View>
        ) : null}

        {Number(summary.fee) > 0 ? (
          <Text className="mt-2 text-[12px] text-muted">
            Fee ₦{summary.fee} · Total ₦{(Number(summary.amount) + Number(summary.fee)).toFixed(2)}
          </Text>
        ) : null}

        {summary.may_require_approval ? (
          <Text className="mt-1 text-[12px] text-muted">This transfer may need approval.</Text>
        ) : null}
      </View>

      {done ? (
        <View className="mt-3 flex-row items-center">
          <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
          <Text className="ml-1.5 text-[13px] font-semibold text-ink">{done}</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setPinError(null);
            setPinOpen(true);
          }}
          className="mt-3 flex-row items-center justify-center rounded-full bg-navy py-3 active:opacity-90"
        >
          <Ionicons name="lock-closed" size={16} color={colors.white} style={{ marginRight: 6 }} />
          <Text className="text-[14px] font-bold text-white">Enter PIN to send</Text>
        </Pressable>
      )}

      <PinSheet
        visible={pinOpen}
        title="Authorize transfer"
        subtitle={`Send ₦${summary.amount} to ${summary.destination.name}`}
        amount={`₦${summary.amount}`}
        recipient={summary.destination.name}
        loading={transfer.isPending}
        error={pinError}
        onSubmit={authorize}
        onClose={() => setPinOpen(false)}
      />
    </View>
  );
}
