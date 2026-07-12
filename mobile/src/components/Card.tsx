import React from 'react';
import { View, ViewStyle } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const shadow: ViewStyle = {
  shadowColor: '#0b1c30',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

/** White rounded card with a subtle shadow. */
export function Card({ children, className = '', style }: CardProps) {
  return (
    <View className={`bg-white rounded-2xl p-4 ${className}`} style={[shadow, style]}>
      {children}
    </View>
  );
}
