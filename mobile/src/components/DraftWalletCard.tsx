import React from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, Ionicons } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../theme';
import { PtChip } from './pt/PtChip';
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
  const title = draft.name || `Untitled ${guide.title.toLowerCase()}`;

  const discard = () => {
    selection();
    Alert.alert('Discard this draft?', `"${title}" and everything you entered will be deleted.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => remove.mutate(draft.id) },
    ]);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingRight: 14,
        borderRadius: ptRadius.md,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: pt.line,
        backgroundColor: pt.raised,
        opacity: 0.6,
      }}
    >
      <Pressable
        onPress={() => {
          selection();
          onResume();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Draft ${title}, continue setup`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14 }}
      >
        <View style={{ width: 40, height: 40, borderRadius: ptRadius.sm, backgroundColor: pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={walletVisual(draft.type).icon} size={19} color={pt.inkSubtle} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flexShrink: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.inkMuted }} numberOfLines={1}>
              {title}
            </Text>
            <PtChip label="Draft" />
          </View>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkSubtle }} numberOfLines={1}>
            Step {draft.step} of {draft.total_steps} · Saved {dayLabel(draft.updated_at)} · Tap to continue
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={discard} hitSlop={10} accessibilityRole="button" accessibilityLabel="Discard draft">
        <Feather name="trash-2" size={18} color={pt.inkSubtle} />
      </Pressable>
    </View>
  );
}
