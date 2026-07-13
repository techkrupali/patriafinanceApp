import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { shadow } from '../theme';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  onPress?: () => void;
}

/** White rounded-3xl card with a soft navy shadow. Adds press feedback when `onPress` is set. */
export function Card({ children, className = '', style, onPress }: CardProps) {
  const classes = `bg-white rounded-3xl p-5 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${classes} active:opacity-90`} style={[shadow.card, style]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className={classes} style={[shadow.card, style]}>
      {children}
    </View>
  );
}
