import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Input } from './Input';
import { colors, outline } from '../theme';
import { useUserSearch } from '../api/hooks';
import { initials } from '../lib/format';
import { selection } from '../lib/haptics';
import type { UserSearchResult } from '../api/types';

/** Avatar for a Patriai user — image if set, else initials on a tinted circle. */
export function PersonAvatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View className="items-center justify-center rounded-full bg-lav" style={{ width: size, height: size }}>
      <Text className="text-[13px] font-bold text-navy">{initials(name)}</Text>
    </View>
  );
}

interface PersonPickerProps {
  value: UserSearchResult | null;
  onChange: (user: UserSearchResult | null) => void;
  /** Users who can't be picked here (already chosen elsewhere). */
  excludeIds?: number[];
  label?: string;
  className?: string;
}

/**
 * Find an existing Patriai user by @username or name. Emergency approvers and
 * recipients must have Patriai accounts so money can reach them instantly.
 */
export function PersonPicker({ value, onChange, excludeIds = [], label, className = '' }: PersonPickerProps) {
  const [search, setSearch] = useState('');
  const results = useUserSearch(value ? '' : search);
  const matches = (results.data ?? []).filter((u) => !excludeIds.includes(u.id));

  if (value) {
    return (
      <View className={className}>
        {label ? <Text className="mb-2 text-[13px] font-semibold text-muted">{label}</Text> : null}
        <View className="flex-row items-center rounded bg-success-soft p-3">
          <PersonAvatar name={value.full_name} avatarUrl={value.avatar_url} />
          <View className="ml-3 flex-1 pr-2">
            <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
              {value.full_name}
            </Text>
            {value.username ? (
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                @{value.username}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              selection();
              onChange(null);
            }}
            hitSlop={6}
            className="rounded bg-white px-3 py-1.5 active:opacity-80"
          >
            <Text className="text-[12px] font-bold text-navy">Change</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className={className}>
      <Input
        label={label}
        icon="search-outline"
        value={search}
        onChangeText={setSearch}
        placeholder="Search @username or name…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {results.isFetching ? (
        <View className="mt-3 items-center">
          <ActivityIndicator color={colors.navy} />
        </View>
      ) : search.trim().replace(/^@/, '').length < 2 ? (
        <Text className="mt-2 text-[12px] text-muted">They need a Patriai account. Type at least 2 characters.</Text>
      ) : matches.length === 0 ? (
        <Text className="mt-2 text-[12px] text-muted">No Patriai user found. Ask them to join Patriai first.</Text>
      ) : (
        <View className="mt-1">
          {matches.map((u) => (
            <Pressable
              key={u.id}
              onPress={() => {
                selection();
                onChange(u);
                setSearch('');
              }}
              className="mt-2 flex-row items-center rounded bg-white p-3 active:opacity-90"
              style={outline.card}
            >
              <PersonAvatar name={u.full_name} avatarUrl={u.avatar_url} />
              <View className="ml-3 flex-1 pr-2">
                <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                  {u.full_name}
                </Text>
                {u.username ? (
                  <Text className="text-[13px] text-muted" numberOfLines={1}>
                    @{u.username}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
