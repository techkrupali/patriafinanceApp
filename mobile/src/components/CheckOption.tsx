import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, outline } from '../theme';
import { selection } from '../lib/haptics';

interface CheckOptionProps {
  title: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  /** Extra fields revealed while checked (e.g. reason + PIN for manual unlock). */
  children?: React.ReactNode;
  className?: string;
}

/** Checkbox row with a title, explainer and optional revealed fields (design: Access Configuration). */
export function CheckOption({ title, description, checked, onToggle, children, className = '' }: CheckOptionProps) {
  return (
    <View className={`rounded bg-white p-4 ${className}`} style={outline.card}>
      <Pressable
        onPress={() => {
          selection();
          onToggle();
        }}
        className="flex-row items-start active:opacity-80"
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View
          className={`mr-3 mt-0.5 h-5 w-5 items-center justify-center rounded border ${
            checked ? 'border-navy bg-navy' : 'border-faded bg-white'
          }`}
        >
          {checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink">{title}</Text>
          {description ? <Text className="mt-0.5 text-[13px] leading-5 text-muted">{description}</Text> : null}
        </View>
      </Pressable>
      {checked && children ? <View className="mt-4">{children}</View> : null}
    </View>
  );
}
