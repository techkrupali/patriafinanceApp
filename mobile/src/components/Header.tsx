import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, outline } from '../theme';
import { selection } from '../lib/haptics';

interface HeaderProps {
  title?: string;
  right?: React.ReactNode;
  className?: string;
  /** Tab-hosted screens pass false — canGoBack() is true there but goBack() jumps tabs. */
  showBack?: boolean;
}

/** In-screen header: back chevron on the left, centered title, optional right action. */
export function Header({ title = '', right, className = '', showBack = true }: HeaderProps) {
  const navigation = useNavigation();
  const canGoBack = showBack && navigation.canGoBack();

  return (
    <View className={`flex-row items-center px-5 py-3 ${className}`} style={{ minHeight: 56 }}>
      <View className="w-11">
        {canGoBack ? (
          <Pressable
            onPress={() => {
              selection();
              navigation.goBack();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-11 w-11 items-center justify-center rounded bg-white active:opacity-70"
            style={outline.card}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>

      <Text className="flex-1 text-center text-lg font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>

      <View className="w-11 items-end">{right}</View>
    </View>
  );
}
