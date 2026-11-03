import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { LogoMark } from '../../components/pt/PtLogo';
import { useCircles, type CircleRow } from '../../api/circles';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';

/**
 * HOM-06 "Your circles": your family, circles you're in ("Eze siblings ·
 * Contributor · 1 waiting"), ajo groups, and "Start a new circle".
 */
export function CircleSwitcherSheet({
  visible,
  current,
  onPick,
  onAjo,
  onNew,
  onClose,
}: {
  visible: boolean;
  /** null = your own family. */
  current: number | null;
  onPick: (row: CircleRow) => void;
  onAjo: (walletId: number) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const q = useCircles();
  const rows = q.data ?? [];
  const isCurrent = (r: CircleRow) => (current === null ? r.is_home : r.id === current);

  return (
    <PtSheet visible={visible} title="Your circles" onClose={onClose}>
      {q.isLoading ? <ActivityIndicator color={pt.brand} style={{ marginVertical: 24 }} /> : null}
      <View style={{ gap: 10 }}>
        {rows.map((r, i) => {
          const on = isCurrent(r);
          return (
            <Pressable
              key={r.id ?? `ajo-${r.ajo_wallet_id}`}
              onPress={() => {
                selection();
                if (r.ajo_wallet_id) onAjo(r.ajo_wallet_id);
                else onPick(r);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${r.name}. ${r.subtitle}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: ptRadius.md,
                borderWidth: 2,
                borderColor: on ? pt.brand : 'transparent',
                backgroundColor: on ? pt.brandSoft : pt.sunken,
              }}
            >
              {r.is_home ? <LogoMark size={44} /> : <PtAvatar initials={initials(r.name)} size={44} tone={r.kind === 'ajo' ? 'gold' : AVATAR_CYCLE[(i + 1) % AVATAR_CYCLE.length]} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 23, color: on ? pt.brand : pt.ink }} numberOfLines={1}>{r.name}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }} numberOfLines={2}>{r.subtitle}</Text>
              </View>
              {on ? <Feather name="check" size={22} color={pt.brand} /> : null}
              {!on && r.waiting > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FDEBC8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Feather name="clock" size={13} color="#8F5400" />
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: '#8F5400' }}>{`${r.waiting} waiting`}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            selection();
            onNew();
          }}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="plus" size={20} color={pt.brand} />
          </View>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.brand }}>Start a new circle</Text>
        </Pressable>
      </View>
    </PtSheet>
  );
}
