import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { PinSheet } from '../../components/PinSheet';
import { BankPicker } from '../../components/BankPicker';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { useVerifyAccount, useWithdraw } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import type { Bank, Transaction } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

export function WithdrawScreen({ navigation, route }: RootScreenProps<'Withdraw'>) {
  const { walletId } = route.params;

  const [bank, setBank] = useState<Bank | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [verified, setVerified] = useState<{ account_name: string; bank_name: string } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Transaction | null>(null);

  const verify = useVerifyAccount();
  const withdraw = useWithdraw(walletId);

  // Auto-verify once we have a bank + 10 digits.
  useEffect(() => {
    setVerified(null);
    setVerifyError(null);
    if (!bank || accountNumber.length !== 10) return;
    verify.mutate(
      { account_number: accountNumber, bank_code: bank.bank_code },
      {
        onSuccess: (data) => setVerified(data),
        onError: (e) => setVerifyError(e.message),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank?.bank_code, accountNumber]);

  const amountNum = parseFloat(amount);
  const canContinue = Boolean(verified && bank && Number.isFinite(amountNum) && amountNum > 0);

  const authorize = (pin: string) => {
    if (!bank || !verified) return;
    setPinError(null);
    withdraw.mutate(
      {
        amount,
        bank_code: bank.bank_code,
        account_number: accountNumber,
        account_name: verified.account_name,
        bank_name: verified.bank_name || bank.bank_name,
        pin,
        description: description.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          setReceipt(data.transaction);
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  if (receipt) {
    return (
      <Screen withBottomInset>
        <SuccessReceipt
          title="Withdrawal Successful"
          subtitle={`${formatMoney(receipt.amount)} sent to ${verified?.account_name ?? 'your bank account'}`}
          rows={[
            { label: 'Reference', value: receipt.reference },
            { label: 'Amount', value: formatMoney(receipt.amount) },
            { label: 'Fee', value: formatMoney(receipt.fee) },
            {
              label: 'New balance',
              value: receipt.balance_after !== null ? formatMoney(receipt.balance_after) : '—',
            },
          ]}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Withdraw" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {/* Bank picker field */}
          <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">Bank</Text>
          <Pressable
            onPress={() => setBankPickerOpen(true)}
            className="mt-2 flex-row items-center justify-between rounded-2xl bg-lav px-4 py-3.5 active:opacity-80"
          >
            <Text className={`text-base ${bank ? 'text-ink' : 'text-faded'}`}>
              {bank?.bank_name ?? 'Select a bank'}
            </Text>
            <Text className="text-base text-muted">▾</Text>
          </Pressable>

          <Input
            label="Account number"
            value={accountNumber}
            onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, '').slice(0, 10))}
            placeholder="0123456789"
            keyboardType="number-pad"
            maxLength={10}
            className="mt-5"
          />

          {/* Verification state */}
          {verify.isPending ? (
            <View className="mt-3 flex-row items-center">
              <ActivityIndicator size="small" color="#006c49" />
              <Text className="ml-2 text-sm text-muted">Verifying account…</Text>
            </View>
          ) : verified ? (
            <View className="mt-3 flex-row items-center self-start rounded-full bg-success px-3.5 py-2">
              <Text className="text-[13px] font-bold text-brand">✓ {verified.account_name}</Text>
            </View>
          ) : (
            <ErrorText message={verifyError} className="mt-3" />
          )}

          {/* Amount */}
          <Card className="mt-6 items-center p-6">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">
              Amount
            </Text>
            <View className="mt-2 flex-row items-center justify-center">
              <Text className="text-3xl font-bold text-faded">₦</Text>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                className="ml-1 min-w-[120px] text-center text-4xl font-bold text-ink"
              />
            </View>
          </Card>

          <Input
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="What's this for?"
            maxLength={200}
            className="mt-5"
          />

          <Button
            title="Continue"
            onPress={() => {
              setPinError(null);
              setPinOpen(true);
            }}
            disabled={!canContinue}
            className="mt-7"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <BankPicker
        visible={bankPickerOpen}
        onSelect={(b) => {
          setBank(b);
          setBankPickerOpen(false);
        }}
        onClose={() => setBankPickerOpen(false)}
      />

      <PinSheet
        visible={pinOpen}
        title="Authorize withdrawal"
        subtitle={`Enter your PIN to send ${amount ? formatMoney(amount) : ''} to ${
          verified?.account_name ?? ''
        }`}
        loading={withdraw.isPending}
        error={pinError}
        onSubmit={authorize}
        onClose={() => setPinOpen(false)}
      />
    </Screen>
  );
}
