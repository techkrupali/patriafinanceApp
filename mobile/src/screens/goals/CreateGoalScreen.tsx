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
import { colors } from '../../theme';
import { useWallets, useCreateWallet, useCreateAutomation } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection, notifySuccess } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import type { Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type GoalType = 'savings' | 'goal' | 'emergency' | 'giving';

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: 'savings', label: 'Savings' },
  { value: 'goal', label: 'Goal' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'giving', label: 'Giving' },
];

export function CreateGoalScreen({ navigation }: RootScreenProps<'CreateGoal'>) {
  const wallets = useWallets();
  const createWallet = useCreateWallet();
  const createAuto = useCreateAutomation();

  const owned = (wallets.data ?? []).filter((w) => w.my_role === 'owner');

  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('goal');
  const [target, setTarget] = useState('');
  const [autoFund, setAutoFund] = useState(false);
  const [fromId, setFromId] = useState<number | null>(null);
  const [monthly, setMonthly] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const submitting = createWallet.isPending || createAuto.isPending;

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your goal a name.');
      return;
    }
    if (target.trim()) {
      const t = Number(target);
      if (!Number.isFinite(t) || t <= 0) {
        setError('Enter a target amount greater than zero.');
        return;
      }
    }
    let monthlyAmt = 0;
    if (autoFund) {
      if (!fromId) {
        setError('Choose a wallet to auto-save from.');
        return;
      }
      monthlyAmt = Number(monthly);
      if (!Number.isFinite(monthlyAmt) || monthlyAmt <= 0) {
        setError('Enter a monthly amount greater than zero.');
        return;
      }
    }

    createWallet.mutate(
      {
        type: goalType,
        name: name.trim(),
        target_amount: target.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          const newId = data.wallet.id;
          if (autoFund && fromId) {
            createAuto.mutate(
              {
                name: name.trim() + ' auto-save',
                from_wallet_id: fromId,
                to_wallet_id: newId,
                amount: monthlyAmt,
                frequency: 'monthly',
                day_of_month: dayOfMonth,
              },
              {
                onSuccess: () => {
                  notifySuccess();
                  navigation.goBack();
                },
                onError: (e) => setError(e.message),
              },
            );
          } else {
            notifySuccess();
            navigation.goBack();
          }
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const renderWalletRow = (w: Wallet, active: boolean, onPress: () => void) => (
    <Pressable
      key={w.id}
      onPress={() => {
        selection();
        onPress();
      }}
      className={`flex-row items-center rounded-2xl border p-4 active:opacity-90 ${
        active ? 'border-brand bg-success-soft' : 'border-border bg-white'
      }`}
    >
      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-bold text-ink">{w.name}</Text>
        <Text className="mt-0.5 text-[13px] text-muted">{formatMoney(w.balance)}</Text>
      </View>
      <Ionicons
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={active ? colors.brand : colors.faded}
      />
    </Pressable>
  );

  return (
    <Screen withBottomInset>
      <Header title="New goal" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[15px] leading-5 text-muted">
          Name your goal, set a target, and optionally auto-save into it every month.
        </Text>

        <Input
          label="Goal name"
          icon="flag-outline"
          value={name}
          onChangeText={setName}
          placeholder="e.g. School fees"
          maxLength={100}
          containerClassName="mt-6"
        />

        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Goal type</Text>
        <View className="mt-3 flex-row flex-wrap" style={{ gap: 10 }}>
          {GOAL_TYPES.map((t) => {
            const active = goalType === t.value;
            const v = walletVisual(t.value);
            return (
              <Pressable
                key={t.value}
                onPress={() => {
                  selection();
                  setGoalType(t.value);
                }}
                className={`flex-row items-center rounded-full px-4 py-3 active:opacity-80 ${
                  active ? 'bg-navy' : 'bg-lav'
                }`}
              >
                <Ionicons
                  name={v.icon}
                  size={16}
                  color={active ? colors.white : colors.navy}
                  style={{ marginRight: 7 }}
                />
                <Text className={`text-[14px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Target amount (₦)"
          icon="cash-outline"
          value={target}
          onChangeText={(t) => setTarget(t.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          containerClassName="mt-7"
        />

        <View className="mt-6 flex-row items-center rounded-2xl bg-lav-faint p-4">
          <Ionicons name="repeat-outline" size={20} color={colors.navy} style={{ marginRight: 10 }} />
          <View className="flex-1 pr-2">
            <Text className="text-[15px] font-semibold text-ink">Auto-save every month</Text>
            <Text className="mt-0.5 text-[13px] leading-5 text-muted">
              Move money into this goal automatically on a day you choose.
            </Text>
          </View>
          <Switch
            value={autoFund}
            onValueChange={(v) => {
              selection();
              setAutoFund(v);
            }}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor={colors.white}
          />
        </View>

        {autoFund ? (
          <>
            <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Move from</Text>
            {owned.length > 0 ? (
              <View className="mt-3" style={{ gap: 10 }}>
                {owned.map((w) => renderWalletRow(w, fromId === w.id, () => setFromId(w.id)))}
              </View>
            ) : (
              <View className="mt-3 flex-row items-start rounded-2xl bg-lav-faint px-4 py-3">
                <Ionicons
                  name="wallet-outline"
                  size={15}
                  color={colors.muted}
                  style={{ marginRight: 8, marginTop: 1 }}
                />
                <Text className="flex-1 text-xs text-muted">
                  You don't own any wallets to auto-save from yet.
                </Text>
              </View>
            )}

            <Input
              label="Monthly amount (₦)"
              icon="cash-outline"
              value={monthly}
              onChangeText={(t) => setMonthly(t.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              containerClassName="mt-7"
            />

            <Text className="mt-6 text-[11px] font-bold uppercase tracking-wider text-muted">Day of month</Text>
            <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-lav-faint p-3">
              <Pressable
                onPress={() => {
                  selection();
                  setDayOfMonth((n) => Math.max(1, n - 1));
                }}
                disabled={dayOfMonth <= 1}
                className={`h-11 w-11 items-center justify-center rounded-2xl bg-white ${
                  dayOfMonth <= 1 ? 'opacity-40' : 'active:opacity-70'
                }`}
              >
                <Ionicons name="remove" size={22} color={colors.navy} />
              </Pressable>
              <View className="items-center">
                <Text className="text-2xl font-extrabold text-ink">{dayOfMonth}</Text>
                <Text className="text-[11px] text-muted">of each month</Text>
              </View>
              <Pressable
                onPress={() => {
                  selection();
                  setDayOfMonth((n) => Math.min(28, n + 1));
                }}
                disabled={dayOfMonth >= 28}
                className={`h-11 w-11 items-center justify-center rounded-2xl bg-white ${
                  dayOfMonth >= 28 ? 'opacity-40' : 'active:opacity-70'
                }`}
              >
                <Ionicons name="add" size={22} color={colors.navy} />
              </Pressable>
            </View>
          </>
        ) : null}

        <ErrorText message={error} className="mt-5" />

        <Button
          title="Create goal"
          icon="checkmark"
          onPress={submit}
          loading={submitting}
          className="mt-6"
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
