import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { ErrorText } from '../../components/ErrorText';
import { PinSheet } from '../../components/PinSheet';
import { BankPicker } from '../../components/BankPicker';
import { PendingApprovalNotice } from '../../components/PendingApprovalNotice';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useSpendRequest, useVerifyAccount, useWallets } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { ApprovalRequest, Bank, TransferDestination, Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type DestKind = 'wallet' | 'user' | 'bank';

/** Flat fee charged on outbound bank transfers (₦). Wallet/user destinations are free. */
const BANK_TRANSFER_FEE = 20;

export function RequestSpendScreen({ navigation, route }: RootScreenProps<'RequestSpend'>) {
  const walletId = route.params.walletId;
  const { data: wallets, isLoading: walletsLoading, error: walletsError, refetch } = useWallets();

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
  const [pending, setPending] = useState<ApprovalRequest | null>(null);

  const verify = useVerifyAccount();
  const spendRequest = useSpendRequest(walletId);

  // The wallet being spent from is fixed by the route — no from-picker.
  const from: Wallet | undefined = useMemo(
    () => (wallets ?? []).find((w) => w.id === walletId),
    [wallets, walletId],
  );

  const destWallets = useMemo(
    () => (wallets ?? []).filter((w) => w.id !== walletId),
    [wallets, walletId],
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
  const balanceNum = from ? parseFloat(from.balance) : 0;
  // Bank destinations carry the same flat fee the transfer would, so the balance
  // guard must count it — an amount+fee that overshoots the balance can't be approved.
  const fee = kind === 'bank' ? BANK_TRANSFER_FEE : 0;
  const exceedsBalance = amountOk && from != null && amountNum + fee > balanceNum;

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

  const canContinue = Boolean(from && destination && amountOk && !exceedsBalance);

  const recipientLabel = useMemo(() => {
    if (kind === 'wallet') return destWallets.find((w) => w.id === destWalletId)?.name;
    if (kind === 'user') return identifier.trim() || undefined;
    return verified?.account_name;
  }, [kind, destWallets, destWalletId, identifier, verified]);

  const authorize = (pin: string) => {
    if (!from || !destination) return;
    setPinError(null);
    spendRequest.mutate(
      {
        amount,
        pin,
        description: description.trim() || undefined,
        destination,
      },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          // A spend request always queues for owner approval — never a direct spend.
          setPending(data.approval);
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

  return (
    <Screen withBottomInset>
      <Header title="Request a spend" />

      {walletsLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : walletsError ? (
        <LoadError message={(walletsError as Error).message} onRetry={() => refetch()} />
      ) : (
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
            <Text className="text-sm leading-5 text-muted">
              Ask the wallet owner to approve this spend. Money only moves once it's approved.
            </Text>

            {/* Fixed source wallet (read-only) */}
            {from ? (
              <View
                className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-4"
                style={shadow.card}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-lav-soft">
                  <Ionicons name="wallet-outline" size={20} color={colors.navy} />
                </View>
                <View className="ml-3 flex-1 pr-2">
                  <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Requesting from
                  </Text>
                  <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                    {from.name}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-ink">{formatMoney(from.balance)}</Text>
              </View>
            ) : null}

            {/* Amount hero */}
            <View className="mt-5 overflow-hidden rounded-3xl" style={shadow.hero}>
              <LinearGradient
                colors={gradients.navy}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ paddingVertical: 34, paddingHorizontal: 24, alignItems: 'center' }}
              >
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-brand-glow">
                  You're requesting
                </Text>
                <View className="mt-3 flex-row items-end justify-center">
                  <Text className="mb-1.5 mr-1 text-3xl font-extrabold text-brand-glow">₦</Text>
                  <TextInput
                    value={amount}
                    onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    placeholderTextColor="rgba(188,215,255,0.45)"
                    keyboardType="decimal-pad"
                    className="min-w-[140px] text-center text-5xl font-extrabold tracking-tight"
                    style={{ color: colors.white, fontWeight: '800' }}
                  />
                </View>
                {from ? (
                  <View
                    className="mt-4 rounded-full px-4 py-2"
                    style={{
                      backgroundColor: exceedsBalance ? 'rgba(239,91,110,0.16)' : 'rgba(255,255,255,0.10)',
                    }}
                  >
                    <Text
                      className={`text-center text-xs ${
                        exceedsBalance ? 'font-semibold text-rose' : 'text-brand-glow'
                      }`}
                    >
                      {exceedsBalance
                        ? fee > 0
                          ? `Amount + ${formatMoney(fee)} fee exceeds the ${from.name} balance (${formatMoney(from.balance)})`
                          : `Amount exceeds the ${from.name} balance (${formatMoney(from.balance)})`
                        : fee > 0
                          ? `Available in ${from.name}: ${formatMoney(from.balance)} · incl. ${formatMoney(fee)} transfer fee`
                          : `Available in ${from.name}: ${formatMoney(from.balance)}`}
                    </Text>
                  </View>
                ) : null}
              </LinearGradient>
            </View>

            {/* Destination kind */}
            <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">To</Text>
            <View className="mt-2 flex-row" style={{ gap: 8 }}>
              <Chip label="My Wallets" active={kind === 'wallet'} onPress={() => setKind('wallet')} />
              <Chip label="To User" active={kind === 'user'} onPress={() => setKind('user')} />
              <Chip label="To Bank" active={kind === 'bank'} onPress={() => setKind('bank')} />
            </View>

            {kind === 'wallet' ? (
              <View className="mt-4" style={{ gap: 10 }}>
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
                        onPress={() => {
                          selection();
                          setDestWalletId(w.id);
                        }}
                        className={`flex-row items-center justify-between rounded-2xl border p-4 active:opacity-80 ${
                          active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                        }`}
                      >
                        <View className="flex-1 pr-2">
                          <Text className="text-[15px] font-semibold text-ink">{w.name}</Text>
                          <Text className="mt-0.5 text-xs text-muted">{formatMoney(w.balance)}</Text>
                        </View>
                        <Ionicons
                          name={active ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={active ? colors.brand : colors.faded}
                        />
                      </Pressable>
                    );
                  })
                )}
              </View>
            ) : null}

            {kind === 'user' ? (
              <Input
                label="Recipient email or phone"
                icon="at-outline"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="them@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                containerClassName="mt-4"
              />
            ) : null}

            {kind === 'bank' ? (
              <View className="mt-4">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bank</Text>
                <Pressable
                  onPress={() => setBankPickerOpen(true)}
                  className="mt-2 flex-row items-center rounded-2xl border border-transparent bg-lav-faint px-4 active:opacity-80"
                  style={{ minHeight: 54 }}
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
              </View>
            ) : null}

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
      )}

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
        title="Authorize request"
        subtitle="Confirm to submit this request"
        amount={amount ? formatMoney(amount) : undefined}
        recipient={recipientLabel}
        loading={spendRequest.isPending}
        error={pinError}
        onSubmit={authorize}
        onClose={() => setPinOpen(false)}
      />
    </Screen>
  );
}
