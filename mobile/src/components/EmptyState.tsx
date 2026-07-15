import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  className?: string;
  /** Optional CTA (e.g. a <Button/>) rendered beneath the message. */
  action?: React.ReactNode;
}

export function EmptyState({
  title,
  message,
  icon = 'file-tray-outline',
  className = '',
  action,
}: EmptyStateProps) {
  return (
    <View className={`items-center px-8 py-12 ${className}`}>
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-lav-soft">
        <Ionicons name={icon} size={26} color={colors.navy} />
      </View>
      <Text className="text-base font-bold text-ink">{title}</Text>
      {message ? <Text className="mt-1.5 text-center text-sm text-muted">{message}</Text> : null}
      {action ? <View className="mt-6 w-full">{action}</View> : null}
    </View>
  );
}
