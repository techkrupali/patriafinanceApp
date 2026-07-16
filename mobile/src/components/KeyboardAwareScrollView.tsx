import React, { useEffect, useRef, useState } from 'react';
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
 * A dependency-free, New-Architecture-safe keyboard-aware scroll view.
 *
 * On keyboard open it (1) measures the currently-focused TextInput and scrolls
 * it comfortably above the keyboard, and (2) pads the bottom by the keyboard
 * height so even the last field has room to scroll up. Replaces the fragile
 * `KeyboardAvoidingView + ScrollView` combo (which did nothing on Android).
 */
export function KeyboardAwareScrollView({
  children,
  extraOffset = 24,
  contentContainerStyle,
  ...props
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvt, (e) => {
      const kbTop = e.endCoordinates.screenY;
      setKbHeight(e.endCoordinates.height ?? 0);

      const focused = TextInput.State.currentlyFocusedInput?.() as
        | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
        | null;
      const scroll = scrollRef.current;
      if (!focused?.measureInWindow || !scroll) return;

      // Let the resize settle before measuring (Android adjustResize).
      requestAnimationFrame(() => {
        focused.measureInWindow?.((_x, y, _w, h) => {
          const inputBottom = y + h + extraOffset;
          if (inputBottom > kbTop) {
            scroll.scrollTo({ y: offsetRef.current + (inputBottom - kbTop), animated: true });
          }
        });
      });
    });

    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [extraOffset]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
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
