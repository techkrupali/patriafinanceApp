import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { colors, gradients, shadow } from '../../theme';
import { useWallet, useWalletLock } from '../../api/hooks';
import { selection, notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const DAYS: { value: number; short: string }[] = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' },
];

const shortDay = (v: number) => DAYS.find((d) => d.value === v)?.short ?? '';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Compress a set of ISO weekdays into a readable label, e.g. "Mon–Fri" or "Mon, Wed, Fri". */
function daysSummary(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return 'No days';
  if (sorted.length === 7) return 'Every day';
  // Detect a single contiguous run.
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) {
    return `${shortDay(sorted[0])}–${shortDay(sorted[sorted.length - 1])}`;
  }
  return sorted.map(shortDay).join(', ');
}

export function WalletLockScreen({ route }: RootScreenProps<'WalletLock'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const { freeze, unfreeze, setSchedule } = useWalletLock(walletId);

  const wallet = detail.data?.wallet;
  const frozen = wallet?.status === 'frozen';
  const schedule = wallet?.access_schedule ?? null;

  // ---- local editor state (seeded from the wallet) ----
  const [restrict, setRestrict] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('20:00');
  const [formError, setFormError] = useState<string | null>(null);

  // Seed local state whenever the wallet's status/schedule changes.
  useEffect(() => {
    if (!wallet) return;
    const s = wallet.access_schedule ?? null;
    setRestrict(Boolean(s));
    setDays(s?.days?.length ? [...s.days].sort((a, b) => a - b) : [1, 2, 3, 4, 5]);
    setStart(s?.start ?? '08:00');
    setEnd(s?.end ?? '20:00');
    setFormError(null);
  }, [wallet?.status, wallet?.access_schedule]);

  const confirmFreeze = () => {
    Alert.alert('Freeze wallet?', 'Spending will be blocked until you unfreeze.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Freeze',
        style: 'destructive',
        onPress: () => freeze.mutate(undefined, { onSuccess: () => notifySuccess() }),
      },
    ]);
  };

  const confirmUnfreeze = () => {
    Alert.alert('Unfreeze wallet?', 'Spending will be allowed again on this wallet.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfreeze',
        onPress: () => unfreeze.mutate(undefined, { onSuccess: () => notifySuccess() }),
      },
    ]);
  };

  const toggleDay = (value: number) => {
    selection();
    setFormError(null);
    setDays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b),
    );
  };

  const toggleRestrict = (on: boolean) => {
    selection();
    setRestrict(on);
    setFormError(null);
    // Turning it off on a wallet that already has a schedule clears it server-side.
    if (!on && schedule) {
      setSchedule.mutate(null, { onSuccess: () => notifySuccess() });
    }
  };

  const saveSchedule = () => {
    setFormError(null);
    if (days.length === 0) {
      setFormError('Pick at least one day.');
      return;
    }
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
      setFormError('Enter times as HH:MM (00:00–23:59).');
      return;
    }
    if (start >= end) {
      setFormError('Start time must be before end time.');
      return;
    }
    setSchedule.mutate(
      { days, start, end },
      { onSuccess: () => notifySuccess() },
    );
  };

  const refresh = () => {
    void detail.refetch();
  };

  return (
    <Screen withBottomInset>
      <Header title="Lock & access" />

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={refresh} />
      ) : wallet ? (
        <KeyboardAwareScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} tintColor={colors.navy} />
          }
        >
          {/* ---------- Freeze hero ---------- */}
          <LinearGradient
            colors={frozen ? gradients.brand : gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center justify-between">
              <View
                className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15"
                style={{ borderRadius: 18 }}
              >
                <Ionicons
                  name={frozen ? 'lock-closed' : 'lock-open'}
                  size={24}
                  color={frozen ? colors.brandGlow : colors.white}
                />
              </View>
              <View
                className={`rounded-full px-3 py-1 ${frozen ? 'bg-danger-soft' : 'bg-white/20'}`}
              >
                <Text
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    frozen ? 'text-danger' : 'text-brand-glow'
                  }`}
                >
                  {frozen ? 'Frozen' : 'Active'}
                </Text>
              </View>
            </View>

            <Text className="mt-5 text-[22px] font-extrabold leading-tight text-white">
              {frozen ? 'Wallet frozen' : 'Wallet active'}
            </Text>
            <Text className="mt-1.5 text-[14px] leading-5 text-white/70">
              {frozen
                ? 'No money can leave this wallet.'
                : 'Money can move freely from this wallet.'}
            </Text>
          </LinearGradient>

          {frozen ? (
            <Button
              title="Unfreeze wallet"
              icon="lock-open"
              onPress={confirmUnfreeze}
              loading={unfreeze.isPending}
              className="mt-4"
            />
          ) : (
            <Button
              title="Freeze wallet"
              icon="lock-closed"
              variant="danger"
              onPress={confirmFreeze}
              loading={freeze.isPending}
              className="mt-4"
            />
          )}

          <View className="mt-3 flex-row items-start rounded-2xl bg-lav-faint px-4 py-3">
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={colors.muted}
              style={{ marginRight: 8, marginTop: 1 }}
            />
            <Text className="flex-1 text-xs leading-4 text-muted">
              While frozen, spending is blocked for everyone — including the owner and co-owners.
              Incoming funds still arrive.
            </Text>
          </View>

          {/* ---------- Scheduled access ---------- */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
            Scheduled access
          </Text>

          <Card className="mt-3">
            <View className="flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-lav-faint">
                <Ionicons name="time-outline" size={20} color={colors.navy} />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-[14px] font-bold text-ink">Restrict to a time window</Text>
                <Text className="mt-0.5 text-xs text-muted">
                  Allow spending only on chosen days and hours.
                </Text>
              </View>
              <Switch
                value={restrict}
                onValueChange={toggleRestrict}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor={colors.white}
              />
            </View>

            {schedule ? (
              <View className="mt-3 flex-row items-center rounded-2xl bg-success-soft px-3.5 py-2.5">
                <Ionicons name="calendar-outline" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                <Text className="flex-1 text-[13px] font-semibold text-brand">
                  {daysSummary(schedule.days)}, {schedule.start}–{schedule.end}
                </Text>
              </View>
            ) : null}
          </Card>

          {restrict ? (
            <>
              {/* Days */}
              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                Days
              </Text>
              <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                {DAYS.map((d) => {
                  const on = days.includes(d.value);
                  return (
                    <Pressable
                      key={d.value}
                      onPress={() => toggleDay(d.value)}
                      className={`rounded-full px-4 py-2.5 active:opacity-80 ${on ? 'bg-navy' : 'bg-lav'}`}
                      style={on ? shadow.soft : undefined}
                    >
                      <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-ink'}`}>
                        {d.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Window */}
              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                Window
              </Text>
              <View className="mt-3 flex-row" style={{ gap: 12 }}>
                <Input
                  containerClassName="flex-1"
                  label="Start (HH:MM)"
                  icon="sunny-outline"
                  value={start}
                  onChangeText={(t) => {
                    setStart(t);
                    setFormError(null);
                  }}
                  placeholder="08:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  autoCorrect={false}
                />
                <Input
                  containerClassName="flex-1"
                  label="End (HH:MM)"
                  icon="moon-outline"
                  value={end}
                  onChangeText={(t) => {
                    setEnd(t);
                    setFormError(null);
                  }}
                  placeholder="20:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  autoCorrect={false}
                />
              </View>

              <ErrorText message={formError} className="mt-4" />

              <Button
                title="Save schedule"
                icon="checkmark"
                onPress={saveSchedule}
                loading={setSchedule.isPending}
                className="mt-6"
              />
            </>
          ) : null}
        </KeyboardAwareScrollView>
      ) : null}
    </Screen>
  );
}
