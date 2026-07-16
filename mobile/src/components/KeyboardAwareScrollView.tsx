import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type ScrollViewProps,
} from 'react-native';

interface Props extends ScrollViewProps {
  /** Gap kept between the focused field's bottom and the keyboard top. */
  extraOffset?: number;
}

/**
 * Form scroll container that keeps the focused field visible above the keyboard.
 *
 * RN 0.86 runs edge-to-edge, which disables `adjustResize`, so we (1) pad the
 * bottom by the keyboard height to create scroll room, and (2) auto-scroll the
 * focused field above the keyboard. The scroll is DELAYED past the IME inset
 * animation — doing it synchronously in `keyboardDidShow` fought the animation
 * and made the keyboard flicker. (The other historic flicker cause — a dynamic
 * elevation on the focused Input — was removed separately.)
 */
export function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  extraOffset = 24,
  ...props
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);

      if (Platform.OS !== 'android') return;
      const focused = TextInput.State.currentlyFocusedInput?.() as
        | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
        | null;
      const scroll = scrollRef.current;
      if (!focused?.measureInWindow || !scroll) return;

      const kbTop = e.endCoordinates.screenY;
      // Let the IME inset animation + our padding re-layout settle first.
      setTimeout(() => {
        focused.measureInWindow?.((_x, y, _w, h) => {
          const inputBottom = y + h + extraOffset;
          if (inputBottom > kbTop) {
            scroll.scrollTo({ y: offsetRef.current + (inputBottom - kbTop), animated: true });
          }
        });
      }, 160);
    });

    const onHide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
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
      contentContainerStyle={[contentContainerStyle, { paddingBottom: kbHeight }]}
    >
      {children}
    </ScrollView>
  );
}
