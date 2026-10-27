import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { parseYmd, toYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { PtButton } from './PtButton';
import { PtText } from './PtText';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW = 44;

function Column({
  items,
  selected,
  onSelect,
}: {
  items: { key: number; label: string }[];
  selected: number;
  onSelect: (key: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const i = items.findIndex((it) => it.key === selected);
    if (i >= 0) ref.current?.scrollTo({ y: Math.max(i - 2, 0) * ROW, animated: false });
    // Only on open; afterwards the person scrolls freely.
  }, []);

  return (
    <ScrollView ref={ref} style={{ flex: 1, height: ROW * 5 }} showsVerticalScrollIndicator={false}>
      {items.map((it) => {
        const active = it.key === selected;
        return (
          <Pressable
            key={it.key}
            onPress={() => {
              selection();
              onSelect(it.key);
            }}
            style={{
              height: ROW,
              marginHorizontal: 4,
              borderRadius: ptRadius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? pt.brandSoft : 'transparent',
            }}
          >
            <Text style={{ fontFamily: active ? ptFont.bold : ptFont.medium, fontSize: 17, color: active ? pt.brand : pt.ink }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface PtDateSheetProps {
  visible: boolean;
  title: string;
  /** YYYY-MM-DD or null. */
  value: string | null;
  /** Latest selectable year, e.g. this year minus 18 for an adult's birth date. */
  maxYear: number;
  minYear: number;
  doneLabel: string;
  onDone: (ymd: string) => void;
  onClose: () => void;
}

/** Day / month / year columns in a bottom sheet — quick for birth dates decades back. */
export function PtDateSheet({ visible, title, value, maxYear, minYear, doneLabel, onDone, onClose }: PtDateSheetProps) {
  const insets = useSafeAreaInsets();
  const initial = parseYmd(value) ?? new Date(maxYear - 12, 0, 1);
  const [y, setY] = useState(initial.getFullYear());
  const [m, setM] = useState(initial.getMonth());
  const [d, setD] = useState(initial.getDate());

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const day = Math.min(d, daysInMonth);

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ key: maxYear - i, label: String(maxYear - i) })),
    [maxYear, minYear],
  );
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ key: i + 1, label: String(i + 1) }));
  const months = MONTHS.map((label, i) => ({ key: i, label }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(14,26,22,0.45)' }} />
        <View
          style={{
            backgroundColor: pt.surface,
            borderTopLeftRadius: ptRadius.lg,
            borderTopRightRadius: ptRadius.lg,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12) + 18,
            gap: 16,
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: pt.line }} />
          <PtText variant="subtitle">{title}</PtText>
          <View style={{ flexDirection: 'row', backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 8 }}>
            <Column items={days} selected={day} onSelect={setD} />
            <Column items={months} selected={m} onSelect={setM} />
            <Column items={years} selected={y} onSelect={setY} />
          </View>
          <PtButton title={doneLabel} onPress={() => onDone(toYmd(new Date(y, m, day)))} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
