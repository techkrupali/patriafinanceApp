import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtNote, PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { useUpdateSettings } from '../../api/account';
import { useAppLock } from '../../store/appLock';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** A small phone drawn in the theme's colours. */
function Swatch({ label, bg, card, on, onPress }: { label: string; bg: string; card: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ width: '100%', aspectRatio: 0.8, borderRadius: ptRadius.sm, backgroundColor: bg, borderWidth: on ? 2.5 : 1, borderColor: on ? pt.brand : pt.line, padding: 8, gap: 6 }}>
        <View style={{ height: 22, borderRadius: 4, backgroundColor: card }} />
        <View style={{ height: 6, width: '70%', borderRadius: 3, backgroundColor: card, opacity: 0.6 }} />
        <View style={{ height: 6, width: '50%', borderRadius: 3, backgroundColor: card, opacity: 0.6 }} />
      </View>
      <Text style={{ fontFamily: on ? ptFont.bold : ptFont.medium, fontSize: 13, color: on ? pt.brand : pt.ink }}>{label}</Text>
    </Pressable>
  );
}

/**
 * ME-13 Appearance: Light, Dark or Same as phone; bigger text that follows
 * the phone's text size; reduce motion. The app is light-only for now, so
 * Dark and Same as phone say so.
 */
export function AppearanceScreen({ navigation }: RootScreenProps<'Appearance'>) {
  const prefs = useAppLock();
  const update = useUpdateSettings();
  const soon = () => showAlert('Dark mode is coming', 'Patriai is light-only for now. We\'ll tell you when Dark and Same as phone are ready.');

  return (
    <PtPageScreen title="Appearance" onBack={() => navigation.goBack()}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Swatch label="Light" bg="#F3F7F4" card="#0B5D4B" on onPress={() => update.mutate({ appearance: 'light' })} />
        <Swatch label="Dark" bg="#0E1A16" card="#1FA07A" on={false} onPress={soon} />
        <Swatch label="Same as phone" bg="#E3ECE6" card="#08392F" on={false} onPress={soon} />
      </View>
      <PtPanel>
        <PtSwitchRow title="Bigger text" subtitle="Follows your phone's text size" value={prefs.biggerText} onChange={(v) => { void prefs.save({ biggerText: v }); update.mutate({ bigger_text: v }); }} />
        <PtSwitchRow title="Reduce motion" value={prefs.reduceMotion} onChange={(v) => { void prefs.save({ reduceMotion: v }); update.mutate({ reduce_motion: v }); }} />
      </PtPanel>
      <PtNote tone="info">Bigger text and reduce motion apply the next time you open a screen.</PtNote>
    </PtPageScreen>
  );
}
