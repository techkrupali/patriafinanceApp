import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { useUpdateProfile } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import type { RootScreenProps } from '../../navigation/types';

export function EditProfileScreen({ navigation }: RootScreenProps<'EditProfile'>) {
  const user = useAuth((s) => s.user);
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProfile();

  const submit = () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    update.mutate(
      { first_name: firstName.trim(), last_name: lastName.trim() },
      {
        onSuccess: () => {
          Alert.alert('Profile updated', 'Your name has been updated.', [
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
        <Text className="text-[15px] leading-6 text-muted">
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
        </View>
        <ErrorText message={error} className="mt-4" />
        <Button title="Save Changes" icon="checkmark" onPress={submit} loading={update.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
