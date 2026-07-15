import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { PinSheet } from '../../components/PinSheet';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useLoan, useRepayLoan, useWallets } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { loanCategoryLabel } from '../../lib/loans';
import type { LoanRepayResultData, Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

export function RepayScreen({ navigation, route }: RootScreenProps<'Repay'>) {
  const { loanId } = route.params;
  const loanQuery = useLoan(loanId);
  const walletsQuery = useWallets();
  const repay = useRepayLoan(loanId);

  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState<number | undefined>();
  const [seeded, setSeeded] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LoanRepayResultData | null>(null);

  const loan = loanQuery.data?.loan;
  const repayments = loanQuery.data?.repayments ?? [];
  const wallets = walletsQuery.data ?? [];

  const outstanding = parseFloat(loan?.outstanding ?? '0');
  const penalty = parseFloat(loan?.penalty_accrued ?? '0');
  const maxRepay = outstanding + (Number.isFinite(penalty) ? penalty : 0);

  // Seed the default amount (next unpaid installment, else full outstanding) once.
  useEffect(() => {
    if (seeded || !loan) return;
    const next = repayments.find((r) => r.status !== 'paid');
    const nextRemaining = next
      ? Math.max(parseFloat(next.amount_due) - parseFloat(next.amount_paid), 0)
      : 0;
    const seedNum = Math.min(nextRemaining > 0 ? nextRemaining : maxRepay, maxRepay);
    setAmount(seedNum > 0 ? seedNum.toFixed(2) : '');
    setSeeded(true);
  }, [loan, repayments, maxRepay, seeded]);

  // Default the source wallet to main once wallets load.
  useEffect(() => {
    if (walletId === undefined && wallets.length > 0) {
      const main = wallets.find((w) => w.type === 'main') ?? wallets[0];
      setWalletId(main.id);
    }
  }, [wallets, walletId]);

  const wallet: Wallet | undefined = wallets.find((w) => w.id === walletId);
  const walletBalance = parseFloat(wallet?.balance ?? '0');

  const amountNum = parseFloat(amount);
  const overMax = Number.isFinite(amountNum) && amountNum > maxRepay + 0.001;
  const insufficient = Boolean(wallet && Number.isFinite(amountNum) && amountNum > walletBalance);
  const canPay = Boolean(
    wallet && Number.isFinite(amountNum) && amountNum > 0 && !overMax && !insufficient,
  );

  const helper = useMemo(() => {
    if (overMax) return { text: `You only owe ${formatMoney(maxRepay)}`, danger: true };
    if (insufficient) return { text: `Not enough in ${wallet?.name ?? 'this wallet'}`, danger: true };
    return { text: `Owed: ${formatMoney(maxRepay)}`, danger: false };
  }, [overMax, insufficient, maxRepay, wallet]);

  const authorize = (pin: string) => {
    if (!wallet) return;
    setPinError(null);
    repay.mutate(
      { amount, wallet_id: wallet.id, pin },
      {
        onSuccess: (data) => {
          setPinOpen(false);
          setReceipt(data);
        },
        onError: (e) => setPinError(e.message),
      },
    );
  };

  if (receipt) {
    return (
      <Screen withBottomInset>
        <SuccessReceipt
          title="Repayment successful"
          subtitle={`${formatMoney(receipt.transaction.amount)} paid toward your ${loan ? loanCategoryLabel(loan.category) : ''} loan`}
          rows={[
            { label: 'Reference', value: receipt.transaction.reference },
            { label: 'Amount paid', value: formatMoney(receipt.transaction.amount) },
            { label: 'From wallet', value: wallet?.name ?? '—' },
            { label: 'New outstanding', value: formatMoney(receipt.loan.outstanding) },
            { label: 'Status', value: receipt.loan.status },
          ]}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Repay loan" />

      {loanQuery.isLoading || walletsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : loanQuery.error ? (
        <LoadError message={(loanQuery.error as Error).message} onRetry={() => loanQuery.refetch()} />
      ) : loan ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingTop: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Amount hero */}
            <View className="items-center rounded-3xl bg-lav-faint py-8">
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">Repay amount</Text>
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
              <Text className={`mt-2 text-xs ${helper.danger ? 'font-semibold text-danger' : 'text-faded'}`}>
                {helper.text}
              </Text>
            </View>

            {/* Quick fill */}
            <View className="mt-4 flex-row" style={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  selection();
                  setAmount(maxRepay > 0 ? maxRepay.toFixed(2) : '');
                }}
                className="flex-1 items-center rounded-2xl bg-lav py-3 active:opacity-80"
              >
                <Text className="text-[13px] font-bold text-navy">Pay full · {formatMoney(maxRepay)}</Text>
              </Pressable>
            </View>

            {/* Source wallet */}
            <Text className="mt-7 text-[11px] font-semibold uppercase tracking-wider text-muted">Pay from</Text>
            <View className="mt-2" style={{ gap: 10 }}>
              {wallets.map((w) => {
                const active = w.id === walletId;
                return (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      selection();
                      setWalletId(w.id);
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
              })}
            </View>

            <Button
              title="Continue"
              icon="arrow-forward"
              onPress={() => {
                setPinError(null);
                setPinOpen(true);
              }}
              disabled={!canPay}
              className="mt-7"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      <PinSheet
        visible={pinOpen}
        title="Authorize repayment"
        subtitle="Confirm to repay your loan"
        amount={amount ? formatMoney(amount) : undefined}
        recipient={loan ? `${loanCategoryLabel(loan.category)} loan` : undefined}
        loading={repay.isPending}
        error={pinError}
        onSubmit={authorize}
        onClose={() => setPinOpen(false)}
      />
    </Screen>
  );
}
