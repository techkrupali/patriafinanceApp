import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { PinSheet } from '../../components/PinSheet';
import { BankPicker } from '../../components/BankPicker';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { PendingApprovalNotice } from '../../components/PendingApprovalNotice';
import { colors } from '../../theme';
import { useVerifyAccount, useWithdraw } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { isPendingApproval } from '../../api/types';
import type { ApprovalRequest, Bank, Transaction } from '../../api/types';
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
  const [pending, setPending] = useState<ApprovalRequest | null>(null);

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
          if (isPendingApproval(data)) {
            setPending(data.approval);
          } else {
            setReceipt(data.transaction);
          }
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  if (pending) {
    return (
      <Screen withBottomInset>
        <PendingApprovalNotice
          approval={pending}
          onViewApprovals={() => navigation.navigate('Approvals', { scope: 'mine' })}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    );
  }

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
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
          {/* Amount hero */}
          <View className="items-center rounded-3xl bg-lav-faint py-8">
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Amount</Text>
            <View className="mt-2 flex-row items-center justify-center">
              <Text className="text-4xl font-extrabold text-faded">₦</Text>
              <TextInput
                value={amount}
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={colors.faded}
                keyboardType="decimal-pad"
                className="ml-1 min-w-[120px] text-center text-5xl font-extrabold text-ink"
              />
            </View>
          </View>

          {/* Destination */}
          <Text className="mt-7 text-[11px] font-semibold uppercase tracking-wider text-muted">Withdraw to</Text>
          <Pressable
            onPress={() => setBankPickerOpen(true)}
            className="mt-2 flex-row items-center rounded-2xl bg-lav-faint px-4"
            style={{ minHeight: 52 }}
          >
            <Ionicons name="business-outline" size={19} color={colors.faded} style={{ marginRight: 10 }} />
            <Text className={`flex-1 text-[15px] ${bank ? 'text-ink' : 'text-faded'}`}>
              {bank?.bank_name ?? 'Select a bank'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>

          <Input
            label="Account number"
            icon="card-outline"
            value={accountNumber}
            onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, '').slice(0, 10))}
            placeholder="0123456789"
            keyboardType="number-pad"
            maxLength={10}
            containerClassName="mt-4"
          />

          {/* Verification state */}
          {verify.isPending ? (
            <View className="mt-3 flex-row items-center">
              <ActivityIndicator size="small" color={colors.brand} />
              <Text className="ml-2 text-sm text-muted">Verifying account…</Text>
            </View>
          ) : verified ? (
            <View className="mt-3 flex-row items-center self-start rounded-full bg-success-soft px-3.5 py-2">
              <Ionicons name="checkmark-circle" size={16} color={colors.brand} style={{ marginRight: 6 }} />
              <Text className="text-[13px] font-bold text-brand">{verified.account_name}</Text>
            </View>
          ) : (
            <ErrorText message={verifyError} className="mt-3" />
          )}

          <Input
            label="Description (optional)"
            icon="create-outline"
            value={description}
            onChangeText={setDescription}
            placeholder="What's this for?"
            maxLength={200}
            containerClassName="mt-5"
          />

          <Button
            title="Continue"
            icon="arrow-forward"
            onPress={() => {
              setPinError(null);
              setPinOpen(true);
            }}
            disabled={!canContinue}
            className="mt-7"
          />
      </KeyboardAwareScrollView>

      <BankPicker
        visible={bankPickerOpen}
        selectedCode={bank?.bank_code}
        onSelect={(b) => {
          setBank(b);
          setBankPickerOpen(false);
        }}
        onClose={() => setBankPickerOpen(false)}
      />

      <PinSheet
        visible={pinOpen}
        title="Authorize withdrawal"
        subtitle="Confirm to send this withdrawal"
        amount={amount ? formatMoney(amount) : undefined}
        recipient={verified?.account_name}
        loading={withdraw.isPending}
        error={pinError}
        onSubmit={authorize}
        onClose={() => setPinOpen(false)}
      />
    </Screen>
  );
}
