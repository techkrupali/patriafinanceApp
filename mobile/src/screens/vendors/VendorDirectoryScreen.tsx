import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useVendors } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { VendorListing } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: { value: string; label: string; icon: IconName }[] = [
  { value: 'all', label: 'All', icon: 'grid-outline' },
  { value: 'construction', label: 'Construction', icon: 'hammer-outline' },
  { value: 'events', label: 'Events', icon: 'balloon-outline' },
  { value: 'catering', label: 'Catering', icon: 'restaurant-outline' },
  { value: 'education', label: 'Education', icon: 'school-outline' },
  { value: 'tech', label: 'Tech', icon: 'laptop-outline' },
  { value: 'logistics', label: 'Logistics', icon: 'car-outline' },
  { value: 'fashion', label: 'Fashion', icon: 'shirt-outline' },
  { value: 'health', label: 'Health', icon: 'medkit-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function VendorCard({ vendor, onPress }: { vendor: VendorListing; onPress: () => void }) {
  return (
    <Card className="mt-3" onPress={onPress}>
      <View className="flex-row items-center">
        <LinearGradient
          colors={gradients.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 46,
            width: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Text className="text-sm font-bold text-white">{vendor.initials}</Text>
        </LinearGradient>

        <View className="flex-1 pr-2">
          <View className="flex-row items-center">
            <Text className="shrink text-[15px] font-bold text-ink" numberOfLines={1}>
              {vendor.business_name}
            </Text>
            {vendor.verified ? (
              <Ionicons
                name="shield-checkmark"
                size={14}
                color={colors.brand}
                style={{ marginLeft: 5 }}
              />
            ) : null}
          </View>
          <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
            {vendor.name}
          </Text>
        </View>

        <View className="rounded-full bg-lav-faint px-2.5 py-1">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {categoryLabel(vendor.category)}
          </Text>
        </View>
      </View>

      {vendor.bio ? (
        <Text className="mt-3 text-[13px] leading-5 text-muted" numberOfLines={2}>
          {vendor.bio}
        </Text>
      ) : null}

      {vendor.location || vendor.projects_completed > 0 ? (
        <View className="mt-3 flex-row items-center">
          {vendor.location ? (
            <View className="flex-row items-center" style={{ marginRight: 6 }}>
              <Ionicons
                name="location-outline"
                size={13}
                color={colors.faded}
                style={{ marginRight: 3 }}
              />
              <Text className="text-xs text-faded" numberOfLines={1}>
                {vendor.location}
              </Text>
            </View>
          ) : null}
          {vendor.projects_completed > 0 ? (
            <Text className="text-xs text-faded">
              {vendor.location ? '· ' : ''}
              {vendor.projects_completed} project{vendor.projects_completed === 1 ? '' : 's'} done
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export function VendorDirectoryScreen({ navigation }: RootScreenProps<'VendorDirectory'>) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const query = useVendors(debouncedQ, category);
  const vendors = query.data?.pages.flatMap((p) => p.vendors) ?? [];

  const openMyProfile = () => {
    selection();
    navigation.navigate('BecomeVendor');
  };

  const right = (
    <Pressable
      onPress={openMyProfile}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
      style={shadow.soft}
    >
      <Ionicons name="person-circle-outline" size={24} color={colors.navy} />
    </Pressable>
  );

  return (
    <Screen withBottomInset>
      <Header title="Vendor directory" right={right} />

      <View className="px-5 pt-2">
        <Input
          icon="search-outline"
          value={q}
          onChangeText={setQ}
          placeholder="Search vendors…"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <View className="mt-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <Pressable
                key={c.value}
                onPress={() => {
                  selection();
                  setCategory(c.value);
                }}
                className={`flex-row items-center rounded-full px-4 py-2.5 active:opacity-90 ${
                  active ? 'bg-navy' : 'bg-lav'
                }`}
                style={active ? shadow.soft : undefined}
              >
                <Ionicons
                  name={c.icon}
                  size={14}
                  color={active ? colors.white : colors.ink}
                  style={{ marginRight: 6 }}
                />
                <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={colors.navy}
          />
        }
      >
        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError
            message={(query.error as Error).message}
            onRetry={() => query.refetch()}
            className="mt-6"
          />
        ) : vendors.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon="storefront-outline"
            title="No vendors found"
            message="Try a different search or category."
          />
        ) : (
          <View>
            {vendors.map((v) => (
              <VendorCard
                key={v.id}
                vendor={v}
                onPress={() => {
                  selection();
                  navigation.navigate('VendorProfile', { profileId: v.id });
                }}
              />
            ))}

            {query.hasNextPage ? (
              <Pressable
                onPress={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="mt-3 items-center rounded-2xl bg-lav-soft py-3.5 active:opacity-80"
              >
                {query.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.navy} />
                ) : (
                  <Text className="text-sm font-semibold text-navy">Load more</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
