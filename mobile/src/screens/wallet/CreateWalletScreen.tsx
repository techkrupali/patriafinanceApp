import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { useCreateWallet } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import type { CreatableWalletType } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

interface TypeOption {
  value: CreatableWalletType;
  title: string;
  description: string;
}

const TYPES: TypeOption[] = [
  { value: 'shared', title: 'Shared', description: 'Pool money with people you invite. Everyone can see and use it together.' },
  { value: 'savings', title: 'Savings', description: 'Set money aside and watch it grow toward a target you choose.' },
  { value: 'goal', title: 'Goal', description: 'Save toward a specific goal amount — a trip, a gadget, a dream.' },
  { value: 'project', title: 'Project', description: 'Ring-fence money for a specific project or bill, away from daily spending.' },
  { value: 'emergency', title: 'Emergency', description: 'A rainy-day buffer set aside for the unexpected.' },
  { value: 'giving', title: 'Giving', description: 'Set aside money for donations, tithes and causes you care about.' },
  { value: 'joint', title: 'Joint', description: 'Shared with a partner — both of you manage it together.' },
  { value: 'child', title: 'Child', description: 'Manage money on behalf of a child, with you in control.' },
  { value: 'spending', title: 'Spending', description: 'Everyday spending, kept separate from your main balance.' },
];

/** Types that save toward a number — show the optional target-amount field. */
const TARGETED: CreatableWalletType[] = ['goal', 'savings'];

export function CreateWalletScreen({ navigation }: RootScreenProps<'CreateWallet'>) {
  const [type, setType] = useState<CreatableWalletType>('shared');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateWallet();

  const selected = TYPES.find((t) => t.value === type)!;
  const showTarget = TARGETED.includes(type);

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your wallet a name.');
      return;
    }
    create.mutate(
      {
        type,
        name: name.trim(),
        description: description.trim() || undefined,
        target_amount: showTarget && target.trim() ? target.trim() : undefined,
      },
      {
        onSuccess: (data) => navigation.replace('WalletDetail', { walletId: data.wallet.id }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="New Wallet" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Wallet type</Text>

          <View className="mt-3 flex-row flex-wrap justify-between">
            {TYPES.map((t) => {
              const active = type === t.value;
              const v = walletVisual(t.value);
              return (
                <Pressable
                  key={t.value}
                  onPress={() => {
                    selection();
                    setType(t.value);
                  }}
                  style={{ width: '31.5%', marginBottom: 12 }}
                  className={`items-center rounded-3xl border px-2 py-4 active:opacity-90 ${
                    active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                  }`}
                >
                  <View
                    className="h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: active ? colors.brand : colors.lavSoft }}
                  >
                    <Ionicons name={v.icon} size={21} color={active ? colors.white : colors.navy} />
                  </View>
                  <Text
                    className={`mt-2 text-[12px] font-bold ${active ? 'text-brand' : 'text-ink'}`}
                    numberOfLines={1}
                  >
                    {t.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Selected type explainer */}
          <View className="mt-1 flex-row items-start rounded-2xl bg-lav-faint p-4">
            <Ionicons name="information-circle" size={18} color={colors.brand} style={{ marginRight: 8, marginTop: 1 }} />
            <Text className="flex-1 text-[13px] leading-5 text-muted">{selected.description}</Text>
          </View>

          <Input
            label="Wallet name"
            icon="pricetag-outline"
            value={name}
            onChangeText={setName}
            placeholder={type === 'shared' ? 'Family Upkeep' : `My ${selected.title} Wallet`}
            maxLength={100}
            containerClassName="mt-6"
          />

          <Input
            label="Description (optional)"
            icon="document-text-outline"
            value={description}
            onChangeText={setDescription}
            placeholder="What's this wallet for?"
            maxLength={200}
            containerClassName="mt-5"
          />

          {showTarget ? (
            <Input
              label="Target amount (optional)"
              icon="flag-outline"
              value={target}
              onChangeText={(t) => setTarget(t.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              containerClassName="mt-5"
            />
          ) : null}

          <ErrorText message={error} className="mt-4" />

          <Button title="Create Wallet" icon="checkmark" onPress={submit} loading={create.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
