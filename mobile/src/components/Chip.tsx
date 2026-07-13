import React from 'react';
import { Text } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { selection } from '../lib/haptics';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  className?: string;
}

/** Filter pill: active navy/white, inactive lavender/ink. */
export function Chip({ label, active = false, onPress, className = '' }: ChipProps) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress?.();
      }}
      className={`rounded-full px-4 py-2 active:opacity-80 ${active ? 'bg-navy' : 'bg-lav'} ${className}`}
    >
      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}
