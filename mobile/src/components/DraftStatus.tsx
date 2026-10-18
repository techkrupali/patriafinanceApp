import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import type { DraftStatus as Status } from '../lib/drafts';

const COPY: Record<Exclude<Status, 'idle'>, { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color: string }> = {
  saving: { icon: 'cloud-upload-outline', text: 'Saving draft…', color: colors.muted },
  saved: { icon: 'cloud-done-outline', text: 'Draft saved', color: colors.brand },
  error: { icon: 'cloud-offline-outline', text: 'Draft not saved', color: colors.danger },
};

/** Small "Draft saved" line under a setup screen's intro. */
export function DraftStatus({ status, className = '' }: { status: Status; className?: string }) {
  if (status === 'idle') return null;
  const c = COPY[status];
  return (
    <View className={`flex-row items-center justify-center ${className}`}>
      <Ionicons name={c.icon} size={13} color={c.color} style={{ marginRight: 4 }} />
      <Text className="text-[12px] font-medium" style={{ color: c.color }}>
        {c.text}
      </Text>
    </View>
  );
}
