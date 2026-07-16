import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { useAssignVendor } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

export function AssignVendorScreen({ navigation, route }: RootScreenProps<'AssignVendor'>) {
  const { projectId } = route.params;
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const assign = useAssignVendor(projectId);

  const submit = () => {
    setError(null);
    if (!identifier.trim()) {
      setError('Enter the vendor’s email or phone number.');
      return;
    }
    assign.mutate(
      { identifier: identifier.trim() },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e) => setError(e.message),
      },
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
            The vendor is the person who does the work and gets paid from escrow as you approve milestones.
            Add them by the email or phone number tied to their Patriai account.
          </Text>

          <Input
            label="Vendor email or phone"
            icon="at-outline"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="vendor@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            containerClassName="mt-6"
          />

          <View className="mt-5 flex-row items-start rounded-2xl bg-lav-faint p-4">
            <Ionicons name="information-circle" size={18} color={colors.brand} style={{ marginRight: 8, marginTop: 1 }} />
            <Text className="flex-1 text-[13px] leading-5 text-muted">
              Only the vendor and you (the owner) can see this project. You can change the vendor later while
              milestones are still unpaid.
            </Text>
          </View>

          <ErrorText message={error} className="mt-4" />

          <Button title="Assign vendor" icon="person-add" onPress={submit} loading={assign.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
