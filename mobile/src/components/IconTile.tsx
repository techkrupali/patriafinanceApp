import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { selection } from '../lib/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface IconTileProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Google-Pay style quick action: a light-blue rounded square holding a blue
 * outline icon, with a small dark label beneath. Flat — no gradient, no shadow.
 */
export function IconTile({ icon, label, onPress, disabled, className = '' }: IconTileProps) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      disabled={disabled}
      className={`flex-1 items-center ${disabled ? 'opacity-40' : 'active:opacity-70'} ${className}`}
    >
      <View
        className="items-center justify-center rounded-2xl bg-lav-soft"
        style={{ height: 58, width: 58 }}
      >
        <Ionicons name={icon} size={24} color={colors.brand} />
      </View>
      <Text className="mt-2 text-[12px] font-medium text-ink">{label}</Text>
    </Pressable>
  );
}
