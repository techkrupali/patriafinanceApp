import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { useDevices } from '../../api/hooks';
import { timeLabel } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

const platformGlyph: Record<string, string> = {
  android: '▣',
  ios: '□',
  web: '◍',
};

export function DevicesScreen(_props: RootScreenProps<'Devices'>) {
  const { data: devices, isLoading, error, refetch, isRefetching } = useDevices();

  return (
    <Screen>
      <Header title="Devices" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#001736" />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={() => refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor="#001736" />
          }
        >
          <Text className="mb-4 text-sm text-muted">
            Devices that have signed in to your Patriai account.
          </Text>

          {(devices ?? []).length === 0 ? (
            <EmptyState title="No devices" message="Registered devices will appear here." glyph="◫" />
          ) : (
            <View style={{ gap: 10 }}>
              {(devices ?? []).map((d) => (
                <Card key={d.id} className="flex-row items-center p-4">
                  <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-lav-soft">
                    <Text className="text-lg text-navy">
                      {platformGlyph[d.platform ?? ''] ?? '◫'}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                      {d.device_name ?? 'Unknown device'}
                    </Text>
                    <Text className="mt-0.5 text-xs text-faded">
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
