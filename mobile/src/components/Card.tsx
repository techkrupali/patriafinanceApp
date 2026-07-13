import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  onPress?: () => void;
}

/** Flat light card: soft gray-blue fill, rounded-[20px], no shadow. Press feedback when `onPress` is set. */
export function Card({ children, className = '', style, onPress }: CardProps) {
  const classes = `bg-lav-faint rounded-[20px] p-5 ${className}`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${classes} active:opacity-90`} style={style}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className={classes} style={style}>
      {children}
    </View>
  );
}
