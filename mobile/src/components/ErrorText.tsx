import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export function ErrorText({ message, className = '' }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <View className={`flex-row items-center rounded-xl bg-danger-soft px-3 py-2 ${className}`}>
      <Ionicons name="alert-circle" size={16} color={colors.danger} style={{ marginRight: 6 }} />
      <Text className="flex-1 text-[13px] font-medium text-danger">{message}</Text>
    </View>
  );
}
