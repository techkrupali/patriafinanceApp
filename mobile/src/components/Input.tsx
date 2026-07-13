import React, { useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  icon?: IconName;
  /** Custom right adornment; overrides the automatic password eye toggle. */
  rightAdornment?: React.ReactNode;
  containerClassName?: string;
}

/** Filled, rounded input with a floating uppercase label, focus ring and optional password reveal. */
export function Input({
  label,
  error,
  icon,
  rightAdornment,
  containerClassName = '',
  secureTextEntry,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  const borderClass = error
    ? 'border-danger'
    : focused
      ? 'border-brand'
      : 'border-transparent';

  return (
    <View className={`w-full ${containerClassName}`}>
      {label ? (
        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </Text>
      ) : null}
      <View
        className={`w-full flex-row items-center rounded-2xl border bg-lav-faint px-4 ${borderClass}`}
        style={{ minHeight: 52 }}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={19}
            color={error ? colors.danger : focused ? colors.brand : colors.faded}
            style={{ marginRight: 10 }}
          />
        ) : null}
        <TextInput
          placeholderTextColor={colors.faded}
          secureTextEntry={isPassword && !reveal}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          className="flex-1 py-3.5 text-[15px] text-ink"
          {...rest}
        />
        {rightAdornment ??
          (isPassword ? (
            <Pressable onPress={() => setReveal((r) => !r)} hitSlop={10} className="pl-2">
              <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          ) : null)}
      </View>
      {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}
