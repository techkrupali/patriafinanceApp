import React from 'react';
import { Text, View } from 'react-native';

interface EmptyStateProps {
  title: string;
  message?: string;
  glyph?: string;
  className?: string;
}

export function EmptyState({ title, message, glyph = '◎', className = '' }: EmptyStateProps) {
  return (
    <View className={`items-center px-8 py-12 ${className}`}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-lav-soft">
        <Text className="text-2xl text-navy">{glyph}</Text>
      </View>
      <Text className="text-base font-semibold text-ink">{title}</Text>
      {message ? (
        <Text className="mt-1.5 text-center text-sm text-muted">{message}</Text>
      ) : null}
    </View>
  );
}
