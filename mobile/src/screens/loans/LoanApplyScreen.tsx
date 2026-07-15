import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Card } from '../../components/Card';
import { ErrorText } from '../../components/ErrorText';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useApplyLoan, useLoanEligibility, useWallets } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import {
  FREQUENCY_OPTIONS,
  LOAN_CATEGORIES,
  LOAN_INTEREST_RATE,
  frequencyLabel,
  installmentCount,
  loanCategoryLabel,
} from '../../lib/loans';
import type { LoanCategory, LoanDetailData, RepaymentFrequency, Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const TENOR_PRESETS = [30, 90, 180, 365];

export function LoanApplyScreen({ navigation }: RootScreenProps<'LoanApply'>) {
  const insets = useSafeAreaInsets();
  const eligibility = useLoanEligibility();
  const walletsQuery = useWallets();
  const apply = useApplyLoan();

  const [category, setCategory] = useState<LoanCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [tenor, setTenor] = useState('30');
  const [frequency, setFrequency] = useState<RepaymentFrequency>('monthly');
  const [purpose, setPurpose] = useState('');
  const [walletId, setWalletId] = useState<number | undefined>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoanDetailData | null>(null);

  const wallets = walletsQuery.data ?? [];

  // Default the disburse wallet to the user's main wallet once loaded.
  useEffect(() => {
    if (walletId === undefined && wallets.length > 0) {
      const main = wallets.find((w) => w.type === 'main') ?? wallets[0];
      setWalletId(main.id);
    }
  }, [wallets, walletId]);

  const elig = eligibility.data;
  const maxKobo = elig?.max_amount_kobo ?? 0;

  // Only surface categories the backend says this user is eligible for.
  const categories = useMemo(() => {
    const allowed = elig?.categories;
    if (!allowed || allowed.length === 0) return LOAN_CATEGORIES;
    return LOAN_CATEGORIES.filter((c) => allowed.includes(c.value));
  }, [elig]);

  const amountNum = parseFloat(amount);
  const amountKobo = Number.isFinite(amountNum) ? Math.round(amountNum * 100) : 0;
  const overMax = maxKobo > 0 && amountKobo > maxKobo;
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && !overMax;

  const tenorNum = parseInt(tenor, 10);
  const tenorOk = Number.isFinite(tenorNum) && tenorNum >= 7 && tenorNum <= 365;

  const wallet: Wallet | undefined = wallets.find((w) => w.id === walletId);
  const canReview = Boolean(category && amountOk && tenorOk && wallet);

  // Client-side estimate (backend returns the authoritative figures).
  const estInterest = amountOk ? amountNum * LOAN_INTEREST_RATE : 0;
  const estTotal = amountNum + estInterest;
  const count = installmentCount(tenorNum, frequency);
  const perInstallment = estTotal / count;

  const submit = () => {
    if (!category || !wallet) return;
    setError(null);
    apply.mutate(
      {
        category,
        amount,
        tenor_days: tenorNum,
        repayment_frequency: frequency,
        purpose: purpose.trim() || undefined,
        disburse_wallet_id: wallet.id,
      },
      {
        onSuccess: (data) => {
          setReviewOpen(false);
          setResult(data);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  // ---- Success states ----
  if (result) {
    const loan = result.loan;
    const disbursed = loan.status === 'active' || loan.status === 'disbursed';
    if (disbursed) {
      return (
        <Screen withBottomInset>
          <SuccessReceipt
            title="Loan disbursed"
            subtitle={`${formatMoney(loan.principal)} was added to ${wallet?.name ?? 'your wallet'}`}
            rows={[
              { label: 'Reference', value: loan.reference },
              { label: 'Category', value: loanCategoryLabel(loan.category) },
              { label: 'Principal', value: formatMoney(loan.principal) },
              { label: 'Total repayable', value: formatMoney(loan.total_repayable) },
              { label: 'Outstanding', value: formatMoney(loan.outstanding) },
            ]}
            onDone={() => navigation.replace('LoanDetail', { loanId: loan.id })}
          />
        </Screen>
      );
    }
    // Pending review — distinct from the disbursed check state.
    return (
      <Screen withBottomInset>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}
        >
          <View className="items-center">
            <View className="h-28 w-28 items-center justify-center rounded-full bg-lav-soft">
              <LinearGradient
                colors={gradients.navy}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 84, width: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="hourglass-outline" size={42} color={colors.brandGlow} />
              </LinearGradient>
            </View>
            <Text className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Submitted for review</Text>
            <Text className="mt-2 text-center text-sm text-muted">
              Your {loanCategoryLabel(loan.category)} loan of {formatMoney(loan.principal)} is being reviewed.
              We'll let you know once it's approved.
            </Text>
          </View>

          <Card className="mt-8">
            <SummaryRow label="Reference" value={loan.reference} />
            <SummaryRow label="Principal" value={formatMoney(loan.principal)} border />
            <SummaryRow label="Total repayable" value={formatMoney(loan.total_repayable)} border />
            <SummaryRow label="Tenor" value={`${loan.tenor_days} days`} border />
          </Card>

          <Button
            title="View loan"
            icon="arrow-forward"
            onPress={() => navigation.replace('LoanDetail', { loanId: loan.id })}
            className="mt-8"
          />
          <Button title="Done" variant="ghost" onPress={() => navigation.goBack()} className="mt-2" />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Apply for a loan" />

      {eligibility.isLoading || walletsQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : eligibility.error ? (
        <LoadError message={(eligibility.error as Error).message} onRetry={() => eligibility.refetch()} />
      ) : elig ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingTop: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Eligibility hero */}
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 28, padding: 22 }, shadow.hero]}
            >
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                You're eligible for up to
              </Text>
              <Text className="mt-2 text-[34px] font-extrabold leading-tight tracking-tight text-white">
                {formatMoney(elig.max_amount)}
              </Text>
              <View className="mt-3 flex-row items-center self-start rounded-full bg-white/15 px-3 py-1.5">
                <Ionicons name="ribbon-outline" size={13} color={colors.brandGlow} style={{ marginRight: 5 }} />
                <Text className="text-[11px] font-bold uppercase tracking-wider text-brand-glow">
                  Tier {elig.tier}
                </Text>
              </View>
            </LinearGradient>

            {/* Category */}
            <Text className="mt-7 text-[11px] font-semibold uppercase tracking-wider text-muted">
              What's it for?
            </Text>
            <View className="mt-3 flex-row flex-wrap justify-between">
              {categories.map((c) => {
                const active = category === c.value;
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => {
                      selection();
                      setCategory(c.value);
                    }}
                    style={{ width: '31.5%', marginBottom: 12 }}
                    className={`items-center rounded-3xl border px-2 py-4 active:opacity-90 ${
                      active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                    }`}
                  >
                    <View
                      className="h-11 w-11 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: active ? colors.brand : colors.lavSoft }}
                    >
                      <Ionicons name={c.icon} size={21} color={active ? colors.white : colors.navy} />
                    </View>
                    <Text
                      className={`mt-2 text-[12px] font-bold ${active ? 'text-brand' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Amount */}
            <Text className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
              How much?
            </Text>
            <View className="mt-2 items-center rounded-3xl bg-lav-faint py-7">
              <View className="flex-row items-center justify-center">
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
              <Text className={`mt-2 text-xs ${overMax ? 'font-semibold text-danger' : 'text-faded'}`}>
                {overMax ? `Exceeds your ${formatMoney(elig.max_amount)} limit` : `Max ${formatMoney(elig.max_amount)}`}
              </Text>
            </View>

            {/* Tenor */}
            <Text className="mt-7 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Repay over
            </Text>
            <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
              {TENOR_PRESETS.map((d) => (
                <Chip
                  key={d}
                  label={`${d} days`}
                  active={tenorNum === d}
                  onPress={() => setTenor(String(d))}
                />
              ))}
            </View>
            <Input
              label="Custom tenor (7–365 days)"
              icon="calendar-outline"
              value={tenor}
              onChangeText={(t) => setTenor(t.replace(/[^0-9]/g, '').slice(0, 3))}
              placeholder="30"
              keyboardType="number-pad"
              maxLength={3}
              containerClassName="mt-3"
              error={tenor.length > 0 && !tenorOk ? 'Enter between 7 and 365 days' : undefined}
            />

            {/* Frequency */}
            <Text className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Repayment frequency
            </Text>
            <View className="mt-2 flex-row" style={{ gap: 8 }}>
              {FREQUENCY_OPTIONS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  active={frequency === f.value}
                  onPress={() => setFrequency(f.value)}
                />
              ))}
            </View>

            {/* Disburse wallet */}
            <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Disburse to
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2 -mx-1">
              <View className="flex-row px-1" style={{ gap: 8 }}>
                {wallets.map((w) => {
                  const active = w.id === walletId;
                  return (
                    <Pressable
                      key={w.id}
                      onPress={() => {
                        selection();
                        setWalletId(w.id);
                      }}
                      className={`rounded-2xl px-4 py-3 active:opacity-80 ${
                        active ? 'bg-navy' : 'border border-border bg-white'
                      }`}
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

            {/* Purpose */}
            <Input
              label="Purpose (optional)"
              icon="create-outline"
              value={purpose}
              onChangeText={setPurpose}
              placeholder="A short note about this loan"
              maxLength={200}
              containerClassName="mt-6"
            />

            <Button
              title="Review application"
              icon="arrow-forward"
              onPress={() => {
                setError(null);
                setReviewOpen(true);
              }}
              disabled={!canReview}
              className="mt-7"
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {/* Review sheet */}
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-[32px] bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />
            <View className="mb-4 flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-extrabold text-ink">Review your loan</Text>
                <Text className="mt-1 text-sm text-muted">
                  {category ? loanCategoryLabel(category) : ''} · {frequencyLabel(frequency)} · {tenorNum} days
                </Text>
              </View>
              <Pressable
                onPress={() => setReviewOpen(false)}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>

            <View className="rounded-2xl bg-lav-faint p-4">
              <SummaryRow label="Principal" value={formatMoney(amountNum)} />
              <SummaryRow label={`Interest (${Math.round(LOAN_INTEREST_RATE * 100)}%)`} value={formatMoney(estInterest)} border />
              <SummaryRow label="Total repayable" value={formatMoney(estTotal)} border strong />
              <SummaryRow
                label={`Per ${frequency === 'once' ? 'payment' : frequency === 'weekly' ? 'week' : 'month'}`}
                value={`${formatMoney(perInstallment)} × ${count}`}
                border
              />
            </View>

            <Text className="mt-3 text-[11px] leading-4 text-faded">
              Figures are an estimate. Final interest and schedule are confirmed once your loan is created.
            </Text>

            <ErrorText message={error} className="mt-3" />

            <Button
              title="Confirm application"
              icon="checkmark"
              onPress={submit}
              loading={apply.isPending}
              className="mt-4"
            />
          </View>
        </View>
        </GestureHandlerRootView>
      </Modal>
    </Screen>
  );
}

function SummaryRow({
  label,
  value,
  border,
  strong,
}: {
  label: string;
  value: string;
  border?: boolean;
  strong?: boolean;
}) {
  return (
    <View
      className="flex-row items-center justify-between py-2.5"
      style={border ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
    >
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</Text>
      <Text
        className={`ml-4 flex-1 text-right ${strong ? 'text-[17px] font-extrabold' : 'text-[15px] font-semibold'} text-ink`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
