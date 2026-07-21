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
import { colors, shadow } from '../../theme';
import { useCreateWallet } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import type { CreatableWalletType } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/** On-gold content colour (Curated Ledger on-primary-container). */
const ON_GOLD = '#3D2F00';
/** Metallic gold container fill (primary-container). */
const GOLD_CONTAINER = '#FFCC00';

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
      <Header title="Create Treasury" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
          {/* Editorial headline (design: create_first_treasury) */}
          <Text className="text-[28px] font-extrabold leading-9 tracking-tight text-navy">
            Create Your Treasury
          </Text>
          <Text className="mt-2 text-[15px] leading-6 text-muted">
            This is where your money will be stored and managed.
          </Text>

          {/* Identity block — name + purpose chips */}
          <View className="mt-6 rounded-3xl bg-white p-5" style={shadow.card}>
            <Input
              label="Treasury name"
              icon="pricetag-outline"
              value={name}
              onChangeText={setName}
              placeholder={type === 'shared' ? 'Family Upkeep' : `My ${selected.title} Treasury`}
              maxLength={100}
            />

            <Text className="mb-3 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Treasury purpose
            </Text>
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
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
                    className={`flex-row items-center rounded-full px-4 py-2.5 active:opacity-90 ${
                      active ? '' : 'bg-lav'
                    }`}
                    style={active ? [{ backgroundColor: GOLD_CONTAINER }, shadow.soft] : undefined}
                  >
                    <Ionicons
                      name={v.icon}
                      size={15}
                      color={active ? ON_GOLD : colors.muted}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      className={`text-[13px] ${active ? 'font-bold' : 'font-semibold text-muted'}`}
                      style={active ? { color: ON_GOLD } : undefined}
                    >
                      {t.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Selected purpose explainer — green tip (design lightbulb box) */}
          <View className="mt-4 flex-row items-start rounded-2xl bg-success-soft p-4">
            <Ionicons name="bulb" size={17} color={colors.brand} style={{ marginRight: 10, marginTop: 1 }} />
            <Text className="flex-1 text-[12px] leading-5 text-brand-deep">{selected.description}</Text>
          </View>

          <Input
            label="Description (optional)"
            icon="document-text-outline"
            value={description}
            onChangeText={setDescription}
            placeholder="What's this treasury for?"
            maxLength={200}
            containerClassName="mt-6"
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
          {showTarget ? (
            <Text className="ml-1 mt-1.5 text-[11px] italic text-muted">You can fund this later</Text>
          ) : null}

          <ErrorText message={error} className="mt-4" />

          <Button title="Create Treasury" icon="checkmark" onPress={submit} loading={create.isPending} className="mt-6" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
