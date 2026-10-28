import React, { useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { pt } from '../../theme';
import { selection } from '../../lib/haptics';

/**
 * SAV-03 slider ("Save from each salary 15%"): brand fill and knob on a light
 * track; tap or drag. Whole steps between min and max.
 */
export function PtSlider({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  last.current = value;

  const pick = (x: number) => {
    if (width <= 0) return;
    const next = Math.round(min + (Math.min(Math.max(x, 0), width) / width) * (max - min));
    if (next !== last.current) {
      last.current = next;
      selection();
      onChange(next);
    }
  };

  const gesture = Gesture.Race(
    Gesture.Pan().runOnJS(true).minDistance(0).onBegin((e) => pick(e.x)).onUpdate((e) => pick(e.x)),
    Gesture.Tap().runOnJS(true).onEnd((e) => pick(e.x)),
  );

  const pct = (value - min) / (max - min);

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = e.nativeEvent.actionName === 'increment' ? Math.min(max, value + 1) : Math.max(min, value - 1);
          onChange(next);
        }}
        style={{ height: 32, justifyContent: 'center' }}
      >
        <View style={{ height: 8, borderRadius: 4, backgroundColor: pt.sunken, borderWidth: 1, borderColor: pt.line }} />
        <View style={{ position: 'absolute', left: 0, width: `${pct * 100}%`, height: 8, borderRadius: 4, backgroundColor: pt.brand }} />
        <View
          style={{
            position: 'absolute',
            left: Math.max(0, pct * width - 14),
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: pt.brand,
            borderWidth: 3,
            borderColor: pt.raised,
          }}
        />
      </View>
    </GestureDetector>
  );
}
