import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { useChangePassword } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

export function ChangePasswordScreen({ navigation }: RootScreenProps<'ChangePassword'>) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangePassword();

  const submit = () => {
    setError(null);
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          Alert.alert('Password changed', 'Your password has been updated.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Change Password" />
      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
          <Text className="text-[15px] leading-6 text-muted">
            Choose a strong password you don't use anywhere else.
          </Text>
          <View className="mt-6" style={{ gap: 16 }}>
            <Input
              label="Current password"
              icon="lock-closed-outline"
              value={current}
              onChangeText={setCurrent}
              placeholder="Your current password"
              secureTextEntry
            />
            <Input
              label="New password"
              icon="lock-open-outline"
              value={next}
              onChangeText={setNext}
              placeholder="At least 8 characters"
              secureTextEntry
            />
            <Input
              label="Confirm new password"
              icon="lock-open-outline"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Re-enter new password"
              secureTextEntry
            />
          </View>
          <ErrorText message={error} className="mt-4" />
          <Button title="Update Password" icon="checkmark" onPress={submit} loading={change.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
