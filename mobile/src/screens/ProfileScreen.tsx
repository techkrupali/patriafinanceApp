import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useLogoutApi } from '../api/hooks';
import { useAuth } from '../store/auth';
import { initials } from '../lib/format';
import type { TabScreenProps } from '../navigation/types';

function Row({
  glyph,
  title,
  subtitle,
  onPress,
  right,
}: {
  glyph: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center py-3.5 active:opacity-70"
    >
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-lav-soft">
        <Text className="text-base text-navy">{glyph}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-muted">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text className="text-lg text-faded">›</Text> : null)}
    </Pressable>
  );
}

export function ProfileScreen({ navigation }: TabScreenProps<'Profile'>) {
  const user = useAuth((s) => s.user);
  const logoutLocal = useAuth((s) => s.logout);
  const logoutApi = useLogoutApi();
  const qc = useQueryClient();

  const confirmLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          logoutApi.mutate(undefined, {
            onSettled: async () => {
              await logoutLocal();
              qc.clear();
            },
          });
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="text-2xl font-bold text-ink">Profile</Text>

        {/* Identity card */}
        <Card className="mt-5 items-center p-6">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-navy">
            <Text className="text-xl font-bold text-white">{initials(user?.full_name)}</Text>
          </View>
          <Text className="mt-3 text-lg font-bold text-ink">{user?.full_name}</Text>
          <Text className="mt-1 text-sm text-muted">{user?.email}</Text>
          <Text className="mt-0.5 text-sm text-muted">{user?.phone}</Text>

          <View className="mt-4 flex-row items-center rounded-full bg-success px-3.5 py-1.5">
            <Text className="text-[11px] font-bold tracking-widest text-brand">
              KYC TIER {user?.kyc_tier ?? 0}
            </Text>
          </View>
          <Text className="mt-1.5 text-[11px] text-faded">Upgrade in Milestone 4</Text>
        </Card>

        {/* Security */}
        <Text className="mt-7 text-[11px] font-bold uppercase tracking-widest text-muted">
          Security
        </Text>
        <Card className="mt-2 px-4 py-1">
          <Row
            glyph="🔑"
            title="Change Password"
            subtitle="Update your sign-in password"
            onPress={() => navigation.navigate('ChangePassword')}
          />
          <View style={{ height: 1, backgroundColor: '#eff4ff' }} />
          <Row
            glyph="▦"
            title="Change Transaction PIN"
            subtitle="4-digit PIN used to authorize money movement"
            onPress={() => navigation.navigate('ChangePin')}
          />
          <View style={{ height: 1, backgroundColor: '#eff4ff' }} />
          <Row
            glyph="◫"
            title="Devices"
            subtitle="Where you're signed in"
            onPress={() => navigation.navigate('Devices')}
          />
        </Card>

        <Button
          title="Log Out"
          variant="danger"
          onPress={confirmLogout}
          loading={logoutApi.isPending}
          className="mt-8"
        />
      </ScrollView>
    </Screen>
  );
}
