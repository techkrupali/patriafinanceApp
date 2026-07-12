import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <Card className="p-5">
            <Input
              label="Current password"
              value={current}
              onChangeText={setCurrent}
              placeholder="••••••••"
              secureTextEntry
            />
            <Input
              label="New password"
              value={next}
              onChangeText={setNext}
              placeholder="At least 8 characters"
              secureTextEntry
              className="mt-4"
            />
            <Input
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="••••••••"
              secureTextEntry
              className="mt-4"
            />
            <ErrorText message={error} className="mt-3" />
            <Button title="Update Password" onPress={submit} loading={change.isPending} className="mt-5" />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
