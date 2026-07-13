import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';
import { selection } from '../lib/haptics';

interface HeaderProps {
  title?: string;
  right?: React.ReactNode;
  className?: string;
}

/** In-screen header: back chevron on the left, centered title, optional right action. */
export function Header({ title = '', right, className = '' }: HeaderProps) {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();

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
            className="h-11 w-11 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>

      <Text className="flex-1 text-center text-[17px] font-semibold text-ink" numberOfLines={1}>
        {title}
      </Text>

      <View className="w-11 items-end">{right}</View>
    </View>
  );
}
