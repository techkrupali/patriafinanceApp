import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { useUpdateProfile, useUpdateAvatar } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import type { RootScreenProps } from '../../navigation/types';

export function EditProfileScreen({ navigation }: RootScreenProps<'EditProfile'>) {
  const user = useAuth((s) => s.user);
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatar_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProfile();
  const uploadAvatar = useUpdateAvatar();

  const changePhoto = async () => {
    selection();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setAvatarUri(asset.uri); // instant preview
    uploadAvatar.mutate(
      { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType },
      {
        onError: (e) => {
          setAvatarUri(user?.avatar_url ?? null);
          Alert.alert('Upload failed', e.message);
        },
      },
    );
  };

  const usernameChanged = username.trim().toLowerCase() !== (user?.username ?? '').toLowerCase();

  const submit = () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (usernameChanged && !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setError('Username must be 3–30 characters: letters, numbers or underscores.');
      return;
    }
    update.mutate(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        // Only send username when it actually changed (avoids a needless unique check).
        ...(usernameChanged ? { username: username.trim() } : {}),
      },
      {
        onSuccess: () => {
          Alert.alert('Profile updated', 'Your profile has been updated.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Edit Profile" />
      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
        {/* Profile picture */}
        <View className="items-center">
          <View>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ width: 96, height: 96, borderRadius: 48 }} />
            ) : (
              <View className="h-24 w-24 items-center justify-center rounded-full bg-lav">
                <Text className="text-2xl font-bold text-navy">{initials(user?.full_name ?? '')}</Text>
              </View>
            )}
            {uploadAvatar.isPending ? (
              <View
                className="items-center justify-center"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 48, backgroundColor: 'rgba(0,0,0,0.35)' }}
              >
                <ActivityIndicator color={colors.white} />
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={changePhoto}
            disabled={uploadAvatar.isPending}
            hitSlop={6}
            className="mt-3 flex-row items-center rounded-full bg-lav px-4 py-2 active:opacity-80"
          >
            <Ionicons name="camera-outline" size={16} color={colors.navy} style={{ marginRight: 6 }} />
            <Text className="text-[13px] font-bold text-navy">
              {avatarUri ? 'Change photo' : 'Add photo'}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-6 text-[15px] leading-6 text-muted">
          Your name appears to family members across shared wallets and approvals.
        </Text>
        <View className="mt-6" style={{ gap: 16 }}>
          <Input
            label="First name"
            icon="person-outline"
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            autoCapitalize="words"
          />
          <Input
            label="Last name"
            icon="person-outline"
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            autoCapitalize="words"
          />
          <View>
            <Input
              label="Username"
              icon="at-outline"
              value={username}
              onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
            <Text className="mt-1.5 ml-1 text-xs text-muted">
              Others can find and invite you by @{username || 'yourname'}. 3–30 letters, numbers or _.
            </Text>
          </View>
        </View>
        <ErrorText message={error} className="mt-4" />
        <Button title="Save Changes" icon="checkmark" onPress={submit} loading={update.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
