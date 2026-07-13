import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { useChangePin } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { saveTxnPin } from '../../lib/biometrics';
import type { RootScreenProps } from '../../navigation/types';

export function ChangePinScreen({ navigation }: RootScreenProps<'ChangePin'>) {
  const user = useAuth((s) => s.user);
  const biometricEnabled = useAuth((s) => s.biometricEnabled);
  const hasPin = user?.has_pin ?? true;

  const [password, setPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangePin();

  const submit = () => {
    setError(null);
    if (!password) {
      setError('Enter your password to confirm it is you.');
      return;
    }
    if (hasPin && currentPin.length !== 4) {
      setError('Enter your current 4-digit PIN.');
      return;
    }
    if (newPin.length !== 4) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PINs do not match.');
      return;
    }
    change.mutate(
      { password, new_pin: newPin, ...(hasPin ? { current_pin: currentPin } : {}) },
      {
        onSuccess: async () => {
          // Keep the biometric-cached PIN in sync so authorize keeps working.
          if (biometricEnabled) await saveTxnPin(newPin);
          Alert.alert('PIN updated', 'Your transaction PIN has been changed.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Change PIN" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <Text className="text-[15px] leading-6 text-muted">
            Your PIN authorizes every transfer and withdrawal. Keep it secret.
          </Text>
          <View className="mt-6" style={{ gap: 16 }}>
            <Input
              label="Account password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
            />
            {hasPin ? (
              <Input
                label="Current PIN"
                icon="keypad-outline"
                value={currentPin}
                onChangeText={(t) => setCurrentPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="••••"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
              />
            ) : null}
            <Input
              label="New PIN"
              icon="keypad-outline"
              value={newPin}
              onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <Input
              label="Confirm new PIN"
              icon="keypad-outline"
              value={confirmPin}
              onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="••••"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
          </View>
          <ErrorText message={error} className="mt-4" />
          <Button title="Update PIN" icon="checkmark" onPress={submit} loading={change.isPending} className="mt-6" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
