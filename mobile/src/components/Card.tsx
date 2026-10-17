import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { outline } from '../theme';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  onPress?: () => void;
}

/** White card with a faint gray outline (no shadow). Adds press feedback when `onPress` is set. */
export function Card({ children, className = '', style, onPress }: CardProps) {
  const classes = `bg-white rounded p-5 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${classes} active:opacity-90`} style={[outline.card, style]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className={classes} style={[outline.card, style]}>
      {children}
    </View>
  );
}
