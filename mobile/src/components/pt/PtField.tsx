import React, { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtText } from './PtText';

/**
 * The prototype's focus treatment: a 2pt brand border plus a 2pt focus-blue
 * ring sitting 2pt outside the box (CSS `outline-offset`). The ring wrapper is
 * always present (transparent at rest) with a negative margin, so focusing
 * never shifts the layout.
 */
export function FocusRing({
  focused,
  radius = ptRadius.sm,
  children,
  style,
}: {
  focused: boolean;
  radius?: number;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          margin: -4,
          padding: 2,
          borderWidth: 2,
          borderRadius: radius + 4,
          borderColor: focused ? pt.focus : 'transparent',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Box styles shared by text fields, the dial-code box and the code boxes. */
export function fieldBox(focused: boolean, error = false) {
  return {
    height: 52,
    borderRadius: ptRadius.sm,
    backgroundColor: pt.raised,
    borderWidth: focused ? 2 : 1.5,
    borderColor: error ? pt.danger : focused ? pt.brand : pt.lineStrong,
  };
}

interface PtFieldProps extends TextInputProps {
  label: string;
  /** Static text before the input, e.g. "+234". */
  prefix?: string;
  hint?: string;
  error?: string | null;
  /** Makes the box a button (e.g. opens a date picker) instead of a text input. */
  onPressBox?: () => void;
}

/** Prototype `pt-field`: 13pt label, 52pt box, 17pt semibold value, hint below. */
export const PtField = forwardRef<TextInput, PtFieldProps>(function PtField(
  { label, prefix, hint, error, onPressBox, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const valueStyle = {
    flex: 1,
    fontFamily: ptFont.semibold,
    fontSize: 17,
    color: pt.ink,
    paddingVertical: 0,
  };

  const box = (
    <View style={[fieldBox(focused, Boolean(error)), { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }]}>
      {prefix ? <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.inkMuted }}>{prefix}</Text> : null}
      {onPressBox ? (
        <Text style={[valueStyle, !rest.value && { fontFamily: ptFont.medium, color: pt.inkSubtle }]} numberOfLines={1}>
          {rest.value || rest.placeholder}
        </Text>
      ) : (
        <TextInput
          ref={ref}
          placeholderTextColor={pt.inkSubtle}
          selectionColor={pt.brand}
          cursorColor={pt.brand}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[valueStyle, style]}
        />
      )}
    </View>
  );

  return (
    <View style={{ gap: 8 }}>
      <PtText variant="label">{label}</PtText>
      <FocusRing focused={focused}>
        {onPressBox ? (
          <Pressable onPress={onPressBox} accessibilityRole="button" accessibilityLabel={label}>
            {box}
          </Pressable>
        ) : (
          box
        )}
      </FocusRing>
      {error ? (
        <PtText variant="caption" color={pt.danger}>
          {error}
        </PtText>
      ) : hint ? (
        <PtText variant="caption" color={pt.inkMuted}>
          {hint}
        </PtText>
      ) : null}
    </View>
  );
});
