import React, { useEffect, useMemo, useState } from 'react';
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
import { Chip } from '../../components/Chip';
import { ErrorText } from '../../components/ErrorText';
import { PinSheet } from '../../components/PinSheet';
import { BankPicker } from '../../components/BankPicker';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { LoadError } from '../../components/LoadError';
import { useTransfer, useVerifyAccount, useWallets } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import type { Bank, TransferData, TransferDestination, Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type DestKind = 'wallet' | 'user' | 'bank';

export function TransferScreen({ navigation, route }: RootScreenProps<'Transfer'>) {
  const initialWalletId = route.params?.walletId;
  const { data: wallets, isLoading: walletsLoading, error: walletsError, refetch } = useWallets();

  const [fromId, setFromId] = useState<number | undefined>(initialWalletId);
  const [kind, setKind] = useState<DestKind>('wallet');
  const [destWalletId, setDestWalletId] = useState<number | undefined>();
  const [identifier, setIdentifier] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [verified, setVerified] = useState<{ account_name: string; bank_name: string } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<TransferData | null>(null);
  const [receiptAmount, setReceiptAmount] = useState('');

  const verify = useVerifyAccount();
  const transfer = useTransfer();

  const from: Wallet | undefined = useMemo(
    () => (wallets ?? []).find((w) => w.id === fromId) ?? (wallets ?? [])[0],
    [wallets, fromId],
  );

  const destWallets = useMemo(
    () => (wallets ?? []).filter((w) => w.id !== from?.id),
    [wallets, from],
  );

  // Auto-verify bank account.
  useEffect(() => {
    setVerified(null);
    setVerifyError(null);
    if (kind !== 'bank' || !bank || accountNumber.length !== 10) return;
    verify.mutate(
      { account_number: accountNumber, bank_code: bank.bank_code },
      {
        onSuccess: (data) => setVerified(data),
        onError: (e) => setVerifyError(e.message),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, bank?.bank_code, accountNumber]);

  const amountNum = parseFloat(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;

  const destination: TransferDestination | null = useMemo(() => {
    if (kind === 'wallet') {
      return destWalletId ? { kind: 'wallet', wallet_id: destWalletId } : null;
    }
    if (kind === 'user') {
      return identifier.trim() ? { kind: 'user', identifier: identifier.trim() } : null;
    }
    if (bank && accountNumber.length === 10 && verified) {
      return {
        kind: 'bank',
        bank_code: bank.bank_code,
        account_number: accountNumber,
        account_name: verified.account_name,
        bank_name: verified.bank_name || bank.bank_name,
      };
    }
    return null;
  }, [kind, destWalletId, identifier, bank, accountNumber, verified]);

  const canContinue = Boolean(from && destination && amountOk);

  const authorize = (pin: string) => {
    if (!from || !destination) return;
    setPinError(null);
    transfer.mutate(
      {
        from_wallet_id: from.id,
        amount,
        pin,
        description: description.trim() || undefined,
        destination,
      },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          setReceiptAmount(amount);
          setReceipt(data);
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  if (receipt) {
    const recipientName =
      receipt.recipient?.name ??
      (kind === 'bank'
        ? verified?.account_name
        : kind === 'wallet'
          ? destWallets.find((w) => w.id === destWalletId)?.name
          : identifier);
    const rows = [
      { label: 'Reference', value: receipt.reference },
      { label: 'Amount', value: formatMoney(receiptAmount) },
      ...(recipientName ? [{ label: 'Recipient', value: recipientName }] : []),
      { label: 'New balance', value: formatMoney(receipt.balance) },
    ];
    return (
      <Screen withBottomInset>
        <SuccessReceipt
          title="Transfer Successful"
          subtitle={`${formatMoney(receiptAmount)} sent from ${from?.name ?? 'your wallet'}`}
          rows={rows}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Transfer" />

      {walletsLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#001736" />
        </View>
      ) : walletsError ? (
        <LoadError message={(walletsError as Error).message} onRetry={() => refetch()} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
            {/* Source wallet */}
            <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">From</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 -mx-1">
              <View className="flex-row px-1" style={{ gap: 8 }}>
                {(wallets ?? []).map((w) => {
                  const active = w.id === from?.id;
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => {
                        setFromId(w.id);
                        setDestWalletId(undefined);
                      }}
                      className={`rounded-2xl px-4 py-3 ${active ? 'bg-navy' : 'bg-white'} active:opacity-80`}
                    >
                      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
                        {w.name}
                      </Text>
                      <Text className={`mt-0.5 text-xs ${active ? 'text-brand-glow' : 'text-muted'}`}>
                        {formatMoney(w.balance)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Destination kind */}
            <Text className="mt-6 text-[11px] font-bold uppercase tracking-widest text-muted">To</Text>
            <View className="mt-2 flex-row" style={{ gap: 8 }}>
              <Chip label="My Wallets" active={kind === 'wallet'} onPress={() => setKind('wallet')} />
              <Chip label="To User" active={kind === 'user'} onPress={() => setKind('user')} />
              <Chip label="To Bank" active={kind === 'bank'} onPress={() => setKind('bank')} />
            </View>

            {kind === 'wallet' ? (
              <View className="mt-4" style={{ gap: 8 }}>
                {destWallets.length === 0 ? (
                  <Text className="py-4 text-sm text-muted">
                    You have no other wallets. Create one from the Wallets tab.
                  </Text>
                ) : (
                  destWallets.map((w) => {
                    const active = destWalletId === w.id;
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => setDestWalletId(w.id)}
                        className={`flex-row items-center justify-between rounded-2xl p-4 ${
                          active ? 'border-2 border-navy bg-white' : 'border border-[#e2e8f0] bg-white'
                        } active:opacity-80`}
                      >
                        <View className="flex-1 pr-2">
                          <Text className="text-[15px] font-semibold text-ink">{w.name}</Text>
                          <Text className="mt-0.5 text-xs text-muted">{formatMoney(w.balance)}</Text>
                        </View>
                        <View
                          className={`h-5 w-5 items-center justify-center rounded-full ${
                            active ? 'bg-navy' : 'border border-[#e2e8f0]'
                          }`}
                        >
                          {active ? <Text className="text-[10px] font-bold text-white">✓</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}

            {kind === 'user' ? (
              <Input
                label="Recipient email or phone"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="them@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                className="mt-4"
              />
            ) : null}

            {kind === 'bank' ? (
              <View className="mt-4">
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
                  className="mt-4"
                />

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
              </View>
            ) : null}

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
              {from ? (
                <Text className="mt-2 text-xs text-faded">
                  Available: {formatMoney(from.balance)}
                </Text>
              ) : null}
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
      )}

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
        title="Authorize transfer"
        subtitle={`Enter your PIN to send ${amount ? formatMoney(amount) : ''}`}
        loading={transfer.isPending}
        error={pinError}
        onSubmit={authorize}
        onClose={() => setPinOpen(false)}
      />
    </Screen>
  );
}
