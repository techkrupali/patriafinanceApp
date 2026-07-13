import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { selection } from '../lib/haptics';

interface LoadErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Graceful error state with a retry action. */
export function LoadError({ message, onRetry, className = '' }: LoadErrorProps) {
  return (
    <View className={`items-center px-8 py-12 ${className}`}>
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-danger-soft">
        <Ionicons name="cloud-offline-outline" size={26} color={colors.danger} />
      </View>
      <Text className="text-base font-bold text-ink">Something went wrong</Text>
      <Text className="mt-1.5 text-center text-sm text-muted">
        {message ?? 'We could not load this right now.'}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={() => {
            selection();
            onRetry();
          }}
          className="mt-5 flex-row items-center rounded-full bg-lav px-6 py-2.5 active:opacity-80"
        >
          <Ionicons name="refresh" size={16} color={colors.navy} style={{ marginRight: 6 }} />
          <Text className="text-sm font-semibold text-navy">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
