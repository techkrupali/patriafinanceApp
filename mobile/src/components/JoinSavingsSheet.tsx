import React, { useEffect, useState } from 'react';
import { Modal, Switch, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';
import { FundingSourceSelect } from './FundingSourceSelect';
import { FrequencyPicker } from './FrequencyPicker';
import { Input } from './Input';
import { Button } from './Button';
import { ErrorText } from './ErrorText';
import { colors } from '../theme';
import { useWallets, type AcceptInvitationOptions } from '../api/hooks';
import { formatMoney, formatYmd, groupAmountInput, sanitizeAmountInput } from '../lib/format';
import type { SavingsFrequency, WalletInvitation } from '../api/types';

interface JoinSavingsSheetProps {
  invitation: WalletInvitation | null;
  loading: boolean;
  error: string | null;
  onConfirm: (options: AcceptInvitationOptions) => void;
  onClose: () => void;
}

/**
 * Accepting an invite to a savings goal: see the plan you're joining and pick
 * the wallet your savings come from (client: savings rules debit "all
 * contributors"). Amount/schedule are editable only if the owner allows it.
 * An emergency fund invite (EMG-02) carries the monthly amount asked of you,
 * saved on the 25th; you can change it.
 */
export function JoinSavingsSheet({ invitation, loading, error, onConfirm, onClose }: JoinSavingsSheetProps) {
  const insets = useSafeAreaInsets();
  const wallets = useWallets();
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked);
  const plan = invitation?.savings ?? null;
  const pledge = plan ? null : invitation?.pledge ?? null;
  // A salary share or round-ups only plan has no amount of your own to set.
  const ownAmount = Boolean(plan?.allow_contributor_edit && plan.schedule !== false);

  const [autoSave, setAutoSave] = useState(true);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [schedule, setSchedule] = useState<{ frequency: SavingsFrequency; dayOfWeek: number; dayOfMonth: number }>({
    frequency: 'monthly',
    dayOfWeek: 1,
    dayOfMonth: 1,
  });

  // Fresh form, prefilled with the plan, each time the sheet opens.
  useEffect(() => {
    if (pledge) {
      setAutoSave(true);
      setSourceId(null);
      setAmount(String(parseFloat(pledge.amount)));
      return;
    }
    if (!plan) return;
    setAutoSave(plan.auto_save);
    setSourceId(null);
    setAmount(String(parseFloat(plan.amount)));
    setSchedule({ frequency: plan.frequency, dayOfWeek: plan.day_of_week ?? 1, dayOfMonth: plan.day_of_month ?? 1 });
  }, [invitation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = sourceId ?? sources.find((w) => w.type === 'main')?.id ?? sources[0]?.id ?? null;

  const confirm = () => {
    if (!autoSave) {
      onConfirm({});
      return;
    }
    if (pledge) {
      onConfirm({ source_wallet_id: source ?? undefined, amount });
      return;
    }
    onConfirm({
      source_wallet_id: source ?? undefined,
      ...(ownAmount
        ? {
            amount,
            frequency: schedule.frequency,
            day_of_week: schedule.frequency === 'weekly' ? schedule.dayOfWeek : undefined,
            day_of_month: schedule.frequency === 'monthly' ? schedule.dayOfMonth : undefined,
          }
        : {}),
    });
  };

  return (
    <Modal visible={invitation !== null} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t bg-white" style={{ maxHeight: '92%', paddingBottom: insets.bottom + 12 }}>
            <View className="mb-2 mt-3 h-1.5 w-12 self-center rounded-full bg-lav" />
            <View className="flex-row items-center px-6 pb-2">
              <Text className="flex-1 text-lg font-extrabold text-ink" numberOfLines={1}>
                Join {invitation?.wallet?.name ?? (pledge ? 'the fund' : 'Savings')}
              </Text>
              <Pressable onPress={onClose} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70">
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>

            <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              {plan ? (
                <View className="rounded bg-success-soft p-4">
                  <Text className="text-[15px] font-bold text-brand-deep">Everyone saves {plan.label}</Text>
                  {plan.target_amount ? (
                    <Text className="mt-1 text-[13px] text-brand-deep">
                      Goal: {formatMoney(plan.target_amount)}
                      {plan.target_date ? ` by ${formatYmd(plan.target_date)}` : ''}
                    </Text>
                  ) : null}
                </View>
              ) : pledge ? (
                <View className="rounded bg-success-soft p-4">
                  <Text className="text-[15px] font-bold text-brand-deep">You were asked to put in {pledge.label}</Text>
                  <Text className="mt-1 text-[13px] text-brand-deep">You can see the balance and every release. You can't take money out on your own.</Text>
                </View>
              ) : null}

              <View className="mt-5 flex-row items-center">
                <View className="flex-1 pr-2">
                  <Text className="text-[15px] font-bold text-ink">Start Auto-Saving Now</Text>
                  <Text className="text-[12px] text-muted">Money moves from your wallet on schedule. Pause it any time.</Text>
                </View>
                <Switch value={autoSave} onValueChange={setAutoSave} trackColor={{ false: colors.lav, true: colors.brand }} thumbColor={colors.white} />
              </View>

              {autoSave ? (
                <>
                  <FundingSourceSelect label="Save From" wallets={sources} value={source} onChange={setSourceId} className="mt-5" />
                  {pledge ? (
                    <Input
                      label="Each Month, on the 25th"
                      prefix="₦"
                      value={groupAmountInput(amount)}
                      onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      containerClassName="mt-5"
                    />
                  ) : ownAmount ? (
                    <>
                      <Input
                        label="My Amount"
                        prefix="₦"
                        value={groupAmountInput(amount)}
                        onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        containerClassName="mt-5"
                      />
                      <Text className="mb-2 mt-5 text-[13px] font-semibold text-muted">How Often</Text>
                      <FrequencyPicker
                        frequency={schedule.frequency}
                        dayOfWeek={schedule.dayOfWeek}
                        dayOfMonth={schedule.dayOfMonth}
                        onChange={setSchedule}
                      />
                    </>
                  ) : (
                    <Text className="mt-3 text-[12px] text-muted">The owner sets how everyone saves: {plan?.label}.</Text>
                  )}
                </>
              ) : (
                <Text className="mt-3 text-[12px] leading-5 text-muted">
                  You'll join and can add money yourself. You can start auto-saving later from the wallet's Savings Plan.
                </Text>
              )}

              <ErrorText message={error} className="mt-4" />
              <Button
                title={autoSave ? 'Join & Start Saving' : 'Join'}
                icon="checkmark"
                onPress={confirm}
                loading={loading}
                className="mt-5"
              />
            </KeyboardAwareScrollView>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
