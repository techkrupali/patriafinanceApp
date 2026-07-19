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
import { EmptyState } from '../../components/EmptyState';
import { colors } from '../../theme';
import { useWallets, useCreateAutomation } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection, notifySuccess } from '../../lib/haptics';
import type { AutomationFrequency, CreateAutomationPayload, Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const FREQUENCIES: { value: AutomationFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export function CreateAutomationScreen({ navigation }: RootScreenProps<'CreateAutomation'>) {
  const wallets = useWallets();
  const create = useCreateAutomation();

  const owned = (wallets.data ?? []).filter((w) => w.my_role === 'owner');

  const [name, setName] = useState('');
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<AutomationFrequency>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [minBalance, setMinBalance] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (owned.length < 2) {
    return (
      <Screen withBottomInset>
        <Header title="New automation" />
        <View className="flex-1 justify-center">
          <EmptyState
            icon="wallet-outline"
            title="Need two wallets"
            message="Create another wallet first so money has somewhere to go."
          />
        </View>
      </Screen>
    );
  }

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give this automation a name.');
      return;
    }
    if (!fromId || !toId || fromId === toId) {
      setError('Choose a source and a different destination wallet.');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    const payload: CreateAutomationPayload = {
      name: name.trim(),
      from_wallet_id: fromId,
      to_wallet_id: toId,
      amount: amt,
      frequency,
      day_of_week: frequency === 'weekly' ? dayOfWeek : null,
      day_of_month: frequency === 'monthly' ? dayOfMonth : null,
      min_balance: minBalance.trim() ? Number(minBalance) : null,
      enabled,
    };
    create.mutate(payload, {
      onSuccess: () => {
        notifySuccess();
        navigation.goBack();
      },
      onError: (e) => setError(e.message),
    });
  };

  const renderWalletRow = (
    w: Wallet,
    active: boolean,
    onPress: () => void,
  ) => (
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
      <Header title="New automation" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[15px] leading-5 text-muted">
          Set up a scheduled transfer that moves money between your own wallets automatically.
        </Text>

        <Input
          label="Name"
          icon="text-outline"
          value={name}
          onChangeText={setName}
          placeholder="Kids monthly allowance"
          maxLength={100}
          containerClassName="mt-6"
        />

        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Move from</Text>
        <View className="mt-3" style={{ gap: 10 }}>
          {owned.map((w) =>
            renderWalletRow(w, fromId === w.id, () => {
              setFromId(w.id);
              if (toId === w.id) setToId(null);
            }),
          )}
        </View>

        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Move to</Text>
        <View className="mt-3" style={{ gap: 10 }}>
          {owned
            .filter((w) => w.id !== fromId)
            .map((w) => renderWalletRow(w, toId === w.id, () => setToId(w.id)))}
        </View>

        <Input
          label="Amount (₦)"
          icon="cash-outline"
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          containerClassName="mt-7"
        />

        <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Frequency</Text>
        <View className="mt-3 flex-row" style={{ gap: 10 }}>
          {FREQUENCIES.map((f) => {
            const active = frequency === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => {
                  selection();
                  setFrequency(f.value);
                }}
                className={`flex-1 items-center rounded-full py-3 active:opacity-80 ${
                  active ? 'bg-navy' : 'bg-lav'
                }`}
              >
                <Text className={`text-[14px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {frequency === 'weekly' ? (
          <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
            {WEEKDAYS.map((d) => {
              const active = dayOfWeek === d.value;
              return (
                <Pressable
                  key={d.value}
                  onPress={() => {
                    selection();
                    setDayOfWeek(d.value);
                  }}
                  className={`rounded-full px-4 py-2 active:opacity-80 ${active ? 'bg-navy' : 'bg-lav'}`}
                >
                  <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
                    {d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {frequency === 'monthly' ? (
          <>
            <Text className="mt-6 text-[11px] font-bold uppercase tracking-wider text-muted">
              Day of month
            </Text>
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

        <Input
          label="Keep a minimum balance (optional)"
          icon="shield-outline"
          value={minBalance}
          onChangeText={(t) => setMinBalance(t.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          containerClassName="mt-7"
        />
        <Text className="mt-2 text-[13px] leading-5 text-muted">
          The rule won't run if it would drop below this.
        </Text>

        <View className="mt-6 flex-row items-center rounded-2xl bg-lav-faint p-4">
          <Ionicons name="flash-outline" size={20} color={colors.navy} style={{ marginRight: 10 }} />
          <View className="flex-1 pr-2">
            <Text className="text-[15px] font-semibold text-ink">Start active</Text>
            <Text className="mt-0.5 text-[13px] leading-5 text-muted">
              Turn on now so the rule runs on schedule. You can pause it anytime.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => {
              selection();
              setEnabled(v);
            }}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor={colors.white}
          />
        </View>

        <ErrorText message={error} className="mt-5" />

        <Button
          title="Create automation"
          icon="checkmark"
          onPress={submit}
          loading={create.isPending}
          className="mt-6"
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
