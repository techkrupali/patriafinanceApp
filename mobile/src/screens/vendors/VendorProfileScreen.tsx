import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useVendor } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_META: Record<string, { label: string; icon: IconName }> = {
  construction: { label: 'Construction', icon: 'hammer-outline' },
  events: { label: 'Events', icon: 'balloon-outline' },
  catering: { label: 'Catering', icon: 'restaurant-outline' },
  education: { label: 'Education', icon: 'school-outline' },
  tech: { label: 'Tech', icon: 'laptop-outline' },
  logistics: { label: 'Logistics', icon: 'car-outline' },
  fashion: { label: 'Fashion', icon: 'shirt-outline' },
  health: { label: 'Health', icon: 'medkit-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
};

function HeroPill({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View className="flex-row items-center rounded-full bg-white/15 px-3 py-1.5">
      <Ionicons name={icon} size={13} color={colors.white} style={{ marginRight: 5 }} />
      <Text className="text-[12px] font-semibold text-white" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-4" style={shadow.soft}>
      <Text className="text-[22px] font-extrabold leading-tight text-ink" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</Text>
    </View>
  );
}

export function VendorProfileScreen({ route, navigation }: RootScreenProps<'VendorProfile'>) {
  const { profileId } = route.params;
  const q = useVendor(profileId);
  const [copied, setCopied] = useState(false);

  const v = q.data;

  const copyEmail = async () => {
    if (!v?.email) return;
    selection();
    await Clipboard.setStringAsync(v.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const memberSinceYear = (() => {
    if (!v?.member_since) return '—';
    const d = new Date(v.member_since);
    return Number.isNaN(d.getTime()) ? '—' : String(d.getFullYear());
  })();

  const category = v ? CATEGORY_META[v.category] ?? CATEGORY_META.other : CATEGORY_META.other;

  return (
    <Screen withBottomInset>
      <Header title="Vendor" />

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : q.error || !v ? (
        <LoadError message={(q.error as Error)?.message} onRetry={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.navy} />
          }
        >
          {/* Hero */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="items-center">
              <View className="h-20 w-20 items-center justify-center rounded-full bg-white/15">
                <Text className="text-[26px] font-extrabold text-white">{v.initials}</Text>
              </View>
              <View className="mt-4 flex-row items-center px-2">
                <Text
                  className="text-center text-[24px] font-extrabold leading-tight tracking-tight text-white"
                  numberOfLines={2}
                >
                  {v.business_name}
                </Text>
                {v.verified ? (
                  <Ionicons name="shield-checkmark" size={19} color={colors.gold} style={{ marginLeft: 7 }} />
                ) : null}
              </View>
              <Text className="mt-1 text-[13px] text-white/60" numberOfLines={1}>
                {v.name}
              </Text>
              <View className="mt-4 flex-row flex-wrap justify-center" style={{ gap: 8 }}>
                <HeroPill icon={category.icon} label={category.label} />
                {v.location ? <HeroPill icon="location-outline" label={v.location} /> : null}
              </View>
            </View>
          </LinearGradient>

          {/* Stats strip */}
          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <StatTile value={v.projects_completed} label="Projects done" />
            <StatTile value={memberSinceYear} label="Member since" />
            <StatTile value={v.verified ? 'Yes' : 'No'} label="Verified" />
          </View>

          {/* About */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">About</Text>
          <Card className="mt-3">
            {v.bio ? (
              <Text className="text-[14px] leading-[21px] text-ink">{v.bio}</Text>
            ) : (
              <Text className="text-[14px] leading-[21px] text-muted">
                This vendor hasn't written a bio yet.
              </Text>
            )}
          </Card>

          {/* Contact & hire */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
            Work with this vendor
          </Text>
          <Card className="mt-3">
            <View className="flex-row items-start">
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-lav-soft">
                <Ionicons name="shield-outline" size={20} color={colors.navy} />
              </View>
              <Text className="flex-1 text-[13px] leading-[19px] text-muted">
                Assign this vendor to one of your projects to pay them safely through milestone escrow.
              </Text>
            </View>

            <View className="mt-4 flex-row items-center rounded-2xl bg-lav-faint px-4 py-3">
              <Ionicons name="mail-outline" size={16} color={colors.muted} style={{ marginRight: 10 }} />
              <Text className="flex-1 text-[14px] font-semibold text-ink" numberOfLines={1}>
                {v.email}
              </Text>
              <Pressable
                onPress={() => void copyEmail()}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-lav active:opacity-80"
              >
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={17}
                  color={copied ? colors.brand : colors.navy}
                />
              </Pressable>
            </View>

            <Button
              title="Open my projects"
              icon="briefcase-outline"
              onPress={() => navigation.navigate('Projects')}
              className="mt-4"
            />
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}
