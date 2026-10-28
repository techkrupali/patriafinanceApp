import { useEffect, useRef, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

/**
 * Steps of a guided setup on one screen (goal, savings and emergency wallets).
 * Back — the header chevron, Android back or a swipe — walks back through the
 * steps; on the first step `onLeave` decides (keep or discard the draft).
 * Call `leave()` before navigating away on purpose so the guard lets it through.
 */
export function useSetupFlow<S extends string>(
  navigation: NativeStackNavigationProp<ParamListBase>,
  steps: S[],
  initialIndex = 0,
) {
  const [index, setIndex] = useState(() => Math.min(Math.max(initialIndex, 0), steps.length - 1));
  const leaving = useRef(false);
  const current = useRef(index);
  current.current = index;

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leaving.current || current.current === 0) return;
        e.preventDefault();
        setIndex(current.current - 1);
      }),
    [navigation],
  );

  const safeIndex = Math.min(index, steps.length - 1);

  return {
    index: safeIndex,
    step: steps[safeIndex],
    next: () => setIndex(Math.min(safeIndex + 1, steps.length - 1)),
    goTo: (step: S) => setIndex(Math.max(0, steps.indexOf(step))),
    back: (onLeave: () => void) => (safeIndex > 0 ? setIndex(safeIndex - 1) : onLeave()),
    leave: (go: () => void) => {
      leaving.current = true;
      go();
    },
  };
}
