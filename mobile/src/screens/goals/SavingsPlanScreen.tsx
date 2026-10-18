import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { DatePickerField } from '../../components/DatePickerField';
import { FundingSourceSelect } from '../../components/FundingSourceSelect';
import { PersonAvatar } from '../../components/PersonPicker';
import { FrequencyPicker } from '../../components/FrequencyPicker';
import { colors, outline, radius } from '../../theme';
import { useSavings, useSavingsActions, useWallet, useWallets } from '../../api/hooks';
import { formatMoney, formatYmd, groupAmountInput, sanitizeAmountInput, toYmd } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import type { SavingsFrequency, SavingsTerms } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const SAVER_STATUS: Record<string, string> = { owner: 'Owner', member: 'Saver', invited: 'Invited' };

interface TermsForm {
  amount: string;
  frequency: SavingsFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
}

function termsForm(t: SavingsTerms | null | undefined): TermsForm {
  const today = new Date();
  return {
    amount: t ? String(parseFloat(t.amount)) : '',
    frequency: t?.frequency ?? 'monthly',
    dayOfWeek: t?.day_of_week ?? ((today.getDay() + 6) % 7) + 1,
    dayOfMonth: t?.day_of_month ?? Math.min(today.getDate(), 28),
  };
}

function termsPayload(f: TermsForm) {
  return {
    amount: f.amount,
    frequency: f.frequency,
    day_of_week: f.frequency === 'weekly' ? f.dayOfWeek : undefined,
    day_of_month: f.frequency === 'monthly' ? f.dayOfMonth : undefined,
  };
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="mt-7">
      <View className="flex-row items-center">
        <Text className="flex-1 text-sm font-extrabold text-ink">{title}</Text>
        {right}
      </View>
      <View className="mt-3" style={{ gap: 10 }}>
        {children}
      </View>
    </View>
  );
}

/**
 * A savings goal's shared plan: progress toward the target and date, milestones,
 * every saver and what they've put in, the viewer's own auto-save, and — for the
 * owner — the rule everyone follows.
 */
export function SavingsPlanScreen({ navigation, route }: RootScreenProps<'SavingsPlan'>) {
  const { walletId } = route.params;
  const savings = useSavings(walletId);
  const wallet = useWallet(walletId);
  const wallets = useWallets();
  const actions = useSavingsActions(walletId);
  const s = savings.data;
  const visual = walletVisual(wallet.data?.wallet.type);
  const mySources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked && w.id !== walletId);

  const [error, setError] = useState<string | null>(null);
  const [editingMine, setEditingMine] = useState(false);
  const [mine, setMine] = useState<TermsForm>(termsForm(null));
  const [mineTouched, setMineTouched] = useState(false);
  const [mySource, setMySource] = useState<number | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [plan, setPlan] = useState<TermsForm & { targetDate: string | null; target: string }>({ ...termsForm(null), targetDate: null, target: '' });
  const [milestone, setMilestone] = useState<{ open: boolean; title: string; amount: string; dueDate: string | null }>({ open: false, title: '', amount: '', dueDate: null });

  const fail = (e: Error) => setError(e.message);
  const done = () => {
    notifySuccess();
    setError(null);
  };

  if (savings.isLoading) {
    return (
      <Screen>
        <Header title="Savings Plan" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </Screen>
    );
  }
  if (savings.isError || !s) {
    return (
      <Screen>
        <Header title="Savings Plan" />
        <LoadError message={(savings.error as Error | null)?.message} onRetry={() => void savings.refetch()} />
      </Screen>
    );
  }

  const me = s.me;
  // Until the saver edits it, the form shows the plan's terms.
  const mineView = mineTouched || editingMine ? mine : termsForm(s.plan);
  const editMine = (patch: Partial<TermsForm>) => {
    setMine({ ...mineView, ...patch });
    setMineTouched(true);
  };
  const sourceId = mySource ?? me.auto_save?.source_wallet?.id ?? mySources.find((w) => w.type === 'main')?.id ?? mySources[0]?.id ?? null;
  const tomorrow = toYmd(new Date(Date.now() + 86_400_000));

  const startEditMine = () => {
    selection();
    setMine(termsForm(me.auto_save ?? s.plan));
    setMySource(null);
    setEditingMine(true);
  };
  const startEditPlan = () => {
    selection();
    setPlan({ ...termsForm(s.plan), targetDate: s.target_date, target: s.target_amount ? String(parseFloat(s.target_amount)) : '' });
    setEditingPlan(true);
  };

  const saveMine = () => {
    if (!sourceId) {
      setError('Choose the wallet your savings come from.');
      return;
    }
    if (me.can_edit_own_terms && !(Number(mineView.amount) > 0)) {
      setError('Enter how much you save each time.');
      return;
    }
    const terms = me.can_edit_own_terms ? termsPayload(mineView) : {};
    const opts = {
      onSuccess: () => {
        done();
        setEditingMine(false);
        setMineTouched(false);
      },
      onError: fail,
    };
    if (me.auto_save) actions.updateAutoSave.mutate({ source_wallet_id: sourceId, ...terms }, opts);
    else actions.startAutoSave.mutate({ source_wallet_id: sourceId, ...terms }, opts);
  };

  const savePlan = () => {
    if (!(Number(plan.amount) > 0)) {
      setError('Enter how much each person saves.');
      return;
    }
    actions.updatePlan.mutate(
      {
        ...termsPayload(plan),
        target_amount: plan.target || null,
        target_date: plan.targetDate,
        ...(s.plan ? {} : { auto_save: true, allow_contributor_edit: false }),
      },
      {
        onSuccess: () => {
          done();
          setEditingPlan(false);
        },
        onError: fail,
      },
    );
  };

  const addMilestone = () => {
    if (!milestone.title.trim() || !(Number(milestone.amount) > 0)) {
      setError('Give the milestone a name and an amount.');
      return;
    }
    actions.addMilestone.mutate(
      { title: milestone.title.trim(), amount: milestone.amount, due_date: milestone.dueDate ?? undefined },
      {
        onSuccess: () => {
          done();
          setMilestone({ open: false, title: '', amount: '', dueDate: null });
        },
        onError: fail,
      },
    );
  };

  const projection = s.projection;
  const paceLine = projection.reached
    ? 'Target reached — well done!'
    : projection.projected_date
      ? projection.on_track === false
        ? `At this pace you'll get there around ${formatYmd(projection.projected_date)} — after your target date.`
        : `At this pace you'll get there around ${formatYmd(projection.projected_date)}.`
      : 'Turn on auto-save to see when you will reach your target.';

  return (
    <Screen withBottomInset>
      <Header title="Savings Plan" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={savings.isRefetching} onRefresh={() => void savings.refetch()} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress */}
        <LinearGradient colors={visual.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius, padding: 22 }}>
          <Text className={`text-[13px] font-semibold ${visual.onDark ? 'text-white/70' : 'text-muted'}`}>
            {wallet.data?.wallet.name ?? 'Savings'}
          </Text>
          <Text className={`mt-1 text-[30px] font-extrabold ${visual.onDark ? 'text-white' : 'text-ink'}`}>{formatMoney(s.balance)}</Text>
          {s.target_amount ? (
            <>
              <Text className={`text-[13px] ${visual.onDark ? 'text-white/70' : 'text-muted'}`}>
                of {formatMoney(s.target_amount)} · {Math.floor(s.progress ?? 0)}%
              </Text>
              <View className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
                <View className="h-2 rounded-full bg-brand-mint" style={{ width: `${Math.max(3, s.progress ?? 0)}%` }} />
              </View>
            </>
          ) : null}
          {s.target_date ? (
            <Text className={`mt-3 text-[13px] font-semibold ${visual.onDark ? 'text-white' : 'text-ink'}`}>
              Target date {formatYmd(s.target_date)}
              {s.days_left !== null ? ` · ${s.days_left} day${s.days_left === 1 ? '' : 's'} left` : ''}
            </Text>
          ) : null}
        </LinearGradient>

        <View className={`mt-3 flex-row items-start rounded p-4 ${projection.on_track === false ? 'bg-danger-soft' : 'bg-success-soft'}`}>
          <Ionicons
            name={projection.on_track === false ? 'alert-circle' : 'trending-up'}
            size={17}
            color={projection.on_track === false ? colors.danger : colors.brand}
            style={{ marginRight: 10, marginTop: 1 }}
          />
          <View className="flex-1">
            <Text className={`text-[13px] leading-5 ${projection.on_track === false ? 'text-danger' : 'text-brand-deep'}`}>{paceLine}</Text>
            {projection.on_track === false && projection.suggested_amount && s.plan ? (
              <Text className="mt-1 text-[12px] text-danger">
                To finish on time each saver needs about {formatMoney(projection.suggested_amount)} per {s.plan.frequency === 'daily' ? 'day' : s.plan.frequency === 'weekly' ? 'week' : 'month'}.
              </Text>
            ) : null}
          </View>
        </View>

        <ErrorText message={error} className="mt-4" />

        {/* My auto-save */}
        {me.is_saver && s.plan ? (
          <Section title="My Auto-Save">
            {editingMine || (!me.auto_save && me.can_start_auto_save) ? (
              <View className="rounded bg-white p-4" style={outline.card}>
                {!me.auto_save ? (
                  <Text className="mb-4 text-[13px] leading-5 text-muted">
                    Save automatically: {me.can_edit_own_terms ? 'choose your amount and schedule' : s.plan.label}.
                  </Text>
                ) : null}
                <FundingSourceSelect label="Save From" wallets={mySources} value={sourceId} onChange={setMySource} />
                {me.can_edit_own_terms ? (
                  <>
                    <Input
                      label="Amount"
                      prefix="₦"
                      value={groupAmountInput(mineView.amount)}
                      onChangeText={(t) => editMine({ amount: sanitizeAmountInput(t) })}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      containerClassName="mt-4"
                    />
                    <Text className="mb-2 mt-4 text-[13px] font-semibold text-muted">How Often</Text>
                    <FrequencyPicker frequency={mineView.frequency} dayOfWeek={mineView.dayOfWeek} dayOfMonth={mineView.dayOfMonth} onChange={editMine} />
                  </>
                ) : (
                  <Text className="mt-3 text-[12px] text-muted">The owner sets the amount and schedule: {s.plan.label}.</Text>
                )}
                <Button
                  title={me.auto_save ? 'Save Changes' : 'Start Auto-Saving'}
                  icon="checkmark"
                  onPress={saveMine}
                  loading={actions.startAutoSave.isPending || actions.updateAutoSave.isPending}
                  className="mt-4"
                />
                {editingMine ? (
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setEditingMine(false);
                      setMineTouched(false);
                    }}
                    className="mt-3"
                  />
                ) : null}
              </View>
            ) : me.auto_save ? (
              <View className="rounded bg-white p-4" style={outline.card}>
                <View className="flex-row items-center">
                  <View className="flex-1 pr-2">
                    <Text className="text-[15px] font-bold text-ink">{me.auto_save.label}</Text>
                    <Text className="text-[12px] text-muted">
                      From {me.auto_save.source_wallet?.name ?? 'your wallet'} · {me.auto_save.enabled ? 'On' : 'Paused'}
                    </Text>
                  </View>
                  <Switch
                    value={me.auto_save.enabled}
                    onValueChange={(v) => actions.updateAutoSave.mutate({ enabled: v }, { onSuccess: done, onError: fail })}
                    trackColor={{ false: colors.lav, true: colors.brand }}
                    thumbColor={colors.white}
                  />
                </View>
                <Pressable onPress={startEditMine} className="mt-3 self-start">
                  <Text className="text-[13px] font-bold text-brand">
                    {me.can_edit_own_terms ? 'Change Amount, Schedule or Wallet' : 'Change Wallet'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* Milestones */}
        <Section
          title="Milestones"
          right={
            me.can_edit_plan && !milestone.open ? (
              <Pressable onPress={() => setMilestone((m) => ({ ...m, open: true }))} hitSlop={6} className="flex-row items-center">
                <Ionicons name="add-circle" size={16} color={colors.brand} style={{ marginRight: 4 }} />
                <Text className="text-[13px] font-bold text-brand">Add</Text>
              </Pressable>
            ) : null
          }
        >
          {s.milestones.length === 0 && !milestone.open ? <Text className="text-[13px] text-muted">No milestones yet.</Text> : null}
          {s.milestones.map((m) => (
            <View key={m.id} className="flex-row items-center rounded bg-white p-4" style={outline.card}>
              <Ionicons
                name={m.reached ? 'checkmark-circle' : m.overdue ? 'alert-circle' : 'ellipse-outline'}
                size={22}
                color={m.reached ? colors.brand : m.overdue ? colors.danger : colors.faded}
                style={{ marginRight: 12 }}
              />
              <View className="flex-1 pr-2">
                <Text className="text-[15px] font-bold text-ink">{m.title}</Text>
                <Text className={`text-[12px] ${m.overdue ? 'text-danger' : 'text-muted'}`}>
                  {formatMoney(m.amount)}
                  {m.due_date ? ` · by ${formatYmd(m.due_date)}` : ''}
                  {m.reached ? ' · Reached' : m.overdue ? ' · Overdue' : ''}
                </Text>
              </View>
              {me.can_edit_plan ? (
                <Pressable onPress={() => actions.removeMilestone.mutate(m.id, { onError: fail })} hitSlop={8} accessibilityLabel={`Remove ${m.title}`}>
                  <Ionicons name="trash" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {milestone.open ? (
            <View className="rounded bg-page-top p-4">
              <Input label="Name" value={milestone.title} onChangeText={(v) => setMilestone((m) => ({ ...m, title: v }))} placeholder="e.g. Halfway" maxLength={100} />
              <Input
                label="Amount Saved by Then"
                prefix="₦"
                value={groupAmountInput(milestone.amount)}
                onChangeText={(t) => setMilestone((m) => ({ ...m, amount: sanitizeAmountInput(t) }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                containerClassName="mt-4"
              />
              <DatePickerField label="By When (Optional)" value={milestone.dueDate} onChange={(d) => setMilestone((m) => ({ ...m, dueDate: d }))} minDate={tomorrow} clearable className="mt-4" />
              <Button title="Add Milestone" icon="add" onPress={addMilestone} loading={actions.addMilestone.isPending} className="mt-4" />
              <Button title="Cancel" variant="secondary" onPress={() => setMilestone({ open: false, title: '', amount: '', dueDate: null })} className="mt-3" />
            </View>
          ) : null}
        </Section>

        {/* Savers */}
        <Section
          title="Savers"
          right={
            me.is_owner ? (
              <Pressable onPress={() => navigation.navigate('InviteMember', { walletId })} hitSlop={6} className="flex-row items-center">
                <Ionicons name="person-add" size={15} color={colors.brand} style={{ marginRight: 4 }} />
                <Text className="text-[13px] font-bold text-brand">Invite</Text>
              </Pressable>
            ) : null
          }
        >
          {s.savers.map((sv) => (
            <View key={`${sv.status}-${sv.user.id}`} className="flex-row items-center rounded bg-white p-4" style={outline.card}>
              <PersonAvatar name={sv.user.name} avatarUrl={sv.user.avatar_url} />
              <View className="ml-3 flex-1 pr-2">
                <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                  {sv.user.name}
                </Text>
                <Text className="text-[12px] text-muted" numberOfLines={1}>
                  {SAVER_STATUS[sv.status]} ·{' '}
                  {sv.status === 'invited'
                    ? 'Hasn\'t joined yet'
                    : sv.auto_save
                      ? sv.auto_save.enabled
                        ? sv.auto_save.label
                        : 'Auto-save paused'
                      : 'Not auto-saving'}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[14px] font-bold text-ink">{formatMoney(sv.total_saved)}</Text>
                <Text className="text-[11px] text-muted">saved</Text>
              </View>
            </View>
          ))}
        </Section>

        {/* Owner: the rule for everyone */}
        {me.can_edit_plan ? (
          <Section title={s.plan ? 'Plan for Everyone' : 'Set Up a Savings Plan'}>
            {editingPlan || !s.plan ? (
              <View className="rounded bg-white p-4" style={outline.card}>
                <Input
                  label="Each Person Saves"
                  prefix="₦"
                  value={groupAmountInput(plan.amount)}
                  onChangeText={(t) => setPlan((p) => ({ ...p, amount: sanitizeAmountInput(t) }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                <Text className="mb-2 mt-4 text-[13px] font-semibold text-muted">How Often</Text>
                <FrequencyPicker frequency={plan.frequency} dayOfWeek={plan.dayOfWeek} dayOfMonth={plan.dayOfMonth} onChange={(v) => setPlan((p) => ({ ...p, ...v }))} />
                <Input
                  label="Target Amount"
                  prefix="₦"
                  value={groupAmountInput(plan.target)}
                  onChangeText={(t) => setPlan((p) => ({ ...p, target: sanitizeAmountInput(t) }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  containerClassName="mt-4"
                />
                <DatePickerField label="Target Date" value={plan.targetDate} onChange={(d) => setPlan((p) => ({ ...p, targetDate: d }))} minDate={tomorrow} clearable className="mt-4" />
                <Text className="ml-1 mt-2 text-[12px] text-muted">Changes apply to every saver who hasn't set their own amount or schedule.</Text>
                <Button title="Save Plan" icon="checkmark" onPress={savePlan} loading={actions.updatePlan.isPending} className="mt-4" />
                {s.plan ? <Button title="Cancel" variant="secondary" onPress={() => setEditingPlan(false)} className="mt-3" /> : null}
              </View>
            ) : (
              <View className="rounded bg-white p-4" style={outline.card}>
                <Text className="text-[15px] font-bold text-ink">{s.plan.label}</Text>
                <Text className="text-[12px] text-muted">Each saver · from a wallet they choose</Text>
                <View className="mt-4 flex-row items-center border-t border-border pt-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-[14px] font-semibold text-ink">Auto-Save for Everyone</Text>
                    <Text className="text-[12px] text-muted">Off pauses every saver's automatic debit.</Text>
                  </View>
                  <Switch
                    value={s.plan.auto_save}
                    onValueChange={(v) => actions.updatePlan.mutate({ auto_save: v }, { onSuccess: done, onError: fail })}
                    trackColor={{ false: colors.lav, true: colors.brand }}
                    thumbColor={colors.white}
                  />
                </View>
                <View className="mt-3 flex-row items-center border-t border-border pt-3">
                  <View className="flex-1 pr-2">
                    <Text className="text-[14px] font-semibold text-ink">Let Contributors Adjust</Text>
                    <Text className="text-[12px] text-muted">They can change their own amount and how often they save.</Text>
                  </View>
                  <Switch
                    value={s.plan.allow_contributor_edit}
                    onValueChange={(v) => actions.updatePlan.mutate({ allow_contributor_edit: v }, { onSuccess: done, onError: fail })}
                    trackColor={{ false: colors.lav, true: colors.brand }}
                    thumbColor={colors.white}
                  />
                </View>
                <Pressable onPress={startEditPlan} className="mt-4 self-start">
                  <Text className="text-[13px] font-bold text-brand">Change Amount, Schedule or Target</Text>
                </Pressable>
              </View>
            )}
          </Section>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
