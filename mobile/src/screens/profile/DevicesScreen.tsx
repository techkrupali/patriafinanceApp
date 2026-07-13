import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useDevices } from '../../api/hooks';
import { timeLabel } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const platformIcon: Record<string, IconName> = {
  android: 'logo-android',
  ios: 'logo-apple',
  web: 'globe-outline',
};

export function DevicesScreen(_props: RootScreenProps<'Devices'>) {
  const { data: devices, isLoading, error, refetch, isRefetching } = useDevices();

  return (
    <Screen>
      <Header title="Devices" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={() => refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />
          }
        >
          <Text className="mb-4 text-[15px] text-muted">
            Devices that have signed in to your Patriai account.
          </Text>

          {(devices ?? []).length === 0 ? (
            <EmptyState title="No devices" message="Registered devices will appear here." icon="phone-portrait-outline" />
          ) : (
            <View style={{ gap: 10 }}>
              {(devices ?? []).map((d) => (
                <Card key={d.id} className="flex-row items-center p-4">
                  <View className="mr-3.5 h-11 w-11 items-center justify-center rounded-full bg-lav-soft">
                    <Ionicons name={platformIcon[d.platform ?? ''] ?? 'hardware-chip-outline'} size={22} color={colors.brand} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-medium text-ink" numberOfLines={1}>
                      {d.device_name ?? 'Unknown device'}
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted">
                      {d.platform ? `${d.platform} · ` : ''}
                      Last active {d.last_active_at ? timeLabel(d.last_active_at) : 'unknown'}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
