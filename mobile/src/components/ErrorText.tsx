import React from 'react';
import { Text } from 'react-native';

export function ErrorText({ message, className = '' }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return <Text className={`text-sm text-danger ${className}`}>{message}</Text>;
}
