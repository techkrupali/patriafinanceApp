import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

interface HeaderProps {
  title: string;
  right?: React.ReactNode;
  className?: string;
}

/** In-screen header with a back chevron. */
export function Header({ title, right, className = '' }: HeaderProps) {
  const navigation = useNavigation();
  return (
    <View className={`flex-row items-center px-5 py-3 ${className}`}>
      {navigation.canGoBack() ? (
        <Pressable
          onPress={() => navigation.goBack()}
          className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-white active:opacity-70"
          style={{
            shadowColor: '#0b1c30',
            shadowOpacity: 0.05,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <Text className="text-xl text-ink">‹</Text>
        </Pressable>
      ) : null}
      <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
