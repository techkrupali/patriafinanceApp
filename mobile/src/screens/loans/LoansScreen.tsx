import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useLoans } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { isRepayable, loanCategoryOption, loanStatusVisual } from '../../lib/loans';
import type { Loan } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function LoanCard({ loan, onPress }: { loan: Loan; onPress: () => void }) {
  const cat = loanCategoryOption(loan.category);
  const status = loanStatusVisual(loan.status);
  const showProgress = isRepayable(loan.status);
  const pct = Math.max(0, Math.min(loan.progress_pct, 100));

  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="rounded-3xl bg-white p-4 active:opacity-90"
      style={shadow.soft}
    >
      <View className="flex-row items-center">
        <View className="mr-3.5 h-11 w-11 items-center justify-center rounded-2xl bg-lav">
          <Ionicons name={cat.icon} size={22} color={colors.navy} />
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {cat.label}
          </Text>
          <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
            Ref · {loan.reference}
          </Text>
        </View>
        <Text className="text-[15px] font-extrabold text-ink">{formatMoney(loan.principal)}</Text>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
          <Ionicons name={status.icon} size={12} color={colors.muted} style={{ marginRight: 4 }} />
          <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
        </View>
        {showProgress ? (
          <Text className="text-xs font-semibold text-muted">
            Outstanding {formatMoney(loan.outstanding)}
          </Text>
        ) : null}
      </View>

      {showProgress ? (
        <View className="mt-3">
          <View className="h-2 overflow-hidden rounded-full bg-lav-faint">
            <View className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(pct, 2)}%` }} />
          </View>
          <Text className="mt-1.5 text-[11px] text-faded">{Math.floor(pct)}% repaid</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function LoansScreen({ navigation }: RootScreenProps<'Loans'>) {
  const query = useLoans();
  const loans = query.data?.loans ?? [];
  const summary = query.data?.summary;
  const hasActive = summary?.has_active_loan ?? false;

  return (
    <Screen withBottomInset>
      <Header title="Patria Lending" />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
        }
      >
        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : (
          <>
            {/* Summary hero */}
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
            >
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                Active outstanding
              </Text>
              <Text className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight text-white">
                {formatMoney(summary?.active_outstanding ?? '0')}
              </Text>
              <View className="mt-4 flex-row items-center">
                <Ionicons name="wallet-outline" size={15} color={colors.brandGlow} style={{ marginRight: 6 }} />
                <Text className="text-[13px] text-white/70">
                  {formatMoney(summary?.total_borrowed ?? '0')} borrowed all-time
                </Text>
              </View>
            </LinearGradient>

            {/* Apply CTA */}
            <View className="mt-5">
              <Button
                title="Apply for a loan"
                icon="add"
                iconPosition="left"
                onPress={() => navigation.navigate('LoanApply')}
                disabled={hasActive}
              />
              {hasActive ? (
                <View className="mt-2.5 flex-row items-start rounded-2xl bg-lav-faint p-3.5">
                  <Ionicons name="information-circle" size={17} color={colors.brand} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text className="flex-1 text-[13px] leading-5 text-muted">
                    You already have an active loan. Repay it fully before applying for another.
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Loans list */}
            <Text className="mt-8 text-lg font-bold text-ink">Your loans</Text>
            <View className="mt-3" style={{ gap: 12 }}>
              {loans.length === 0 ? (
                <EmptyState
                  title="No loans yet"
                  message="Borrow for rent, school fees, business and more — repay in easy installments."
                  icon="cash-outline"
                />
              ) : (
                loans.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    onPress={() => navigation.navigate('LoanDetail', { loanId: loan.id })}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
