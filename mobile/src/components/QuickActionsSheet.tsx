import React from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../theme';
import { useHomeCopy } from '../lib/homeCopy';
import { selection } from '../lib/haptics';

export type QuickAction = 'send' | 'bills' | 'add' | 'request' | 'wallet' | 'goal' | 'scan' | 'invite';

const ICONS: Record<QuickAction, React.ReactNode> = {
  send: <Feather name="send" size={21} color={pt.brand} />,
  bills: <Feather name="zap" size={21} color={pt.brand} />,
  add: <Feather name="plus" size={22} color={pt.brand} />,
  request: <Feather name="arrow-down-left" size={22} color={pt.brand} />,
  wallet: <MaterialCommunityIcons name="wallet-outline" size={22} color={pt.brand} />,
  goal: <Feather name="target" size={21} color={pt.brand} />,
  scan: <MaterialCommunityIcons name="qrcode-scan" size={20} color={pt.brand} />,
  invite: <Feather name="user-plus" size={21} color={pt.brand} />,
};

const ORDER: QuickAction[] = ['send', 'bills', 'add', 'request', 'wallet', 'goal', 'scan', 'invite'];

/** Not built yet: shown greyed with "soon", as the prototype does for bills. */
const SOON: QuickAction[] = ['bills', 'request', 'scan'];

/** HOM-04 "What would you like to do?" bottom sheet from Home's More. */
export function QuickActionsSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (action: QuickAction) => void;
}) {
  const copy = useHomeCopy();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(8,57,47,0.55)' }} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: pt.raised,
            borderTopLeftRadius: ptRadius.lg,
            borderTopRightRadius: ptRadius.lg,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 12) + 22,
            gap: 8,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: pt.line }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 4 }}>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: pt.ink }} accessibilityRole="header">
              {copy.sheetTitle}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="x" size={22} color={pt.inkMuted} />
            </Pressable>
          </View>

          {ORDER.map((key) => {
            const [title, subtitle] = copy.actions[key];
            const soon = SOON.includes(key);
            return (
              <Pressable
                key={key}
                disabled={soon}
                onPress={() => {
                  selection();
                  onPick(key);
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: soon }}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: soon ? 0.55 : 1 }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  {ICONS[key]}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 22, color: pt.ink }}>
                    {soon ? `${title} · ${copy.soon}` : title}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }} numberOfLines={1}>
                    {subtitle}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={pt.inkSubtle} />
              </Pressable>
            );
          })}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
