import React, { useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { GuidedIntro } from '../../components/GuidedIntro';
import { PurposeGrid } from '../../components/PurposeGrid';
import { FundingSourceSelect } from '../../components/FundingSourceSelect';
import { DatePickerField } from '../../components/DatePickerField';
import { PersonAvatar, PersonPicker } from '../../components/PersonPicker';
import { FrequencyPicker, scheduleLabel } from '../../components/FrequencyPicker';
import { DraftStatus } from '../../components/DraftStatus';
import { colors, outline } from '../../theme';
import { useCreateWallet, useWallets } from '../../api/hooks';
import {
  formatMoney,
  formatYmd,
  groupAmountInput,
  parseYmd,
  sanitizeAmountInput,
  toYmd,
  ymdMonthsFromNow,
} from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { walletVisual } from '../../lib/walletVisual';
import { walletGuide } from '../../lib/walletGuides';
import type { InvitePermissions, SavingsFrequency, UserSearchResult, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const TOTAL_STEPS = 4;
const PER_MONTH: Record<SavingsFrequency, number> = { daily: 30.44, weekly: 4.345, monthly: 1 };
const DEFAULT_PERMISSIONS: InvitePermissions = { view: true, fund: true, request: true, withdraw: false };

const PERMISSION_ROWS: { key: keyof InvitePermissions; label: string; hint: string }[] = [
  { key: 'view', label: 'See Balance & Activity', hint: 'View the wallet and its history' },
  { key: 'fund', label: 'Add Money', hint: 'Save into this wallet' },
  { key: 'request', label: 'Request Spends', hint: 'Ask you to approve a spend' },
  { key: 'withdraw', label: 'Withdraw', hint: 'Move money out without asking' },
];

interface MilestoneDraft {
  key: string;
  title: string;
  amount: string;
  dueDate: string | null;
}

interface ContributorDraft {
  user: UserSearchResult;
  permissions: InvitePermissions;
  canApprove: boolean;
}

/** Everything the form holds — saved as the draft's data. */
interface SavingsForm {
  name: string;
  purpose: string | null;
  target: string;
  targetDate: string | null;
  description: string;
  milestones: MilestoneDraft[];
  contributors: ContributorDraft[];
  autoSave: boolean;
  amount: string;
  frequency: SavingsFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  allowEdit: boolean;
  deposit: string;
  sourceId: number | null;
}

function emptyForm(): SavingsForm {
  const today = new Date();
  return {
    name: '',
    purpose: null,
    target: '',
    targetDate: null,
    description: '',
    milestones: [],
    contributors: [],
    autoSave: true,
    amount: '',
    frequency: 'monthly',
    dayOfWeek: ((today.getDay() + 6) % 7) + 1,
    dayOfMonth: Math.min(today.getDate(), 28),
    allowEdit: false,
    deposit: '',
    sourceId: null,
  };
}

/** Where the plan lands: on track for the target date, behind it, or just an ETA. */
function projectionFor(f: SavingsForm) {
  const target = Number(f.target);
  const remaining = target - (Number(f.deposit) || 0);
  const savers = 1 + f.contributors.length;
  if (!(target > 0)) return null;
  if (remaining <= 0) return { kind: 'reached' as const };
  const perMonth = (Number(f.amount) || 0) * PER_MONTH[f.frequency] * savers;
  if (!(perMonth > 0)) return null;
  const eta = new Date();
  eta.setDate(eta.getDate() + Math.ceil((remaining / perMonth) * 30.44));
  const targetDate = parseYmd(f.targetDate);
  if (!targetDate) return { kind: 'eta' as const, eta };
  const daysLeft = Math.max(1, (targetDate.getTime() - Date.now()) / 86_400_000);
  const periods = Math.max(1, Math.floor(daysLeft / (30.44 / PER_MONTH[f.frequency])));
  const needed = Math.ceil(remaining / periods / savers);
  return { kind: eta <= targetDate ? ('on_track' as const) : ('behind' as const), eta, needed };
}

/** Even checkpoints at 25 / 50 / 75 %, dated across the run-up to the target date. */
function suggestMilestones(f: SavingsForm): MilestoneDraft[] {
  const target = Number(f.target);
  const end = parseYmd(f.targetDate);
  const now = Date.now();
  return [
    { pct: 0.25, title: 'Quarter Way' },
    { pct: 0.5, title: 'Halfway' },
    { pct: 0.75, title: 'Three Quarters' },
  ].map(({ pct, title }) => ({
    key: `${title}-${pct}`,
    title,
    amount: String(Math.round(target * pct)),
    dueDate: end ? toYmd(new Date(now + (end.getTime() - now) * pct)) : null,
  }));
}

/**
 * Savings goal journey (client sheet "Savings Wallets"): 1 goal + target date →
 * 2 milestones (or skip) → 3 contributors with per-person permissions (or skip)
 * → 4 one savings rule for everyone. Auto-saved as a draft throughout.
 */
export function SavingsGoalSetupScreen(props: RootScreenProps<'SavingsGoalSetup'>) {
  const { draft, loading } = useDraft(props.route.params.draftId);
  if (props.route.params.draftId && loading) {
    return (
      <Screen>
        <Header title="Savings Goal" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </Screen>
    );
  }
  return <SavingsGoalForm {...props} draft={draft} />;
}

function SavingsGoalForm({ navigation, route, draft }: RootScreenProps<'SavingsGoalSetup'> & { draft: WalletDraft | null }) {
  const type = route.params.type;
  const guide = walletGuide(type);
  const visual = walletVisual(type);
  const wallets = useWallets();
  const create = useCreateWallet();
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked);

  const [step, setStep] = useState(Math.min(draft?.step ?? 1, TOTAL_STEPS));
  const [form, setForm] = useState<SavingsForm>(() => ({ ...emptyForm(), ...((draft?.data ?? {}) as Partial<SavingsForm>), name: draft?.name ?? '' }));
  const [newMilestone, setNewMilestone] = useState<{ title: string; amount: string; dueDate: string | null }>({ title: '', amount: '', dueDate: null });
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<SavingsForm>) => setForm((f) => ({ ...f, ...patch }));
  const { name, ...data } = form;
  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type,
    name,
    step,
    totalSteps: TOTAL_STEPS,
    data: data as unknown as Record<string, unknown>,
    enabled: Boolean(name.trim() || form.purpose || form.target),
  });

  // A resumed draft may name a wallet that's since gone — fall back to Main.
  const chosen = sources.some((w) => w.id === form.sourceId) ? form.sourceId : null;
  const sourceId = chosen ?? sources.find((w) => w.type === 'main')?.id ?? sources[0]?.id ?? null;
  const source = sources.find((w) => w.id === sourceId);
  const tomorrow = toYmd(new Date(Date.now() + 86_400_000));
  const projection = projectionFor(form);

  const STEPS = {
    1: { title: type === 'goal' ? 'Name Your Goal' : 'Set Your Savings Goal', subtitle: 'What you are saving for, how much you need and when you want it by.' },
    2: { title: 'Add Milestones', subtitle: 'Break your goal into checkpoints and celebrate each one you reach. You can skip this.' },
    3: { title: 'Save Together', subtitle: 'Invite people to save with you and choose what each person can do. You can skip this and save alone.' },
    4: { title: 'Savings Rules', subtitle: 'One rule for everyone: how much each person saves and how often.' },
  } as const;

  const validate = (s: number): string | null => {
    if (s === 1) {
      if (!form.name.trim()) return 'Give your goal a name.';
      if (!form.purpose) return 'Choose what you are saving for.';
      if (!(Number(form.target) > 0)) return 'Enter your target amount.';
    }
    if (s === 4) {
      if (!(Number(form.amount) > 0)) return 'Enter how much each person saves.';
      if ((form.autoSave || Number(form.deposit) > 0) && !sourceId) return 'Choose the wallet your savings come from.';
      if (Number(form.deposit) > 0 && source && Number(form.deposit) > parseFloat(source.balance)) {
        return `${source.name} only has ${formatMoney(source.balance)} — lower the first deposit.`;
      }
    }
    return null;
  };

  const next = () => {
    const err = validate(step);
    setError(err);
    if (err) return;
    selection();
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const back = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
    else leave();
  };

  const leave = () =>
    confirmLeaveSetup(
      Boolean(autosave.draftId),
      () => navigation.goBack(),
      () => void autosave.discard().then(() => navigation.goBack()),
    );

  const addMilestone = () => {
    setError(null);
    const amount = Number(newMilestone.amount);
    if (!newMilestone.title.trim() || !(amount > 0)) {
      setError('Give the milestone a name and an amount.');
      return;
    }
    if (amount > Number(form.target)) {
      setError("A milestone can't be more than your target.");
      return;
    }
    set({ milestones: [...form.milestones, { key: `${Date.now()}`, title: newMilestone.title.trim(), amount: newMilestone.amount, dueDate: newMilestone.dueDate }] });
    setNewMilestone({ title: '', amount: '', dueDate: null });
  };

  const submit = () => {
    for (const s of [1, 4]) {
      const err = validate(s);
      if (err) {
        setStep(s);
        setError(err);
        return;
      }
    }
    setError(null);
    const needsSource = form.autoSave || Number(form.deposit) > 0;
    create.mutate(
      {
        type,
        name: form.name.trim(),
        purpose: form.purpose ?? undefined,
        description: form.description.trim() || undefined,
        target_amount: form.target,
        target_date: form.targetDate ?? undefined,
        milestones: form.milestones.map((m) => ({ title: m.title, amount: m.amount, due_date: m.dueDate ?? undefined })),
        contributors: form.contributors.map((c) => ({ user_id: c.user.id, can_approve: c.canApprove, permissions: c.permissions })),
        savings_plan: {
          amount: form.amount,
          frequency: form.frequency,
          day_of_week: form.frequency === 'weekly' ? form.dayOfWeek : undefined,
          day_of_month: form.frequency === 'monthly' ? form.dayOfMonth : undefined,
          auto_save: form.autoSave,
          allow_contributor_edit: form.allowEdit,
        },
        source_wallet_id: needsSource && sourceId ? sourceId : undefined,
        initial_deposit: Number(form.deposit) > 0 ? form.deposit : undefined,
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          autosave.stop();
          notifySuccess();
          navigation.popToTop();
          navigation.navigate('WalletDetail', { walletId: res.wallet.id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  // ---------------------------------------------------------------- steps

  const goalStep = (
    <View className="mt-6 rounded bg-white p-5" style={outline.card}>
      <Input label="Wallet Name" value={form.name} onChangeText={(v) => set({ name: v })} placeholder={guide.namePlaceholder} maxLength={100} />

      <Text className="mb-3 mt-6 text-[13px] font-semibold text-muted">What Are You Saving For?</Text>
      <PurposeGrid purposes={guide.purposes} value={form.purpose} onChange={(p) => set({ purpose: p })} />

      <Input
        label="Target Amount"
        prefix="₦"
        value={groupAmountInput(form.target)}
        onChangeText={(t) => set({ target: sanitizeAmountInput(t) })}
        placeholder="0.00"
        keyboardType="decimal-pad"
        containerClassName="mt-6"
      />

      <Text className="mb-2 mt-6 text-[13px] font-semibold text-muted">Target Date</Text>
      <View className="mb-3 flex-row" style={{ gap: 8 }}>
        {[
          { label: '3 Months', months: 3 },
          { label: '6 Months', months: 6 },
          { label: '1 Year', months: 12 },
        ].map((o) => {
          const ymd = ymdMonthsFromNow(o.months);
          const active = form.targetDate === ymd;
          return (
            <Pressable
              key={o.label}
              onPress={() => {
                selection();
                set({ targetDate: ymd });
              }}
              className={`rounded px-3.5 py-2 ${active ? 'bg-navy' : 'bg-lav'}`}
            >
              <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <DatePickerField value={form.targetDate} onChange={(d) => set({ targetDate: d })} minDate={tomorrow} placeholder="Pick a date (optional)" clearable />
      <Text className="ml-1 mt-1.5 text-[12px] text-muted">We'll tell you if your savings are on pace to get there.</Text>

      <Input
        label="Description (Optional)"
        value={form.description}
        onChangeText={(v) => set({ description: v })}
        placeholder="A note for you and anyone saving with you"
        maxLength={200}
        containerClassName="mt-6"
      />
    </View>
  );

  const milestoneStep = (
    <View className="mt-6">
      {form.milestones.length === 0 && Number(form.target) > 0 ? (
        <Pressable
          onPress={() => {
            selection();
            set({ milestones: suggestMilestones(form) });
          }}
          className="mb-4 flex-row items-center rounded bg-success-soft p-4 active:opacity-90"
        >
          <Ionicons name="sparkles" size={18} color={colors.brand} style={{ marginRight: 10 }} />
          <View className="flex-1">
            <Text className="text-[14px] font-bold text-brand-deep">Suggest Milestones for Me</Text>
            <Text className="text-[12px] text-brand-deep">25%, 50% and 75% of {formatMoney(form.target)}{form.targetDate ? ', spread up to your target date' : ''}</Text>
          </View>
        </Pressable>
      ) : null}

      {form.milestones.map((m, i) => (
        <View key={m.key} className="mb-3 flex-row items-center rounded bg-white p-4" style={outline.card}>
          <View className="mr-3 h-9 w-9 items-center justify-center rounded bg-lav">
            <Text className="text-[13px] font-bold text-navy">{i + 1}</Text>
          </View>
          <View className="flex-1 pr-2">
            <Text className="text-[15px] font-bold text-ink">{m.title}</Text>
            <Text className="text-[12px] text-muted">
              {formatMoney(m.amount)}
              {m.dueDate ? ` · by ${formatYmd(m.dueDate)}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              selection();
              set({ milestones: form.milestones.filter((x) => x.key !== m.key) });
            }}
            hitSlop={8}
            accessibilityLabel={`Remove ${m.title}`}
          >
            <Ionicons name="trash" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ))}

      <View className="rounded bg-page-top p-4">
        <Text className="text-[15px] font-bold text-ink">Add a Milestone</Text>
        <Input
          label="Name"
          value={newMilestone.title}
          onChangeText={(v) => setNewMilestone((m) => ({ ...m, title: v }))}
          placeholder="e.g. Deposit for the car"
          maxLength={100}
          containerClassName="mt-3"
        />
        <Input
          label="Amount Saved by Then"
          prefix="₦"
          value={groupAmountInput(newMilestone.amount)}
          onChangeText={(t) => setNewMilestone((m) => ({ ...m, amount: sanitizeAmountInput(t) }))}
          placeholder="0.00"
          keyboardType="decimal-pad"
          containerClassName="mt-4"
        />
        <DatePickerField
          label="By When (Optional)"
          value={newMilestone.dueDate}
          onChange={(d) => setNewMilestone((m) => ({ ...m, dueDate: d }))}
          minDate={tomorrow}
          clearable
          className="mt-4"
        />
        <Button title="Add Milestone" icon="add" iconPosition="left" variant="secondary" onPress={addMilestone} className="mt-4" />
      </View>
    </View>
  );

  const contributorStep = (
    <View className="mt-6">
      <PersonPicker
        label="Invite Someone"
        value={null}
        onChange={(u) => {
          if (u) set({ contributors: [...form.contributors, { user: u, permissions: { ...DEFAULT_PERMISSIONS }, canApprove: false }] });
        }}
        excludeIds={form.contributors.map((c) => c.user.id)}
      />

      {form.contributors.map((c, i) => {
        const update = (patch: Partial<ContributorDraft>) =>
          set({ contributors: form.contributors.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
        return (
          <View key={c.user.id} className="mt-4 rounded bg-white p-4" style={outline.card}>
            <View className="flex-row items-center">
              <PersonAvatar name={c.user.full_name} avatarUrl={c.user.avatar_url} />
              <View className="ml-3 flex-1 pr-2">
                <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                  {c.user.full_name}
                </Text>
                {c.user.username ? <Text className="text-[12px] text-muted">@{c.user.username}</Text> : null}
              </View>
              <Pressable
                onPress={() => {
                  selection();
                  set({ contributors: form.contributors.filter((x) => x.user.id !== c.user.id) });
                }}
                hitSlop={8}
                accessibilityLabel={`Remove ${c.user.full_name}`}
              >
                <Ionicons name="trash" size={18} color={colors.muted} />
              </Pressable>
            </View>
            <Text className="mb-1 mt-4 text-[13px] font-semibold text-muted">What They Can Do</Text>
            {PERMISSION_ROWS.map((p) => (
              <View key={p.key} className="flex-row items-center border-t border-border py-2.5">
                <View className="flex-1 pr-2">
                  <Text className="text-[14px] font-semibold text-ink">{p.label}</Text>
                  <Text className="text-[12px] text-muted">{p.hint}</Text>
                </View>
                <Switch
                  value={c.permissions[p.key]}
                  onValueChange={(v) => update({ permissions: { ...c.permissions, [p.key]: v } })}
                  trackColor={{ false: colors.lav, true: colors.brand }}
                  thumbColor={colors.white}
                />
              </View>
            ))}
            <View className="flex-row items-center border-t border-border py-2.5">
              <View className="flex-1 pr-2">
                <Text className="text-[14px] font-semibold text-ink">Approve Spends</Text>
                <Text className="text-[12px] text-muted">Help approve spends from this wallet</Text>
              </View>
              <Switch
                value={c.canApprove}
                onValueChange={(v) => update({ canApprove: v })}
                trackColor={{ false: colors.lav, true: colors.brand }}
                thumbColor={colors.white}
              />
            </View>
          </View>
        );
      })}

      <View className="mt-4 flex-row items-start rounded bg-success-soft p-4">
        <Ionicons name="information-circle" size={17} color={colors.brand} style={{ marginRight: 10, marginTop: 1 }} />
        <Text className="flex-1 text-[12px] leading-5 text-brand-deep">
          They'll get an invitation. When they accept, they choose which of their wallets their savings come from.
        </Text>
      </View>
    </View>
  );

  const ruleStep = (
    <View className="mt-6">
      <View className="rounded bg-white p-5" style={outline.card}>
        <Input
          label="Each Person Saves"
          prefix="₦"
          value={groupAmountInput(form.amount)}
          onChangeText={(t) => set({ amount: sanitizeAmountInput(t) })}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        {projection?.kind === 'behind' ? (
          <Pressable
            onPress={() => {
              selection();
              set({ amount: String(projection.needed) });
            }}
            className="mt-2 self-start rounded bg-lav px-3 py-1.5"
          >
            <Text className="text-[12px] font-bold text-navy">Use {formatMoney(projection.needed)} to finish on time</Text>
          </Pressable>
        ) : null}

        <Text className="mb-2 mt-6 text-[13px] font-semibold text-muted">How Often (Applies to Everyone)</Text>
        <FrequencyPicker
          frequency={form.frequency}
          dayOfWeek={form.dayOfWeek}
          dayOfMonth={form.dayOfMonth}
          onChange={(v) => set(v)}
        />
      </View>

      <View className="mt-4 rounded bg-lav-faint p-4">
        <View className="flex-row items-center">
          <Ionicons name="flash" size={18} color={colors.brand} style={{ marginRight: 10 }} />
          <View className="flex-1 pr-2">
            <Text className="text-[15px] font-bold text-ink">Auto-Save</Text>
            <Text className="text-[12px] text-muted">Move each person's savings automatically on schedule.</Text>
          </View>
          <Switch value={form.autoSave} onValueChange={(v) => set({ autoSave: v })} trackColor={{ false: colors.lav, true: colors.brand }} thumbColor={colors.white} />
        </View>
        {!form.autoSave ? (
          <Text className="mt-3 text-[12px] leading-5 text-muted">Everyone adds money themselves. You can switch auto-save on later.</Text>
        ) : null}
      </View>

      <View className="mt-4 rounded bg-white p-5" style={outline.card}>
        <FundingSourceSelect label="Your Savings Come From" wallets={sources} value={sourceId} onChange={(id) => set({ sourceId: id })} />
        <Input
          label="First Deposit (Optional)"
          prefix="₦"
          value={groupAmountInput(form.deposit)}
          onChangeText={(t) => set({ deposit: sanitizeAmountInput(t) })}
          placeholder="0.00"
          keyboardType="decimal-pad"
          containerClassName="mt-5"
        />
        {form.contributors.length > 0 ? (
          <View className="mt-5 flex-row items-center">
            <View className="flex-1 pr-2">
              <Text className="text-[14px] font-semibold text-ink">Let Contributors Adjust</Text>
              <Text className="text-[12px] text-muted">They can change their own amount and how often they save.</Text>
            </View>
            <Switch value={form.allowEdit} onValueChange={(v) => set({ allowEdit: v })} trackColor={{ false: colors.lav, true: colors.brand }} thumbColor={colors.white} />
          </View>
        ) : null}
      </View>

      {projection ? (
        <View className={`mt-4 flex-row items-start rounded p-4 ${projection.kind === 'behind' ? 'bg-danger-soft' : 'bg-success-soft'}`}>
          <Ionicons
            name={projection.kind === 'behind' ? 'alert-circle' : 'trending-up'}
            size={18}
            color={projection.kind === 'behind' ? colors.danger : colors.brand}
            style={{ marginRight: 10, marginTop: 1 }}
          />
          <Text className={`flex-1 text-[13px] leading-5 ${projection.kind === 'behind' ? 'text-danger' : 'text-brand-deep'}`}>
            {projection.kind === 'reached'
              ? 'Your first deposit already covers the target.'
              : projection.kind === 'eta'
                ? `With ${1 + form.contributors.length} saver${form.contributors.length ? 's' : ''} at ${formatMoney(form.amount)} ${scheduleLabel(form.frequency, form.dayOfWeek, form.dayOfMonth)}, you'll reach ${formatMoney(form.target)} around ${formatYmd(toYmd(projection.eta))}.`
                : projection.kind === 'on_track'
                  ? `On track: you'll reach ${formatMoney(form.target)} around ${formatYmd(toYmd(projection.eta))}, before ${formatYmd(form.targetDate)}.`
                  : `At this pace you'll reach ${formatMoney(form.target)} around ${formatYmd(toYmd(projection.eta))} — after ${formatYmd(form.targetDate)}. Each person would need about ${formatMoney(projection.needed)} ${scheduleLabel(form.frequency, form.dayOfWeek, form.dayOfMonth)} to finish on time.`}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const isLast = step === TOTAL_STEPS;
  const skippable = (step === 2 && form.milestones.length === 0) || (step === 3 && form.contributors.length === 0);

  return (
    <Screen withBottomInset>
      <Header title={`New ${guide.title}`} />
      <KeyboardAwareScrollView
        key={step}
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <GuidedIntro step={`Step ${step} of ${TOTAL_STEPS}`} icon={visual.icon} title={STEPS[step as 1 | 2 | 3 | 4].title} subtitle={STEPS[step as 1 | 2 | 3 | 4].subtitle} />
        <DraftStatus status={autosave.status} className="mt-2" />

        {/* Progress dots */}
        <View className="mt-4 flex-row justify-center" style={{ gap: 6 }}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View key={i} className={`h-1.5 rounded-full ${i + 1 <= step ? 'bg-navy' : 'bg-lav'}`} style={{ width: i + 1 === step ? 28 : 12 }} />
          ))}
        </View>

        {step === 1 ? goalStep : step === 2 ? milestoneStep : step === 3 ? contributorStep : ruleStep}

        <ErrorText message={error} className="mt-4" />

        {isLast ? (
          <Button title={`Create ${guide.title}`} icon="checkmark" onPress={submit} loading={create.isPending} className="mt-6" />
        ) : (
          <Button
            title={skippable ? (step === 2 ? 'Skip Milestones' : 'Save Alone') : 'Next'}
            icon="arrow-forward"
            variant={skippable ? 'secondary' : 'primary'}
            onPress={next}
            className="mt-6"
          />
        )}
        <Button
          title={step > 1 ? 'Back' : 'Cancel Setup'}
          icon={step > 1 ? 'arrow-back' : undefined}
          iconPosition="left"
          variant="secondary"
          onPress={back}
          className="mt-3"
        />
        {step > 1 ? (
          <Pressable onPress={leave} className="mt-4 items-center py-2">
            <Text className="text-[13px] font-semibold text-muted">Finish Later</Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
