import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { colors } from '../../theme';
import { useCreateInvitation } from '../../api/hooks';
import { ROLE_OPTIONS, roleLabel } from '../../lib/governance';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

export function InviteMemberScreen({ navigation, route }: RootScreenProps<'InviteMember'>) {
  const { walletId } = route.params;
  const [identifier, setIdentifier] = useState('');
  const [role, setRole] = useState<string>('contributor');
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const invite = useCreateInvitation(walletId);

  const submit = () => {
    setError(null);
    if (!identifier.trim()) {
      setError('Enter an email or phone number to invite.');
      return;
    }
    invite.mutate(
      { identifier: identifier.trim(), role, can_approve: canApprove },
      {
        onSuccess: () => setSent(true),
        onError: (e) => setError(e.message),
      },
    );
  };

  if (sent) {
    return (
      <Screen withBottomInset>
        <SuccessReceipt
          title="Invitation sent"
          subtitle={`${identifier.trim()} will see this invite when they open Patriai.`}
          rows={[
            { label: 'Invited', value: identifier.trim() },
            { label: 'Role', value: roleLabel(role) },
            { label: 'Can approve', value: canApprove ? 'Yes' : 'No' },
          ]}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Invite member" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
          <Text className="text-[15px] leading-5 text-muted">
            Invite someone by email or phone. They'll get a pending invitation to accept.
          </Text>

          <Input
            label="Email or phone"
            icon="at-outline"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="them@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            containerClassName="mt-6"
          />

          <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">Role</Text>
          <View className="mt-2" style={{ gap: 10 }}>
            {ROLE_OPTIONS.map((r) => {
              const active = role === r.value;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => {
                    selection();
                    setRole(r.value);
                  }}
                  className={`flex-row items-center rounded-2xl border p-4 active:opacity-90 ${
                    active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                  }`}
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-[15px] font-bold text-ink">{r.label}</Text>
                    <Text className="mt-0.5 text-[13px] text-muted">{r.hint}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={active ? colors.brand : colors.faded}
                  />
                </Pressable>
              );
            })}
          </View>

          <View className="mt-5 flex-row items-center rounded-2xl bg-lav-faint p-4">
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.navy} style={{ marginRight: 10 }} />
            <View className="flex-1 pr-2">
              <Text className="text-[15px] font-semibold text-ink">Can approve spends</Text>
              <Text className="mt-0.5 text-[13px] text-muted">
                Let this member approve withdrawals & transfers that need sign-off.
              </Text>
            </View>
            <Switch
              value={canApprove}
              onValueChange={setCanApprove}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={colors.white}
            />
          </View>

          <ErrorText message={error} className="mt-4" />

          <Button title="Send invitation" icon="paper-plane" onPress={submit} loading={invite.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
