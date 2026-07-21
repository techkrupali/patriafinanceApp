import React from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { selection } from '../lib/haptics';

/** Client design tokens (family_switch_modal_updated_layout code.html). */
const GOLD_CONTAINER = '#FFCC00'; // primary-container
const GOLD_CONTAINER_TINT = 'rgba(255, 204, 0, 0.10)'; // bg-[#FFCC00]/10
const ON_GOLD = '#6F5700'; // on-primary-container
const GOLD_INK = '#3D2F00';
const DASH = '#D2C5AB'; // outline-variant
const SCRIM = 'rgba(23, 28, 31, 0.4)'; // on-surface/40

interface FamilySwitcherModalProps {
  visible: boolean;
  onClose: () => void;
  /** e.g. "Abara Family" */
  familyName: string;
  memberCount: number;
  /** Compact treasury figure for the subtitle, e.g. "₦4.2M". */
  treasuryLabel: string;
}

/**
 * Bottom-sheet family switcher (Stitch: family_switch_modal_updated_layout).
 * Only one family exists today, so it renders the current family as the
 * active/checked item plus a "coming soon" slot. RNGH touchables inside an RN
 * Modal need their own GestureHandlerRootView (project rule).
 */
export function FamilySwitcherModal({
  visible,
  onClose,
  familyName,
  memberCount,
  treasuryLabel,
}: FamilySwitcherModalProps) {
  const insets = useSafeAreaInsets();

  const close = () => {
    selection();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Dimmed backdrop — tap to dismiss */}
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM }}
          onPress={close}
        />

        {/* Sheet */}
        <View
          className="px-6 pt-4"
          style={{
            backgroundColor: colors.page,
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            paddingBottom: (insets.bottom > 0 ? insets.bottom : 12) + 12,
          }}
        >
          {/* Drag handle */}
          <View className="items-center">
            <View className="h-1.5 w-12 rounded-full bg-lav" />
          </View>

          {/* Header */}
          <View className="mt-5 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-2xl font-extrabold text-ink" style={{ letterSpacing: -0.5 }}>
                Select Family
              </Text>
              <Text className="mt-1 text-sm font-medium text-muted">
                Manage your financial circles
              </Text>
            </View>
            <Pressable
              onPress={close}
              className="h-10 w-10 items-center justify-center rounded-full bg-page-top active:opacity-70"
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          {/* Active family (the only one today) */}
          <View
            className="mt-6 flex-row items-center rounded-2xl p-5"
            style={{ backgroundColor: GOLD_CONTAINER_TINT, borderWidth: 2, borderColor: GOLD_CONTAINER }}
          >
            <View
              className="h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: GOLD_CONTAINER }}
            >
              <MaterialCommunityIcons name="human-male-female-child" size={28} color={ON_GOLD} />
            </View>
            <View className="ml-4 flex-1">
              <View className="flex-row items-center">
                <Text className="shrink text-lg font-bold text-ink" numberOfLines={1}>
                  {familyName}
                </Text>
                <View
                  className="ml-2 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: GOLD_CONTAINER }}
                >
                  <Text className="text-[9px] font-bold uppercase" style={{ color: GOLD_INK }}>
                    Active
                  </Text>
                </View>
              </View>
              <Text className="mt-0.5 text-[11px] font-medium text-muted" numberOfLines={1}>
                {memberCount} Member{memberCount === 1 ? '' : 's'} • {treasuryLabel} Treasury
              </Text>
            </View>
            <View className="ml-2 h-6 w-6 items-center justify-center rounded-full bg-gold-deep">
              <Ionicons name="checkmark" size={14} color={colors.white} />
            </View>
          </View>

          {/* Future slot — mirrors the design's dashed "create new" area */}
          <View
            className="mt-4 items-center rounded-2xl p-6"
            style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: DASH }}
          >
            <Text className="text-sm font-semibold text-muted">More families coming soon</Text>
          </View>

          {/* Confirm — slate secondary button per the design */}
          <Pressable
            onPress={close}
            className="mt-6 items-center rounded-xl py-4 active:opacity-85"
            style={{ backgroundColor: colors.muted }}
          >
            <Text className="text-[15px] font-bold text-white">Confirm Selection</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
