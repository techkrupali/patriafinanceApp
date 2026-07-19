import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { selection, notifySuccess } from '../../lib/haptics';
import { useMyVendorProfile, useUpsertVendorProfile } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: { value: string; label: string; icon: IconName }[] = [
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

export function BecomeVendorScreen({ navigation }: RootScreenProps<'BecomeVendor'>) {
  const myProfileQuery = useMyVendorProfile();
  const upsert = useUpsertVendorProfile();

  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('other');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);

  const existing = myProfileQuery.data?.profile ?? null;

  // Seed the form from the saved profile once it loads (never clobber edits).
  const seeded = useRef(false);
  useEffect(() => {
    if (!myProfileQuery.data || seeded.current) return;
    seeded.current = true;
    const p = myProfileQuery.data.profile;
    if (p) {
      setBusinessName(p.business_name);
      setCategory(p.category || 'other');
      setBio(p.bio ?? '');
      setLocation(p.location ?? '');
    }
  }, [myProfileQuery.data]);

  const submit = () => {
    setError(null);
    if (businessName.trim().length < 3) {
      setError('Please enter your business name (at least 3 characters).');
      return;
    }
    upsert.mutate(
      {
        business_name: businessName.trim(),
        category,
        bio: bio.trim() || null,
        location: location.trim() || null,
      },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="My vendor profile" />

      {myProfileQuery.isLoading ? (
        <View className="items-center py-24">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : myProfileQuery.error ? (
        <View className="px-6 pt-2">
          <LoadError
            message={(myProfileQuery.error as Error).message}
            onRetry={() => myProfileQuery.refetch()}
          />
        </View>
      ) : (
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-[15px] leading-5 text-muted">
            {existing
              ? 'Update how families see your business in the directory.'
              : 'List your business in the Patriai directory so families can find and hire you.'}
          </Text>

          {existing?.verified ? (
            <View className="mt-4 flex-row items-center rounded-2xl bg-success-soft px-4 py-3">
              <Ionicons
                name="shield-checkmark"
                size={18}
                color={colors.brand}
                style={{ marginRight: 8 }}
              />
              <Text className="flex-1 text-[13px] font-semibold text-brand">
                Verified vendor — families see a badge next to your business.
              </Text>
            </View>
          ) : null}

          <Input
            label="Business name"
            icon="storefront-outline"
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Adeyemi Builders Ltd"
            maxLength={100}
            containerClassName="mt-6"
          />

          <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Category
          </Text>
          <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
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
                >
                  <Ionicons
                    name={c.icon}
                    size={14}
                    color={active ? colors.white : colors.ink}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Input
            label="Location (optional)"
            icon="location-outline"
            value={location}
            onChangeText={setLocation}
            placeholder="Lagos, Nigeria"
            maxLength={120}
            containerClassName="mt-6"
          />

          <Input
            label="About your business (optional)"
            icon="document-text-outline"
            value={bio}
            onChangeText={setBio}
            placeholder="What you do, how long you've been doing it, what makes you great…"
            multiline
            numberOfLines={4}
            maxLength={1000}
            style={{ minHeight: 100, textAlignVertical: 'top' }}
            containerClassName="mt-6"
          />

          <ErrorText message={error} className="mt-4" />

          <Button
            title={existing ? 'Save profile' : 'List my business'}
            icon="checkmark"
            onPress={submit}
            loading={upsert.isPending}
            className="mt-6"
          />
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}
