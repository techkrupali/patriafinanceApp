import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type ScrollViewProps,
} from 'react-native';

interface Props extends ScrollViewProps {
  /** Gap to keep between the focused field's bottom and the keyboard top. */
  extraOffset?: number;
}

/**
 * Dependency-free, New-Architecture-safe keyboard-aware scroll view.
 *
 * - iOS: `automaticallyAdjustKeyboardInsets` lets the OS inset the content.
 * - Android (windowSoftInputMode=adjustResize): on keyboard open we scroll the
 *   currently-focused field just above the keyboard. No component state is used
 *   (so there is no re-render/flicker on focus), and we do NOT use
 *   `keyboardDismissMode="interactive"` — programmatic scrolling with that mode
 *   was dismissing the keyboard the instant it opened.
 */
export function KeyboardAwareScrollView({
  children,
  extraOffset = 24,
  ...props
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      const focused = TextInput.State.currentlyFocusedInput?.() as
        | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
        | null;
      const scroll = scrollRef.current;
      if (!focused?.measureInWindow || !scroll) return;

      const kbTop = e.endCoordinates.screenY;
      focused.measureInWindow?.((_x, y, _w, h) => {
        const inputBottom = y + h + extraOffset;
        if (inputBottom > kbTop) {
          scroll.scrollTo({ y: offsetRef.current + (inputBottom - kbTop), animated: true });
        }
      });
    });

    return () => sub.remove();
  }, [extraOffset]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      scrollEventThrottle={16}
      {...props}
      ref={scrollRef}
      onScroll={(e) => {
        offsetRef.current = e.nativeEvent.contentOffset.y;
        props.onScroll?.(e);
      }}
    >
      {children}
    </ScrollView>
  );
}
