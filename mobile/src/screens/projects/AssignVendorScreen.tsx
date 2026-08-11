import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors, shadow } from '../../theme';
import { useAssignVendor, useUserSearch } from '../../api/hooks';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { UserSearchResult } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Mode = 'username' | 'contact';

function Avatar({ user, size = 44 }: { user: UserSearchResult; size?: number }) {
  if (user.avatar_url) {
    return <Image source={{ uri: user.avatar_url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View className="items-center justify-center rounded-full bg-lav" style={{ width: size, height: size }}>
      <Text className="text-sm font-bold text-navy">{initials(user.full_name)}</Text>
    </View>
  );
}

export function AssignVendorScreen({ navigation, route }: RootScreenProps<'AssignVendor'>) {
  const { projectId } = route.params;
  const [mode, setMode] = useState<Mode>('username');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<UserSearchResult | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const assign = useAssignVendor(projectId);
  const results = useUserSearch(mode === 'username' ? search : '');

  const submit = () => {
    setError(null);
    if (mode === 'username') {
      if (!picked) {
        setError('Search and select the vendor.');
        return;
      }
      assign.mutate(
        { vendor_user_id: picked.id },
        { onSuccess: () => navigation.goBack(), onError: (e) => setError(e.message) },
      );
      return;
    }
    if (!identifier.trim()) {
      setError('Enter the vendor’s email or phone number.');
      return;
    }
    assign.mutate(
      { identifier: identifier.trim() },
      { onSuccess: () => navigation.goBack(), onError: (e) => setError(e.message) },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Assign vendor" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[15px] leading-5 text-muted">
          The vendor does the work and gets paid from escrow as milestones are approved. Find them by
          @username, or invite someone new by email/phone.
        </Text>

        {/* Mode toggle */}
        <View className="mt-6 flex-row rounded-2xl bg-page-top p-1" style={{ gap: 4 }}>
          {(['username', 'contact'] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  selection();
                  setMode(m);
                  setError(null);
                  setPicked(null);
                }}
                className="flex-1 items-center justify-center rounded-xl py-2.5"
                style={active ? [{ backgroundColor: colors.white }, shadow.soft] : undefined}
              >
                <Text
                  className={`text-[13px] ${active ? 'font-bold' : 'font-medium'}`}
                  style={{ color: active ? colors.goldDeep : colors.muted }}
                >
                  {m === 'username' ? 'Existing user' : 'Email / phone'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'username' ? (
          picked ? (
            <View className="mt-5 flex-row items-center rounded-2xl bg-success-soft p-3">
              <Avatar user={picked} />
              <View className="ml-3 flex-1 pr-2">
                <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                  {picked.full_name}
                </Text>
                {picked.username ? (
                  <Text className="text-[13px] text-muted" numberOfLines={1}>
                    @{picked.username}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => {
                  selection();
                  setPicked(null);
                }}
                hitSlop={6}
                className="rounded-full bg-white px-3 py-1.5 active:opacity-80"
              >
                <Text className="text-[12px] font-bold text-navy">Change</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Input
                icon="search-outline"
                value={search}
                onChangeText={setSearch}
                placeholder="Search @username or name…"
                autoCapitalize="none"
                autoCorrect={false}
                containerClassName="mt-5"
              />
              {results.isFetching ? (
                <View className="mt-4 items-center">
                  <ActivityIndicator color={colors.navy} />
                </View>
              ) : search.trim().replace(/^@/, '').length < 2 ? (
                <Text className="mt-3 text-[13px] text-muted">Type at least 2 characters to search.</Text>
              ) : (results.data ?? []).length === 0 ? (
                <Text className="mt-3 text-[13px] text-muted">
                  No users found. Switch to Email / phone to invite someone new.
                </Text>
              ) : (
                <View className="mt-2">
                  {(results.data ?? []).map((u) => (
                    <Pressable
                      key={u.id}
                      onPress={() => {
                        selection();
                        setPicked(u);
                        setError(null);
                      }}
                      className="mt-2 flex-row items-center rounded-2xl bg-white p-3 active:opacity-90"
                      style={shadow.soft}
                    >
                      <Avatar user={u} />
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
                      <Ionicons name="chevron-forward" size={18} color={colors.faded} />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )
        ) : (
          <Input
            label="Vendor email or phone"
            icon="at-outline"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="vendor@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            containerClassName="mt-5"
          />
        )}

        <ErrorText message={error} className="mt-4" />

        <Button title="Assign vendor" icon="person-add" onPress={submit} loading={assign.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
