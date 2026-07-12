import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { useCreateWallet } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

const TYPES: { value: 'shared' | 'project'; title: string; description: string; glyph: string }[] = [
  {
    value: 'shared',
    title: 'Shared Wallet',
    description: 'Pool money with family members. Everyone you invite can see and use it.',
    glyph: '⚭',
  },
  {
    value: 'project',
    title: 'Project Wallet',
    description: 'Save toward a goal — school fees, rent, a trip — separate from daily spending.',
    glyph: '◔',
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
        onSuccess: (data) => {
          navigation.replace('WalletDetail', { walletId: data.wallet.id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="New Wallet" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">
            Wallet type
          </Text>

          <View className="mt-3" style={{ gap: 12 }}>
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => setType(t.value)}
                  className={`flex-row items-start rounded-2xl p-4 ${
                    active ? 'border-2 border-navy bg-white' : 'border border-[#e2e8f0] bg-white'
                  } active:opacity-80`}
                >
                  <View
                    className={`mr-3 h-11 w-11 items-center justify-center rounded-2xl ${
                      t.value === 'shared' ? 'bg-success' : 'bg-lav-soft'
                    }`}
                  >
                    <Text className={`text-lg ${t.value === 'shared' ? 'text-brand' : 'text-navy'}`}>
                      {t.glyph}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-bold text-ink">{t.title}</Text>
                    <Text className="mt-1 text-[13px] leading-5 text-muted">{t.description}</Text>
                  </View>
                  <View
                    className={`ml-2 mt-1 h-5 w-5 items-center justify-center rounded-full ${
                      active ? 'bg-navy' : 'border border-[#e2e8f0]'
                    }`}
                  >
                    {active ? <Text className="text-[10px] font-bold text-white">✓</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Input
            label="Wallet name"
            value={name}
            onChangeText={setName}
            placeholder={type === 'shared' ? 'Family Upkeep' : 'School Fees 2026'}
            maxLength={100}
            className="mt-6"
          />

          <ErrorText message={error} className="mt-3" />

          <Button title="Create Wallet" onPress={submit} loading={create.isPending} className="mt-6" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
