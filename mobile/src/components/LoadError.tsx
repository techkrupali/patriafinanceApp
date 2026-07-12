import React from 'react';
import { Pressable, Text, View } from 'react-native';

interface LoadErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Graceful error state with a retry action. */
export function LoadError({ message, onRetry, className = '' }: LoadErrorProps) {
  return (
    <View className={`items-center px-8 py-12 ${className}`}>
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft">
        <Text className="text-2xl text-danger">!</Text>
      </View>
      <Text className="text-base font-semibold text-ink">Something went wrong</Text>
      <Text className="mt-1.5 text-center text-sm text-muted">
        {message ?? 'We could not load this right now.'}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="mt-5 rounded-full bg-lav px-6 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-navy">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
