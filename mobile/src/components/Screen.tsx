import React from 'react';
import { View, ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from './AppBackground';

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
  /** Include bottom inset padding (default false — tab bar handles it). */
  withBottomInset?: boolean;
  style?: ViewStyle;
}

/** Page wrapper: safe-area padded view on the app's page background. */
export function Screen({ children, className = '', withBottomInset = false, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className={`flex-1 bg-page ${className}`}
      style={[
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: withBottomInset ? insets.bottom : 0,
        },
        style,
      ]}
    >
      <AppBackground />
      <StatusBar style="dark" />
      {children}
    </View>
  );
}
