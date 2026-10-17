import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { GuidedIntro } from '../../components/GuidedIntro';
import { PurposeGrid } from '../../components/PurposeGrid';
import { FundingSourceSelect } from '../../components/FundingSourceSelect';
import { colors, outline } from '../../theme';
import { useCreateWallet, useWallets } from '../../api/hooks';
import { formatMoney, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import { walletGuide } from '../../lib/walletGuides';
import type { RootScreenProps } from '../../navigation/types';

/** Day money moves each month: today, capped at 28 so every month has it. */
const MONTHLY_DAY = Math.min(new Date().getDate(), 28);

/**
 * Guided setup for one wallet type: its own purposes, then funding (initial
 * deposit + monthly auto-funding) so the wallet is useful the moment it exists.
 */
export function WalletSetupScreen({ navigation, route }: RootScreenProps<'WalletSetup'>) {
  const guide = walletGuide(route.params.type);
  const visual = walletVisual(guide.type);
  const wallets = useWallets();
  const create = useCreateWallet();

  // Only the user's own wallets that money can leave right now.
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked);

  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [deposit, setDeposit] = useState('');
  const [chosenSourceId, setSourceId] = useState<number | null>(null);
  const [monthlyOn, setMonthlyOn] = useState(false);
  const [monthly, setMonthly] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sourceId = chosenSourceId ?? sources.find((w) => w.type === 'main')?.id ?? sources[0]?.id ?? null;
  const source = sources.find((w) => w.id === sourceId);
  const needsSource = Number(deposit) > 0 || monthlyOn;

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your wallet a name.');
      return;
    }
    if (!purpose) {
      setError(`Choose what this ${guide.title.toLowerCase()} is for.`);
      return;
    }
    if (deposit && Number(deposit) > 0 && source && Number(deposit) > parseFloat(source.balance)) {
      setError(`${source.name} only has ${formatMoney(source.balance)} — lower the initial deposit.`);
      return;
    }
    if (monthlyOn && !(Number(monthly) > 0)) {
      setError('Enter the amount to move in every month, or turn monthly auto-funding off.');
      return;
    }
    if (needsSource && !sourceId) {
      setError('Choose the wallet to fund this from.');
      return;
    }

    create.mutate(
      {
        type: guide.type,
        name: name.trim(),
        purpose,
        description: description.trim() || undefined,
        target_amount: guide.showTarget && target ? target : undefined,
        initial_deposit: Number(deposit) > 0 ? deposit : undefined,
        source_wallet_id: needsSource && sourceId ? sourceId : undefined,
        monthly_amount: monthlyOn ? monthly : undefined,
        monthly_day: monthlyOn ? MONTHLY_DAY : undefined,
      },
      {
        onSuccess: (data) => {
          notifySuccess();
          navigation.popToTop();
          navigation.navigate('WalletDetail', { walletId: data.wallet.id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title={`New ${guide.title}`} />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <GuidedIntro step={guide.title} icon={visual.icon} title={`Set Up Your ${guide.title}`} subtitle={guide.explainer} />

        {/* What it is */}
        <View className="mt-6 rounded bg-white p-5" style={outline.card}>
          <Input
            label="Wallet Name"
            value={name}
            onChangeText={setName}
            placeholder={guide.namePlaceholder}
            maxLength={100}
          />

          <Text className="mb-3 mt-6 text-[13px] font-semibold text-muted">Purpose of Wallet</Text>
          <PurposeGrid purposes={guide.purposes} value={purpose} onChange={setPurpose} />

          {guide.showTarget ? (
            <>
              <Input
                label="Target Amount (Optional)"
                prefix="₦"
                value={groupAmountInput(target)}
                onChangeText={(t) => setTarget(sanitizeAmountInput(t))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                containerClassName="mt-6"
              />
              <Text className="ml-1 mt-1.5 text-[12px] text-muted">We'll show your progress toward this number.</Text>
            </>
          ) : null}

          <Input
            label="Description (Optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="A note for you and anyone you invite"
            maxLength={200}
            containerClassName="mt-6"
          />
        </View>

        {/* Funding */}
        <View className="mt-4 rounded bg-white p-5" style={outline.card}>
          <Text className="text-[16px] font-bold text-ink">Fund Your Wallet</Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted">Optional — you can also fund it later.</Text>

          <Input
            label="Initial Deposit"
            prefix="₦"
            value={groupAmountInput(deposit)}
            onChangeText={(t) => setDeposit(sanitizeAmountInput(t))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            containerClassName="mt-5"
          />

          <FundingSourceSelect
            label="Funding Source"
            wallets={sources}
            value={sourceId}
            onChange={setSourceId}
            className="mt-5"
          />

          {guide.showMonthly ? (
            <View className="mt-5 rounded bg-lav-faint p-4">
              <View className="flex-row items-center">
                <Ionicons name="flash" size={18} color={colors.brand} style={{ marginRight: 10 }} />
                <View className="flex-1 pr-2">
                  <Text className="text-[15px] font-bold text-ink">Monthly Auto-Funding</Text>
                  <Text className="text-[12px] text-muted">Move money in automatically every month.</Text>
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
                    placeholder="Monthly amount"
                    keyboardType="decimal-pad"
                    containerClassName="mt-4"
                  />
                  <Text className="ml-1 mt-1.5 text-[12px] text-muted">
                    Moves from {source?.name ?? 'your funding source'} on day {MONTHLY_DAY} of every month.
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        <ErrorText message={error} className="mt-4" />

        <Button title={`Create ${guide.title}`} icon="checkmark" onPress={submit} loading={create.isPending} className="mt-6" />
        <Button title="Cancel Setup" variant="secondary" onPress={() => navigation.goBack()} className="mt-3" />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
