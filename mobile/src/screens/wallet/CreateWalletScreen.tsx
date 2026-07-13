import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { useCreateWallet } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TYPES: { value: 'shared' | 'project'; title: string; description: string; icon: IconName; tint: string; iconColor: string }[] = [
  {
    value: 'shared',
    title: 'Shared Wallet',
    description: 'Pool money with family members. Everyone you invite can see and use it.',
    icon: 'people',
    tint: 'bg-success-soft',
    iconColor: colors.brand,
  },
  {
    value: 'project',
    title: 'Project Wallet',
    description: 'Save toward a goal — school fees, rent, a trip — separate from daily spending.',
    icon: 'flag',
    tint: 'bg-lav-soft',
    iconColor: colors.brand,
  },
];

export function CreateWalletScreen({ navigation }: RootScreenProps<'CreateWallet'>) {
  const [type, setType] = useState<'shared' | 'project'>('shared');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateWallet();

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your wallet a name.');
      return;
    }
    create.mutate(
      { type, name: name.trim() },
      {
        onSuccess: (data) => navigation.replace('WalletDetail', { walletId: data.wallet.id }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="New Wallet" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Wallet type</Text>

          <View className="mt-3" style={{ gap: 12 }}>
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => {
                    selection();
                    setType(t.value);
                  }}
                  className={`flex-row items-start rounded-3xl border p-4 active:opacity-90 ${
                    active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                  }`}
                >
                  <View className={`mr-3 h-11 w-11 items-center justify-center rounded-2xl ${t.tint}`}>
                    <Ionicons name={t.icon} size={22} color={t.iconColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-ink">{t.title}</Text>
                    <Text className="mt-1 text-[13px] leading-5 text-muted">{t.description}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={active ? colors.brand : colors.faded}
                    style={{ marginLeft: 8, marginTop: 2 }}
                  />
                </Pressable>
              );
            })}
          </View>

          <Input
            label="Wallet name"
            icon="pricetag-outline"
            value={name}
            onChangeText={setName}
            placeholder={type === 'shared' ? 'Family Upkeep' : 'School Fees 2026'}
            maxLength={100}
            containerClassName="mt-6"
          />

          <ErrorText message={error} className="mt-4" />

          <Button title="Create Wallet" icon="checkmark" onPress={submit} loading={create.isPending} className="mt-6" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
