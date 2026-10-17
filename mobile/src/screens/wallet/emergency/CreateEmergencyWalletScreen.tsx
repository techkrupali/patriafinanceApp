import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../../components/KeyboardAwareScrollView';
import { Screen } from '../../../components/Screen';
import { Header } from '../../../components/Header';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { ErrorText } from '../../../components/ErrorText';
import { GuidedIntro } from '../../../components/GuidedIntro';
import { PurposeGrid } from '../../../components/PurposeGrid';
import { FundingSourceSelect } from '../../../components/FundingSourceSelect';
import { colors, outline } from '../../../theme';
import { useWallets } from '../../../api/hooks';
import { formatMoney, groupAmountInput, sanitizeAmountInput } from '../../../lib/format';
import { EMERGENCY_PURPOSES, walletGuide } from '../../../lib/walletGuides';
import type { EmergencyPurpose } from '../../../api/types';
import type { RootScreenProps } from '../../../navigation/types';

/**
 * Emergency wallet — Step 1 of 2 (client design "Create Emergency Wallet"):
 * what kind of emergency, how much goes in now, from where, and monthly
 * auto-funding. Step 2 sets who can unlock it and who receives the money.
 */
export function CreateEmergencyWalletScreen({ navigation, route }: RootScreenProps<'CreateEmergencyWallet'>) {
  const initial = route.params?.draft;
  const guide = walletGuide('emergency');
  const wallets = useWallets();
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked);

  const [name, setName] = useState(initial?.name ?? '');
  const [purpose, setPurpose] = useState<EmergencyPurpose | null>(initial?.purpose ?? null);
  const [deposit, setDeposit] = useState(initial?.initialDeposit ?? '');
  const [chosenSourceId, setSourceId] = useState<number | null>(initial?.sourceWalletId ?? null);
  const [monthlyOn, setMonthlyOn] = useState(Boolean(initial?.monthlyAmount));
  const [monthly, setMonthly] = useState(initial?.monthlyAmount ?? '');
  const [error, setError] = useState<string | null>(null);

  const sourceId = chosenSourceId ?? sources.find((w) => w.type === 'main')?.id ?? sources[0]?.id ?? null;
  const source = sources.find((w) => w.id === sourceId);

  const next = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your emergency wallet a name.');
      return;
    }
    if (!purpose) {
      setError('Choose what kind of emergency this wallet is for.');
      return;
    }
    if (Number(deposit) > 0 && source && Number(deposit) > parseFloat(source.balance)) {
      setError(`${source.name} only has ${formatMoney(source.balance)} — lower the initial deposit.`);
      return;
    }
    if (monthlyOn && !(Number(monthly) > 0)) {
      setError('Enter your monthly contribution, or turn monthly auto-funding off.');
      return;
    }
    if ((Number(deposit) > 0 || monthlyOn) && !sourceId) {
      setError('Choose the wallet to fund this from.');
      return;
    }

    navigation.navigate('EmergencyAccessRules', {
      draft: {
        name: name.trim(),
        purpose,
        initialDeposit: Number(deposit) > 0 ? deposit : '',
        sourceWalletId: sourceId,
        monthlyAmount: monthlyOn ? monthly : '',
      },
    });
  };

  return (
    <Screen withBottomInset>
      <Header title="Emergency Wallet" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <GuidedIntro step="Step 1 of 2" title="Create Emergency Wallet" subtitle={guide.explainer} />

        <View className="mt-6 rounded bg-white p-5" style={outline.card}>
          <Input
            label="Wallet Name"
            value={name}
            onChangeText={setName}
            placeholder={guide.namePlaceholder}
            maxLength={100}
          />

          <Text className="mb-3 mt-6 text-[13px] font-semibold text-muted">Purpose of Wallet</Text>
          <PurposeGrid purposes={EMERGENCY_PURPOSES} value={purpose} onChange={setPurpose} />
          <Text className="ml-1 mt-2 text-[12px] text-muted">What kind of emergency is this money for?</Text>

          <Input
            label="Initial Deposit (₦)"
            prefix="₦"
            value={groupAmountInput(deposit)}
            onChangeText={(t) => setDeposit(sanitizeAmountInput(t))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            containerClassName="mt-6"
          />

          <FundingSourceSelect
            label="Funding Source"
            wallets={sources}
            value={sourceId}
            onChange={setSourceId}
            className="mt-5"
          />

          <View className="mt-6 rounded bg-lav-faint p-4">
            <View className="flex-row items-center">
              <Ionicons name="flash" size={18} color={colors.brand} style={{ marginRight: 10 }} />
              <View className="flex-1 pr-2">
                <Text className="text-[15px] font-bold text-ink">Monthly Auto-Funding</Text>
                <Text className="text-[12px] text-muted">Automate your emergency resilience.</Text>
              </View>
              <Switch
                value={monthlyOn}
                onValueChange={setMonthlyOn}
                trackColor={{ false: colors.lav, true: colors.brand }}
                thumbColor={colors.white}
              />
            </View>
            {monthlyOn ? (
              <>
                <Input
                  prefix="₦"
                  value={groupAmountInput(monthly)}
                  onChangeText={(t) => setMonthly(sanitizeAmountInput(t))}
                  placeholder="Monthly Contribution Amount"
                  keyboardType="decimal-pad"
                  containerClassName="mt-4"
                />
                <Text className="ml-1 mt-1.5 text-[12px] text-muted">
                  Moves from {source?.name ?? 'your funding source'} every month.
                </Text>
              </>
            ) : null}
          </View>

          <ErrorText message={error} className="mt-4" />

          <Button title="Next: Access Rules" icon="arrow-forward" onPress={next} className="mt-6" />
          <Button title="Cancel Setup" variant="secondary" onPress={() => navigation.goBack()} className="mt-3" />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
