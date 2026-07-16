import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, ScrollView, type ScrollViewProps } from 'react-native';

interface Props extends ScrollViewProps {
  /** Kept for API compatibility with callers; no longer used. */
  extraOffset?: number;
}

/**
 * Scroll container for forms that keeps every field reachable when the keyboard
 * is open.
 *
 * RN 0.86 runs edge-to-edge, which disables the window's `adjustResize`, so the
 * keyboard overlays the app instead of shrinking it. We compensate purely with
 * bottom padding equal to the keyboard height — that gives the ScrollView room
 * to scroll any covered field/button above the keyboard. We deliberately do NOT
 * call `scrollTo` here: on edge-to-edge that fought the IME inset animation and
 * made the keyboard flicker open/closed. Padding-only is smooth and loop-free.
 */
export function KeyboardAwareScrollView({ children, contentContainerStyle, ...props }: Props) {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const onHide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...props}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: kbHeight }]}
    >
      {children}
    </ScrollView>
  );
}
