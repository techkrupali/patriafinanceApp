import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useKyc } from '../../api/hooks';
import { dayLabel, formatMoney } from '../../lib/format';
import {
  TIER_SHORT_NAMES,
  kycStatusVisual,
  submissionStatusVisual,
  tierName,
} from '../../lib/kyc';
import type { KycLimits, KycState } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const STEPS = [0, 1, 2, 3];

/** '₦…' amount, or 'Unlimited' when the API returns null (no cap). */
function limitLabel(value: string | null): string {
  return value == null ? 'Unlimited' : formatMoney(value);
}

function TierStepper({ kyc }: { kyc: KycState }) {
  const pendingTarget =
    kyc.status === 'pending' && kyc.pending_submission ? kyc.pending_submission.target_tier : null;

  return (
    <View className="mt-5 flex-row">
      {STEPS.map((t, i) => {
        const passed = t < kyc.tier;
        const current = t === kyc.tier;
        const isPending = t === pendingTarget;

        // Connector segment is "reached" (brand) once its higher endpoint tier is done.
        const leftReached = t <= kyc.tier;
        const rightReached = t + 1 <= kyc.tier;

        let nodeClass = 'border-2 border-border bg-lav-faint';
        let inner: React.ReactNode = (
          <Text className="text-[13px] font-bold text-faded">{t}</Text>
        );
        if (passed) {
          nodeClass = 'bg-brand';
          inner = <Ionicons name="checkmark" size={18} color={colors.white} />;
        } else if (current) {
          nodeClass = 'border-2 border-brand-glow bg-navy';
          inner = <Text className="text-[13px] font-bold text-white">{t}</Text>;
        } else if (isPending) {
          nodeClass = 'border-2 border-brand bg-lav-soft';
          inner = <Ionicons name="time-outline" size={16} color={colors.brand} />;
        }

        return (
          <View key={t} className="flex-1 items-center">
            <View className="w-full flex-row items-center">
              <View
                className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : leftReached ? 'bg-brand' : 'bg-border'}`}
              />
              <View className={`h-9 w-9 items-center justify-center rounded-full ${nodeClass}`}>
                {inner}
              </View>
              <View
                className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'bg-transparent' : rightReached ? 'bg-brand' : 'bg-border'}`}
              />
            </View>
            <Text
              className={`mt-2 text-[10px] font-semibold ${current ? 'text-brand' : 'text-faded'}`}
              numberOfLines={1}
            >
              {TIER_SHORT_NAMES[t]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function LimitsCard({ limits, title }: { limits: KycLimits; title: string }) {
  return (
    <>
      <Text className="mt-8 text-lg font-bold text-ink">{title}</Text>
      <Card className="mt-3 py-1">
        <LimitRow icon="wallet-outline" label="Wallets" value={`Up to ${limits.max_wallets}`} />
        <Divider />
        <LimitRow
          icon="paper-plane-outline"
          label="Daily transfer limit"
          value={limitLabel(limits.daily_transfer_limit)}
        />
        <Divider />
        <LimitRow icon="cash-outline" label="Loan cap" value={formatMoney(limits.loan_cap)} />
      </Card>
    </>
  );
}

export function KycScreen({ navigation }: RootScreenProps<'Kyc'>) {
  const query = useKyc();
  const kyc = query.data;
  const status = kyc ? kycStatusVisual(kyc.status) : null;
  const next = kyc?.next_tier ?? null;
  const pending = kyc?.status === 'pending' ? kyc.pending_submission : null;

  return (
    <Screen withBottomInset>
      <Header title="Verification" />

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : query.error ? (
        <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : kyc && status ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
          }
        >
          {/* Hero: current tier + status */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                Current tier
              </Text>
              <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
                <Ionicons name={status.icon} size={12} color={colors.muted} style={{ marginRight: 4 }} />
                <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
              </View>
            </View>
            <Text className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight text-white">
              Tier {kyc.tier}
            </Text>
            <Text className="mt-1 text-[13px] text-white/60">
              {kyc.tier === 0 ? 'Not verified yet' : `${tierName(kyc.tier)} verified`}
              {' · '}
              {kyc.tier} of {kyc.max_tier}
            </Text>
          </LinearGradient>

          {/* Tier progress stepper */}
          <TierStepper kyc={kyc} />

          {/* Current limits */}
          <LimitsCard limits={kyc.limits} title="Your current limits" />

          {/* Verification state */}
          {pending ? (
            <>
              <Text className="mt-8 text-lg font-bold text-ink">Verification under review</Text>
              <Card className="mt-3">
                <View className="flex-row items-center">
                  <View className="mr-3.5 h-11 w-11 items-center justify-center rounded-2xl bg-lav-soft">
                    <Ionicons name="hourglass-outline" size={22} color={colors.navy} />
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="text-[15px] font-bold text-ink">
                      Tier {pending.target_tier} · {tierName(pending.target_tier)}
                    </Text>
                    <Text className="mt-0.5 text-xs text-muted">
                      Submitted {dayLabel(pending.created_at)}
                    </Text>
                  </View>
                  {(() => {
                    const sv = submissionStatusVisual(pending.status);
                    return (
                      <View className={`flex-row items-center rounded-full px-2.5 py-1 ${sv.bg}`}>
                        <Ionicons name={sv.icon} size={12} color={colors.muted} style={{ marginRight: 4 }} />
                        <Text className={`text-[10px] font-bold uppercase tracking-wider ${sv.text}`}>{sv.label}</Text>
                      </View>
                    );
                  })()}
                </View>
                <View className="mt-4 flex-row items-start rounded-2xl bg-lav-faint p-3.5">
                  <Ionicons name="information-circle" size={17} color={colors.brand} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text className="flex-1 text-[13px] leading-5 text-muted">
                    We're reviewing your documents. This usually takes a short while — we'll update your tier
                    and limits once it's approved.
                  </Text>
                </View>
                {pending.review_note ? (
                  <Text className="mt-3 text-[13px] leading-5 text-muted">{pending.review_note}</Text>
                ) : null}
              </Card>
            </>
          ) : next ? (
            <>
              <Text className="mt-8 text-lg font-bold text-ink">
                Upgrade to Tier {next.tier} · {tierName(next.tier)}
              </Text>

              {/* Requirements */}
              <Card className="mt-3">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  What you'll need
                </Text>
                <View className="mt-3" style={{ gap: 12 }}>
                  {next.requirements.map((req) => (
                    <View key={req} className="flex-row items-start">
                      <Ionicons name="ellipse-outline" size={18} color={colors.brand} style={{ marginRight: 10, marginTop: 1 }} />
                      <Text className="flex-1 text-[14px] leading-5 text-ink">{req}</Text>
                    </View>
                  ))}
                </View>

                <View className="mt-4" style={{ height: 1, backgroundColor: colors.border }} />

                <Text className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  What you'll unlock
                </Text>
                <View className="mt-2">
                  <BenefitRow icon="wallet-outline" label="Wallets" value={`Up to ${next.benefits.max_wallets}`} />
                  <BenefitRow
                    icon="paper-plane-outline"
                    label="Daily transfer"
                    value={limitLabel(next.benefits.daily_transfer_limit)}
                  />
                  <BenefitRow icon="cash-outline" label="Loan cap" value={formatMoney(next.benefits.loan_cap)} />
                </View>
              </Card>

              <Button
                title={`Verify Tier ${next.tier}`}
                icon="shield-checkmark"
                iconPosition="left"
                onPress={() => navigation.navigate('KycSubmit', { targetTier: next.tier })}
                className="mt-5"
              />
            </>
          ) : (
            <Card className="mt-8 items-center py-8">
              <View className="h-16 w-16 items-center justify-center rounded-3xl bg-success-soft">
                <Ionicons name="shield-checkmark" size={30} color={colors.brand} />
              </View>
              <Text className="mt-4 text-base font-bold text-ink">Fully verified</Text>
              <Text className="mt-1.5 text-center text-sm text-muted">
                You've reached Tier {kyc.max_tier} — the highest verification level. Your limits are maxed out.
              </Text>
            </Card>
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

function LimitRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View className="flex-row items-center py-3.5">
      <View className="mr-3.5 h-10 w-10 items-center justify-center rounded-2xl bg-lav-faint">
        <Ionicons name={icon} size={19} color={colors.navy} />
      </View>
      <Text className="flex-1 text-[15px] font-semibold text-ink">{label}</Text>
      <Text className="ml-3 text-[15px] font-bold text-ink" numberOfLines={1}>{value}</Text>
    </View>
  );
}

function BenefitRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View className="flex-row items-center py-2">
      <Ionicons name={icon} size={16} color={colors.brand} style={{ marginRight: 8 }} />
      <Text className="flex-1 text-[13px] text-muted">{label}</Text>
      <Text className="ml-3 text-[14px] font-bold text-ink" numberOfLines={1}>{value}</Text>
    </View>
  );
}
