import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, outline } from '../theme';
import type { SupportRequestAction } from '../api/types';

interface Props {
  action: SupportRequestAction;
}

const humanize = (s: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

/**
 * Small confirmation card shown in the assistant chat once a support escalation
 * has been submitted. Reuses the existing card design tokens.
 */
export function SupportRequestCard({ action }: Props) {
  return (
    <View className="mt-2 rounded bg-white p-4" style={outline.card}>
      <View className="flex-row items-center">
        <Ionicons name="headset-outline" size={16} color={colors.brand} />
        <Text className="ml-1.5 text-[13px] font-bold text-ink">Support request submitted</Text>
      </View>

      <Text className="mt-2 text-[13px] text-muted">
        Your issue has been sent to our support team. They will review it.
      </Text>

      <View className="mt-3 rounded bg-lav-faint p-3">
        {action.request_id != null ? (
          <Text className="text-[13px] text-ink">
            <Text className="font-semibold">Request</Text> #{action.request_id}
          </Text>
        ) : null}
        {action.subject ? (
          <Text className="mt-1 text-[13px] text-ink" numberOfLines={2}>
            <Text className="font-semibold">Issue: </Text>
            {action.subject}
          </Text>
        ) : null}
        <View className="mt-1 flex-row" style={{ gap: 16 }}>
          <Text className="text-[12px] text-muted">Category: {humanize(action.category)}</Text>
          <Text className="text-[12px] text-muted">Status: {humanize(action.status)}</Text>
        </View>
      </View>
    </View>
  );
}
