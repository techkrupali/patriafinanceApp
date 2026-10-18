import React from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, outline } from '../theme';
import { useDeleteWalletDraft } from '../api/hooks';
import { dayLabel } from '../lib/format';
import { selection } from '../lib/haptics';
import { walletVisual } from '../lib/walletVisual';
import { walletGuide } from '../lib/walletGuides';
import type { WalletDraft } from '../api/types';

/**
 * An unfinished wallet in the wallet list — grayed out with a "Draft" badge
 * (client: "Draft wallets should appear on the wallet list but grayed out").
 * Tap to pick up where you left off; the bin discards it.
 */
export function DraftWalletCard({ draft, onResume }: { draft: WalletDraft; onResume: () => void }) {
  const remove = useDeleteWalletDraft();
  const guide = walletGuide(draft.type);
  const visual = walletVisual(draft.type);

  const discard = () => {
    selection();
    Alert.alert('Discard this draft?', `"${draft.name || guide.title}" and everything you entered will be deleted.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => remove.mutate(draft.id) },
    ]);
  };

  return (
    <Pressable
      onPress={() => {
        selection();
        onResume();
      }}
      className="flex-row items-center rounded bg-white p-4 active:opacity-90"
      style={[outline.card, { opacity: 0.6 }]}
      accessibilityLabel={`Draft ${draft.name || guide.title}, continue setup`}
    >
      <View className="h-12 w-12 items-center justify-center rounded bg-lav-faint">
        <Ionicons name={visual.icon} size={22} color={colors.faded} />
      </View>
      <View className="ml-4 flex-1 pr-2">
        <View className="flex-row items-center">
          <Text className="flex-shrink text-[16px] font-extrabold text-muted" numberOfLines={1}>
            {draft.name || `Untitled ${guide.title}`}
          </Text>
          <View className="ml-2 rounded bg-lav px-2 py-0.5">
            <Text className="text-[11px] font-bold text-muted">Draft</Text>
          </View>
        </View>
        <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
          Step {draft.step} of {draft.total_steps} · Saved {dayLabel(draft.updated_at)} · Tap to continue
        </Text>
      </View>
      <Pressable onPress={discard} hitSlop={10} accessibilityLabel="Discard draft">
        <Ionicons name="trash-outline" size={18} color={colors.faded} />
      </Pressable>
    </Pressable>
  );
}
