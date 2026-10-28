import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtChip } from '../../components/pt/PtChip';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtAddRow, PtNewPersonForm } from '../../components/pt/PtPeople';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtNote, PtPanel, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { useCreateWallet, useFamily, useSavingsInsights, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatMoney, formatNaira, formatNairaK, groupAmountInput, initials, sanitizeAmountInput } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { joinNames, ordinal } from '../../lib/goalPlan';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { BudgetFunding, BudgetPeriod, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'for' | 'amount' | 'categories' | 'funding' | 'spenders' | 'alerts' | 'review';
const STEPS: Step[] = ['for', 'amount', 'categories', 'funding', 'spenders', 'alerts', 'review'];

type Kind = 'household' | 'children' | 'event' | 'trip';
type Role = 'co_owner' | 'contributor' | 'viewer';

/** SPD-01 "What are you budgeting for?" and the categories each usually splits into (share of the budget). */
const KINDS: { value: Kind; title: string; line: string; icon: React.ComponentProps<typeof Feather>['name']; name: string; categories: [string, number][] }[] = [
  {
    value: 'household',
    title: 'Household',
    line: 'Food, fuel, bills',
    icon: 'home',
    name: 'Household',
    categories: [
      // ₦150k · ₦70k · ₦40k · ₦45k · ₦45k of ₦350,000, as in the prototype.
      ['Food and market', 0.4286],
      ['Fuel and transport', 0.2],
      ['Electricity and water', 0.1143],
      ['School runs and lunch', 0.1286],
      ['Other', 0.1286],
    ],
  },
  {
    value: 'children',
    title: 'Children',
    line: 'Lunch, school runs',
    icon: 'smile',
    name: 'Children',
    categories: [
      ['Lunch and snacks', 0.4],
      ['School runs', 0.3],
      ['Books and supplies', 0.2],
      ['Other', 0.1],
    ],
  },
  {
    value: 'event',
    title: 'An event',
    line: 'Burial, wedding, naming',
    icon: 'calendar',
    name: 'Our event',
    categories: [
      ['Venue', 0.3],
      ['Food and drinks', 0.35],
      ['Aso ebi and clothes', 0.15],
      ['Souvenirs', 0.1],
      ['Other', 0.1],
    ],
  },
  {
    value: 'trip',
    title: 'A trip',
    line: 'Transport, hotel, food',
    icon: 'navigation',
    name: 'Our trip',
    categories: [
      ['Transport', 0.4],
      ['Hotel', 0.35],
      ['Food', 0.15],
      ['Other', 0.1],
    ],
  },
];

/** SPD-03 bar colours, in category order. */
const CATEGORY_COLOURS = [pt.emerald700, '#1FA67A', pt.gold500, '#5FD3A5', '#7C8F87', '#2F6FB0', '#B3311A', '#7A4FB5'];

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Category {
  key: string;
  name: string;
  limit: string;
}

/** Someone in the budget: a family member (account) or a phone number. */
interface Person {
  key: string;
  userId?: number;
  phone?: string;
  /** First name, as it shows in lists ("Emeka"). */
  name: string;
  /** Full name, for initials ("EO"). */
  full?: string;
  role: Role;
  /** Category names they may spend on; null = all. */
  categories: string[] | null;
  /** Naira a day; '' = no daily limit. */
  dailyLimit: string;
  /** Split funding: their share, percent; null = not paying in. */
  share: number | null;
}

interface SpendingForm {
  kind: Kind;
  amount: string;
  period: BudgetPeriod;
  monthDay: number;
  weekDay: number;
  leftover: 'keep' | 'main' | 'wallet';
  leftoverWalletId: number | null;
  categories: Category[];
  funding: BudgetFunding;
  myShare: number;
  fillNow: boolean;
  people: Person[];
  alerts: { half: boolean; eighty: boolean; category_out: boolean; weekly: boolean };
  overLimit: 'approve' | 'stop';
}

const EMPTY: SpendingForm = {
  kind: 'household',
  amount: '',
  period: 'monthly',
  monthDay: 25,
  weekDay: 1,
  leftover: 'keep',
  leftoverWalletId: null,
  categories: [],
  funding: 'topup',
  myShare: 100,
  fillNow: false,
  people: [],
  alerts: { half: true, eighty: true, category_out: true, weekly: false },
  overLimit: 'approve',
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** A split of the budget into the kind's usual categories, rounded to ₦5,000. */
function suggestCategories(kind: Kind, amount: number): Category[] {
  const shares = KINDS.find((k) => k.value === kind)?.categories ?? [];
  const step = amount >= 100_000 ? 5_000 : amount >= 10_000 ? 1_000 : 100;
  const rows = shares.map(([name, share], i) => ({ key: `c${i}`, name, limit: amount > 0 ? String(Math.floor((amount * share) / step) * step) : '' }));
  const used = rows.slice(0, -1).reduce((sum, r) => sum + (Number(r.limit) || 0), 0);
  if (rows.length && amount > 0) rows[rows.length - 1].limit = String(Math.max(0, amount - used));
  return rows;
}

/** "25 Nov" — the next time the period starts. */
function nextStart(f: SpendingForm): string {
  const d = new Date();
  if (f.period === 'weekly') {
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() + ((f.weekDay - iso + 7) % 7 || 7));
    return `${DAYS[f.weekDay]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  if (d.getDate() >= f.monthDay) d.setMonth(d.getMonth() + 1);
  return `${f.monthDay} ${MONTHS[d.getMonth()]}`;
}

/**
 * Spending wallet from the client prototype: SPD-01 what it's for → SPD-02 how
 * much each month (or week, or one event), when it starts, where leftovers go →
 * SPD-03 categories with limits → SPD-04 who fills it → SPD-05 who can spend
 * what → SPD-06 alerts and what happens over a limit → WCR-06 review → WCR-07.
 * Auto-saved as a draft.
 */
export function SpendingWalletSetupScreen(props: RootScreenProps<'SpendingWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <SpendingSetup {...props} draft={draft} />;
}

function SpendingSetup({ navigation, draft }: RootScreenProps<'SpendingWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const insights = useSavingsInsights();
  const create = useCreateWallet();

  const [name, setName] = useState(draft?.name ?? 'Household');
  const [form, setForm] = useState<SpendingForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<SpendingForm>) }));
  const set = (patch: Partial<SpendingForm>) => setForm((f) => ({ ...f, ...patch }));
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'day' | 'leftover' | 'add' | { share: string } | { remove: string }>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'spending',
    name,
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(form.amount || flow.index > 0),
  });

  const back = () => {
    setError(null);
    flow.back(() =>
      confirmLeaveSetup(
        Boolean(autosave.draftId),
        () => flow.leave(() => navigation.goBack()),
        () => void autosave.discard().then(() => flow.leave(() => navigation.goBack())),
      ),
    );
  };

  const members = (family.data?.members ?? []).filter((m) => m.role !== 'vendor');
  const ownWallets = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked);
  const main = ownWallets.find((w) => w.type === 'main');
  const savingsWallets = ownWallets.filter((w) => w.type === 'savings' || w.type === 'goal');
  const leftoverWallet = savingsWallets.find((w) => w.id === form.leftoverWalletId) ?? null;
  const myName = firstName(me?.full_name ?? 'You');
  const amount = Number(form.amount) || 0;
  const planned = form.categories.reduce((sum, c) => sum + (Number(c.limit) || 0), 0);
  const monthly = form.period === 'monthly';
  const weekly = form.period === 'weekly';
  const startLabel = monthly ? `the ${ordinal(form.monthDay)}` : weekly ? `${DAYS[form.weekDay]}s` : null;
  const per = monthly ? 'month' : weekly ? 'week' : null;
  const payers = form.people.filter((p) => p.share !== null);
  const owners = [myName, ...form.people.filter((p) => p.role === 'co_owner').map((p) => p.name)];
  const spentBefore = parseFloat(insights.data?.monthly_spending ?? '0');

  const updatePerson = (key: string, patch: Partial<Person>) => set({ people: form.people.map((p) => (p.key === key ? { ...p, ...patch } : p)) });
  const editingPerson = form.people.find((p) => p.key === editing) ?? null;

  const addFamily = (id: number, asPayer = false) => {
    const m = members.find((x) => x.id === id);
    if (!m || form.people.some((p) => p.userId === id)) return;
    const role: Role = ['owner', 'co_owner', 'admin'].includes(m.role) ? 'co_owner' : 'contributor';
    set({ people: [...form.people, { key: `u${id}`, userId: id, name: firstName(m.name), full: m.name, role, categories: null, dailyLimit: '', share: asPayer ? 0 : null }] });
  };

  /** SPD-04: even shares when someone joins or leaves the split. */
  const evenSplit = (people: Person[]): Pick<SpendingForm, 'people' | 'myShare'> => {
    const count = people.filter((p) => p.share !== null).length + 1;
    const each = Math.floor(100 / count / 5) * 5;
    return { myShare: 100 - each * (count - 1), people: people.map((p) => (p.share !== null ? { ...p, share: each } : p)) };
  };

  const validate = (s: Step): string | null => {
    if (s === 'for' && !name.trim()) return 'Give the wallet a name.';
    if (s === 'amount' && !(amount > 0)) return 'Enter how much the budget is.';
    if (s === 'categories') {
      if (form.categories.length === 0) return 'Add at least one category.';
      if (form.categories.some((c) => !c.name.trim() || !(Number(c.limit) > 0))) return 'Give each category a limit.';
      if (planned > amount) return `The categories add up to ${formatNaira(planned)}, more than ${formatNaira(amount)}.`;
    }
    if (s === 'funding') {
      if (form.funding !== 'manual' && !main) return 'You need a Main wallet to fill it from.';
      if (form.funding === 'split') {
        if (payers.length === 0) return 'Add someone to split it with.';
        if (form.myShare + payers.reduce((sum, p) => sum + (p.share ?? 0), 0) !== 100) return 'The shares must add up to 100%.';
      }
      if (form.fillNow && main && amount > parseFloat(main.balance)) return `${main.name} only has ${formatMoney(main.balance)}.`;
    }
    if (s === 'spenders') {
      const bad = form.people.find((p) => p.role === 'contributor' && p.categories !== null && p.categories.length === 0);
      if (bad) return `Pick what ${bad.name} can spend on.`;
    }
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    if (step === 'amount' && (form.categories.length === 0 || planned === 0)) {
      set({ categories: suggestCategories(form.kind, amount) });
    }
    flow.next();
  };

  const submit = () => {
    for (const s of ['for', 'amount', 'categories', 'funding', 'spenders'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    setError(null);
    autosave.stop();
    const share = (pct: number | null) => (pct ? String(Math.round((amount * pct) / 100)) : undefined);
    const split = form.funding === 'split' && form.period !== 'one_off';
    create.mutate(
      {
        type: 'spending',
        name: name.trim(),
        purpose: form.kind,
        mode: form.people.length ? 'shared' : 'private',
        source_wallet_id: (form.funding !== 'manual' || form.fillNow) && main ? main.id : undefined,
        initial_deposit: form.fillNow ? form.amount : undefined,
        budget: {
          amount: form.amount,
          period: form.period,
          start_day: weekly ? form.weekDay : form.monthDay,
          leftover: { mode: form.leftover, wallet_id: form.leftover === 'wallet' ? form.leftoverWalletId : null },
          funding: form.period === 'one_off' && form.funding !== 'manual' ? 'manual' : form.funding,
          my_share: split ? share(form.myShare) : undefined,
          alerts: form.alerts,
          over_limit: form.overLimit,
          categories: form.categories.map((c) => ({ name: c.name.trim(), limit: c.limit })),
        },
        members: form.people.map((p) => ({
          ...(p.userId ? { user_id: p.userId } : { identifier: p.phone }),
          role: p.role,
          pledge: split ? share(p.share) : undefined,
          spend: p.role === 'viewer' ? undefined : { categories: p.categories, daily_limit: Number(p.dailyLimit) > 0 ? p.dailyLimit : null },
        })),
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const asked = split ? payers.map((p) => `${p.name} has been asked to confirm their ${p.share}%.`).join(' ') : '';
          const firstTopUp =
            form.period === 'one_off' || form.funding === 'manual'
              ? form.fillNow
                ? `${formatNaira(amount)} moved from ${main?.name ?? 'Main'}.`
                : 'Add money whenever you are ready.'
              : `The first ${form.funding === 'split' ? 'payments are' : 'top-up is'} on ${nextStart(form)}.`;
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: `${name.trim()} is ready`,
              subtitle: [firstTopUp, asked].filter(Boolean).join(' '),
              caption: '',
              events: [],
              budget: form.categories.map((c) => ({ name: c.name.trim(), limit: c.limit })),
              openLabel: 'Open wallet',
            });
          });
        },
        onError: (e) => {
          autosave.resume();
          setError(e.message);
        },
      },
    );
  };

  const header = { title: 'Spending wallet', step: flow.index + 1, total: STEPS.length };
  const footer = (title: string, onPress = next, loading = false) => (
    <>
      {error ? (
        <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
          {error}
        </PtText>
      ) : null}
      <PtButton title={title} onPress={onPress} loading={loading} />
    </>
  );

  // ------------------------------------------------------------ SPD-01
  if (step === 'for') {
    return (
      <PtStepScreen onBack={back} flow={header} title="What are you budgeting for?" subtitle="A spending wallet holds money that is meant to go out." gap={18} footer={footer('Continue')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {KINDS.map((k) => {
            const on = form.kind === k.value;
            return (
              <Pressable
                key={k.value}
                onPress={() => {
                  selection();
                  const renamed = KINDS.some((x) => x.name === name.trim()) || !name.trim();
                  if (renamed) setName(k.name);
                  set({ kind: k.value, categories: [] });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${k.title}. ${k.line}`}
                style={{
                  width: '48%',
                  flexGrow: 1,
                  minHeight: 112,
                  borderRadius: ptRadius.md,
                  borderWidth: 2,
                  borderColor: on ? pt.brand : 'transparent',
                  backgroundColor: on ? pt.brandSoft : pt.raised,
                  padding: 14,
                  gap: 8,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: on ? pt.brand : pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={k.icon} size={17} color={on ? '#FFFFFF' : pt.brand} />
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: on ? pt.brand : pt.ink }}>{k.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{k.line}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <PtField
          label="Wallet name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="Household"
          maxLength={100}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SPD-02
  if (step === 'amount') {
    const leftoverText =
      form.leftover === 'wallet' && leftoverWallet ? `Move to ${leftoverWallet.name}` : form.leftover === 'main' ? 'Send back to Main' : `Keep it in ${name.trim() || 'the wallet'}`;
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title={per ? `How much each ${per}?` : 'How much in total?'}
        gap={18}
        footer={footer('Continue')}
      >
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 44, color: pt.ink }}>₦</Text>
            <TextInput
              value={groupAmountInput(form.amount)}
              onChangeText={(t) => {
                set({ amount: sanitizeAmountInput(t), categories: [] });
                setError(null);
              }}
              placeholder="0"
              placeholderTextColor={pt.inkSubtle}
              keyboardType="decimal-pad"
              accessibilityLabel="Budget amount"
              style={{ minWidth: 60, fontFamily: ptFont.extrabold, fontSize: 44, letterSpacing: -1, color: pt.ink, paddingVertical: 0, textAlign: 'center' }}
            />
          </View>
          {spentBefore > 0 && form.kind === 'household' ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center' }}>
              Last 3 months you spent about {formatNaira(Math.round(spentBefore / 1000) * 1000)} a month
            </Text>
          ) : null}
        </View>

        <PtSegmented
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'one_off', label: 'One-off' },
          ]}
          value={form.period}
          onChange={(v) => set({ period: v as BudgetPeriod })}
        />

        {form.period !== 'one_off' ? (
          <PtPanel>
            <PtReviewRow
              label={monthly ? 'New month starts on' : 'New week starts on'}
              value={monthly ? `The ${ordinal(form.monthDay)}` : DAYS[form.weekDay]}
              sub={monthly && form.monthDay === (insights.data?.salary?.day ?? 25) ? 'Lines up with salary day' : null}
              onEdit={() => setSheet('day')}
            />
            <PtReviewRow
              label={`Leftover at ${per} end`}
              value={leftoverText}
              sub={form.leftover === 'wallet' ? 'Or keep it, or send back to Main' : null}
              onEdit={() => setSheet('leftover')}
              last
            />
          </PtPanel>
        ) : null}
        <PtNote>
          {form.period === 'one_off'
            ? "A one-off budget doesn't reset. What's left stays in the wallet."
            : `Spending wallets reset every ${per}. Unspent money never disappears.`}
        </PtNote>

        <PtOptionSheet
          visible={sheet === 'day'}
          title={monthly ? 'New month starts on' : 'New week starts on'}
          options={monthly ? Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `The ${ordinal(i + 1)}` })) : DAYS.slice(1).map((d, i) => ({ value: i + 1, label: d }))}
          value={monthly ? form.monthDay : form.weekDay}
          onPick={(d) => {
            set(monthly ? { monthDay: d } : { weekDay: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'leftover'}
          title={`Leftover at ${per ?? 'period'} end`}
          options={[
            { value: 'keep', label: `Keep it in ${name.trim() || 'the wallet'}`, hint: 'Next budget starts with it' },
            { value: 'main', label: 'Send back to Main', hint: 'It goes back where it came from' },
            ...savingsWallets.map((w) => ({ value: `w${w.id}`, label: `Move to ${w.name}`, hint: 'Saves what you didn’t spend' })),
          ]}
          value={form.leftover === 'wallet' ? `w${form.leftoverWalletId}` : form.leftover}
          onPick={(v) => {
            if (v.startsWith('w')) set({ leftover: 'wallet', leftoverWalletId: Number(v.slice(1)) });
            else set({ leftover: v as 'keep' | 'main', leftoverWalletId: null });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SPD-03
  if (step === 'categories') {
    const removing = sheet && typeof sheet === 'object' && 'remove' in sheet ? form.categories.find((c) => c.key === sheet.remove) : null;
    return (
      <PtStepScreen onBack={back} flow={header} title="Split it into categories" subtitle="Each category gets its own limit." gap={16} footer={footer('Continue')}>
        <View style={{ gap: 8 }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: pt.line, flexDirection: 'row', overflow: 'hidden', gap: 2 }}>
            {form.categories.map((c, i) => (
              <View key={c.key} style={{ flex: Math.max(0, Number(c.limit) || 0), backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }} />
            ))}
            {amount > planned ? <View style={{ flex: amount - planned }} /> : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
              {planned === amount ? 'All set' : planned < amount ? `${formatNaira(amount - planned)} left to plan` : `${formatNaira(planned - amount)} too much`}
            </Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: planned > amount ? pt.danger : pt.ink }}>
              {formatNaira(planned)} of {formatNaira(amount)}
            </Text>
          </View>
        </View>

        <PtPanel>
          {form.categories.map((c, i) => (
            <React.Fragment key={c.key}>
              {i > 0 ? <PtDivider /> : null}
              <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Pressable
                  onPress={() => setSheet({ remove: c.key })}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name} options`}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] }} />
                  <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }} numberOfLines={1}>
                    {c.name}
                  </Text>
                </Pressable>
                <PtAmountBox
                  value={c.limit}
                  onChange={(v) => set({ categories: form.categories.map((x) => (x.key === c.key ? { ...x, limit: v } : x)) })}
                  label={`Limit for ${c.name}`}
                />
              </View>
            </React.Fragment>
          ))}
        </PtPanel>

        {newCategory !== null ? (
          <PtPanel>
            <View style={{ gap: 12, paddingVertical: 14 }}>
              <PtField label="Category name" value={newCategory} onChangeText={setNewCategory} placeholder="Church and giving" maxLength={60} autoFocus />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PtButton title="Cancel" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setNewCategory(null)} />
                <PtButton
                  title="Add"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => {
                    const n = newCategory.trim();
                    if (!n) return;
                    if (form.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
                      setError(`${n} is already a category.`);
                      return;
                    }
                    set({ categories: [...form.categories, { key: `c${Date.now()}`, name: n, limit: amount > planned ? String(amount - planned) : '' }] });
                    setNewCategory(null);
                    setError(null);
                  }}
                />
              </View>
            </View>
          </PtPanel>
        ) : (
          <PtAddRow label="Add a category" onPress={() => setNewCategory('')} />
        )}

        <PtOptionSheet
          visible={Boolean(removing)}
          title={removing?.name ?? ''}
          options={[{ value: 'remove', label: 'Remove this category', hint: 'Its limit goes back to the budget' }]}
          value={null}
          onPick={() => {
            set({ categories: form.categories.filter((c) => c.key !== removing?.key) });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SPD-04
  if (step === 'funding') {
    const day = monthly ? `the ${ordinal(form.monthDay)}` : DAYS[form.weekDay];
    const notIn = members.filter((m) => !form.people.some((p) => p.userId === m.id && p.share !== null));
    const shareSheet = sheet && typeof sheet === 'object' && 'share' in sheet ? sheet.share : null;
    return (
      <PtStepScreen onBack={back} flow={header} title="Where does the money come from?" gap={14} footer={footer('Continue')}>
        {form.period === 'one_off' ? (
          <PtNote>A one-off budget is filled once. Add the money now, or whenever you are ready.</PtNote>
        ) : (
          <>
            <PtChoiceCard
              title="Top up from my Main wallet"
              subtitle={`On ${day}, fill it back to ${formatNaira(amount)}.`}
              selected={form.funding === 'topup'}
              onPress={() => set({ funding: 'topup' })}
            />
            <View
              style={{
                borderRadius: ptRadius.md,
                borderWidth: 2,
                borderColor: form.funding === 'split' ? pt.brand : 'transparent',
                backgroundColor: form.funding === 'split' ? pt.brandSoft : pt.raised,
              }}
            >
              <PtChoiceCard
                title="Split between us"
                subtitle={`Each person pays their share on ${day}.`}
                selected={form.funding === 'split'}
                onPress={() => {
                  // First time: you and a co-owner in the family, 60/40 like the prototype.
                  const spouse = payers.length === 0 ? members.find((m) => ['owner', 'co_owner', 'admin'].includes(m.role)) : undefined;
                  if (!spouse) {
                    set({ funding: 'split' });
                    return;
                  }
                  const people = form.people.some((p) => p.userId === spouse.id)
                    ? form.people.map((p) => (p.userId === spouse.id ? { ...p, share: 40 } : p))
                    : [...form.people, { key: `u${spouse.id}`, userId: spouse.id, name: firstName(spouse.name), full: spouse.name, role: 'co_owner' as Role, categories: null, dailyLimit: '', share: 40 }];
                  set({ funding: 'split', myShare: 60, people });
                }}
              />
              {form.funding === 'split' ? (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 4 }}>
                  {[
                    { key: 'me', name: myName, full: me?.full_name ?? myName, share: form.myShare, tone: 'brand' as const },
                    ...payers.map((p, i) => ({ key: p.key, name: p.name, full: p.full ?? p.name, share: p.share ?? 0, tone: AVATAR_CYCLE[(i + 1) % AVATAR_CYCLE.length] })),
                  ].map((p) => (
                    <Pressable
                      key={p.key}
                      onPress={() => setSheet({ share: p.key })}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.name}'s share`}
                      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <PtAvatar initials={initials(p.full)} tone={p.tone} size={32} />
                      <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>
                        {p.name} · {p.share}%
                      </Text>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(Math.round((amount * p.share) / 100))}</Text>
                    </Pressable>
                  ))}
                  {notIn.length ? (
                    <Pressable onPress={() => setSheet('add')} accessibilityRole="button" style={{ paddingVertical: 8 }}>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>+ Add someone to the split</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        )}
        <PtChoiceCard title="I will add money myself" subtitle="No automatic top-up." selected={form.funding === 'manual' || form.period === 'one_off'} onPress={() => set({ funding: 'manual' })} />
        <PtPanel>
          <PtSwitchRow
            title={`Fill it now from ${main?.name ?? 'Main'}`}
            subtitle={main ? `Moves ${formatNaira(amount)} today · ${formatMoney(main.balance)} available` : 'You need a Main wallet'}
            value={form.fillNow}
            onChange={(v) => set({ fillNow: v })}
          />
        </PtPanel>
        {form.funding === 'split' ? <PtNote>If someone's share doesn't arrive, we remind them and tell you after 2 days.</PtNote> : null}

        <PtOptionSheet
          visible={sheet === 'add'}
          title="Add someone to the split"
          options={notIn.map((m) => ({ value: m.id, label: m.name, hint: m.email }))}
          value={null}
          onPick={(id) => {
            const m = members.find((x) => x.id === id);
            const people = form.people.some((p) => p.userId === id)
              ? form.people.map((p) => (p.userId === id ? { ...p, share: 0 } : p))
              : m
                ? [...form.people, { key: `u${id}`, userId: id, name: firstName(m.name), full: m.name, role: (['owner', 'co_owner', 'admin'].includes(m.role) ? 'co_owner' : 'contributor') as Role, categories: null, dailyLimit: '', share: 0 }]
                : form.people;
            set(evenSplit(people));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={Boolean(shareSheet)}
          title={shareSheet === 'me' ? 'Your share' : `${form.people.find((p) => p.key === shareSheet)?.name ?? ''}'s share`}
          options={[
            ...Array.from({ length: 19 }, (_, i) => ({ value: (i + 1) * 5, label: `${(i + 1) * 5}%`, hint: formatNaira(Math.round((amount * (i + 1) * 5) / 100)) })),
            ...(shareSheet !== 'me' ? [{ value: 0, label: 'Take them out of the split' }] : []),
          ]}
          value={shareSheet === 'me' ? form.myShare : form.people.find((p) => p.key === shareSheet)?.share ?? null}
          onPick={(v) => {
            if (shareSheet === 'me') {
              const others = payers.filter((p) => p.share !== null);
              set(others.length === 1 ? { myShare: v, people: form.people.map((p) => (p.key === others[0].key ? { ...p, share: 100 - v } : p)) } : { myShare: v });
            } else if (v === 0) {
              set(evenSplit(form.people.map((p) => (p.key === shareSheet ? { ...p, share: null } : p))));
            } else {
              set(payers.length === 1 ? { myShare: 100 - v, people: form.people.map((p) => (p.key === shareSheet ? { ...p, share: v } : p)) } : { people: form.people.map((p) => (p.key === shareSheet ? { ...p, share: v } : p)) });
            }
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SPD-05
  if (step === 'spenders') {
    const notAdded = members.filter((m) => !form.people.some((p) => p.userId === m.id));
    const describe = (p: Person) =>
      p.role === 'viewer'
        ? "Can see the budget, can't spend"
        : `${p.categories === null ? 'All categories' : `${joinNames(p.categories)} only`} · ${Number(p.dailyLimit) > 0 ? `up to ${formatNaira(p.dailyLimit)} a day` : 'no daily limit'}`;
    return (
      <PtStepScreen onBack={back} flow={header} title="Who can spend from it?" subtitle="Give each person only what they need." gap={16} footer={footer('Continue')}>
        <PtPanel>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{myName} (you)</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>All categories · no daily limit</Text>
            </View>
            <PtChip label="Owner" icon="circle" />
          </View>
          {form.people.map((p, i) => (
            <React.Fragment key={p.key}>
              <PtDivider />
              <Pressable
                onPress={() => setEditing(p.key)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${p.name}`}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
              >
                <PtAvatar initials={p.phone && !p.name ? '+' : initials(p.full ?? p.name)} tone={p.phone ? 'gold' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                    {p.name || formatE164(p.phone ?? '')}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.inkMuted }}>{describe(p)}</Text>
                </View>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Edit</Text>
              </Pressable>
            </React.Fragment>
          ))}
          {adding ? (
            <>
              <PtDivider />
              <PtNewPersonForm
                nameRequired
                taken={[...form.people.map((p) => p.phone ?? ''), me?.phone ?? '']}
                onCancel={() => setAdding(false)}
                onAdd={(np) => {
                  const key = np.phone;
                  set({ people: [...form.people, { key, phone: np.phone, name: np.name, role: 'contributor', categories: null, dailyLimit: '', share: null }] });
                  setAdding(false);
                  setEditing(key);
                }}
              />
            </>
          ) : null}
        </PtPanel>
        {!adding ? <PtAddRow label="Add someone" onPress={() => setSheet('add')} /> : null}
        <PtNote>Everyone you add gets an invite. They pay from Patriai, and you see every payment.</PtNote>

        <PtOptionSheet
          visible={sheet === 'add'}
          title="Add someone"
          options={[...notAdded.map((m) => ({ value: m.id, label: m.name, hint: m.email })), { value: -1, label: 'Someone new', hint: 'Invite them by phone number' }]}
          value={null}
          onPick={(id) => {
            setSheet(null);
            if (id === -1) setAdding(true);
            else {
              addFamily(id);
              setEditing(`u${id}`);
            }
          }}
          onClose={() => setSheet(null)}
        />
        <SpenderSheet
          person={editingPerson}
          categories={form.categories.map((c) => c.name)}
          onSave={(patch) => {
            if (editingPerson) updatePerson(editingPerson.key, patch);
            setEditing(null);
          }}
          onRemove={() => {
            const people = form.people.filter((p) => p.key !== editing);
            set(editingPerson?.share !== null ? evenSplit(people) : { people });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SPD-06
  if (step === 'alerts') {
    const half = Math.round(amount / 2);
    const eighty = Math.round(amount * 0.8);
    const example = form.categories[1]?.name ?? form.categories[0]?.name;
    return (
      <PtStepScreen onBack={back} flow={header} title="Keep an eye on it" subtitle="We'll tell you before money runs out." gap={16} footer={footer('Review')}>
        <PtPanel>
          <PtSwitchRow title="Half spent" subtitle={`When ${formatNaira(half)} is gone`} value={form.alerts.half} onChange={(v) => set({ alerts: { ...form.alerts, half: v } })} />
          <PtDivider />
          <PtSwitchRow title="80% spent" subtitle={`When ${formatNaira(eighty)} is gone`} value={form.alerts.eighty} onChange={(v) => set({ alerts: { ...form.alerts, eighty: v } })} />
          <PtDivider />
          <PtSwitchRow
            title="A category runs out"
            subtitle={example ? `Like ${example}` : 'When a limit is used up'}
            value={form.alerts.category_out}
            onChange={(v) => set({ alerts: { ...form.alerts, category_out: v } })}
          />
          <PtDivider />
          <PtSwitchRow title="Weekly summary" subtitle="Sunday evening" value={form.alerts.weekly} onChange={(v) => set({ alerts: { ...form.alerts, weekly: v } })} />
        </PtPanel>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>When a limit is reached</PtGroupLabel>
          <PtChoiceCard title="Ask an owner to approve" subtitle={`Payment waits for ${joinNames(owners, false).replace(' and ', ' or ')}.`} selected={form.overLimit === 'approve'} onPress={() => set({ overLimit: 'approve' })} />
          <PtChoiceCard title="Stop the payment" subtitle="Nothing goes over the limit." selected={form.overLimit === 'stop'} onPress={() => set({ overLimit: 'stop' })} />
        </View>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const budgetLine = per ? `${formatNaira(amount)} a ${per}, from ${monthly ? `the ${ordinal(form.monthDay)}` : DAYS[form.weekDay]}` : `${formatNaira(amount)} in total`;
  const leftoverLine =
    form.period === 'one_off' ? null : form.leftover === 'wallet' && leftoverWallet ? `Leftover moves to ${leftoverWallet.name}` : form.leftover === 'main' ? 'Leftover goes back to Main' : 'Leftover stays for next time';
  const fundingLine =
    form.period === 'one_off' || form.funding === 'manual'
      ? form.fillNow
        ? `${formatNaira(amount)} from ${main?.name ?? 'Main'} now`
        : 'You add money yourself'
      : form.funding === 'topup'
        ? `Topped up from ${main?.name ?? 'Main'} on ${startLabel}`
        : [`${myName} ${form.myShare}%`, ...payers.map((p) => `${p.name} ${p.share}%`)].join(' · ');
  const limited = form.people.filter((p) => p.role !== 'viewer' && (p.categories !== null || Number(p.dailyLimit) > 0));
  const spenders = [myName, ...form.people.filter((p) => p.role !== 'viewer').map((p) => p.name)];
  return (
    <PtStepScreen onBack={back} flow={header} title="Review your budget" subtitle="Check everything. You can edit before you create." gap={16} footer={footer('Create wallet', submit, create.isPending)}>
      <PtPanel>
        <PtReviewRow label="Name" value={name.trim()} sub={KINDS.find((k) => k.value === form.kind)?.line ?? null} onEdit={() => flow.goTo('for')} />
        <PtReviewRow label="Budget" value={budgetLine} sub={leftoverLine} onEdit={() => flow.goTo('amount')} />
        <PtReviewRow
          label="Categories"
          value={`${form.categories.length} ${form.categories.length === 1 ? 'category' : 'categories'}`}
          sub={form.categories.map((c) => `${firstName(c.name)} ${formatNairaK(c.limit)}`).join(' · ')}
          onEdit={() => flow.goTo('categories')}
        />
        <PtReviewRow label="Funding" value={fundingLine} onEdit={() => flow.goTo('funding')} />
        <PtReviewRow
          label="Spenders"
          value={spenders.join(', ')}
          sub={
            limited
              .map((p) => `${p.name}: ${p.categories === null ? 'all categories' : `${p.categories.map((c) => firstName(c).toLowerCase()).join(', ')} only`}${Number(p.dailyLimit) > 0 ? `, ${formatNaira(p.dailyLimit)} a day` : ''}`)
              .join(' · ') || null
          }
          onEdit={() => flow.goTo('spenders')}
        />
        <PtReviewRow label="Over the limit" value={form.overLimit === 'approve' ? 'Ask an owner to approve' : 'Stop the payment'} onEdit={() => flow.goTo('alerts')} last />
      </PtPanel>
    </PtStepScreen>
  );
}

/** SPD-05 "Edit": what one person may do with the budget. */
function SpenderSheet({
  person,
  categories,
  onSave,
  onRemove,
  onClose,
}: {
  person: Person | null;
  categories: string[];
  onSave: (patch: Partial<Person>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [role, setRole] = useState<Role>('contributor');
  const [allowed, setAllowed] = useState<string[] | null>(null);
  const [daily, setDaily] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  if (person && opened !== person.key) {
    setOpened(person.key);
    setRole(person.role);
    setAllowed(person.categories);
    setDaily(person.dailyLimit);
  }
  if (!person && opened !== null) setOpened(null);

  const toggle = (name: string) => {
    const current = allowed ?? categories;
    const next = current.includes(name) ? current.filter((c) => c !== name) : [...current, name];
    setAllowed(next.length === categories.length ? null : next);
  };

  return (
    <PtSheet
      visible={Boolean(person)}
      title={person?.name || 'Someone new'}
      subtitle="Give them only what they need."
      onClose={onClose}
      footer={
        <>
          <PtButton title="Save" onPress={() => onSave({ role, categories: role === 'viewer' ? null : allowed, dailyLimit: role === 'viewer' ? '' : daily })} />
          <PtButton title={`Remove ${person?.name || 'them'}`} variant="ghost" onPress={onRemove} />
        </>
      }
    >
      <View style={{ gap: 8 }}>
        {(
          [
            { value: 'co_owner', title: 'Co-owner', line: 'Spends and approves' },
            { value: 'contributor', title: 'Spender', line: 'Spends within the limits you set' },
            { value: 'viewer', title: 'Sees the budget', line: "Can't spend" },
          ] as const
        ).map((r) => (
          <PtChoiceCard key={r.value} title={r.title} subtitle={r.line} selected={role === r.value} onPress={() => setRole(r.value)} />
        ))}
      </View>
      {role !== 'viewer' ? (
        <>
          <PtGroupLabel>Can spend on</PtGroupLabel>
          <PtPanel>
            {categories.map((c, i) => {
              const on = (allowed ?? categories).includes(c);
              return (
                <View key={c} style={{ borderBottomWidth: i === categories.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <Pressable
                    onPress={() => {
                      selection();
                      toggle(c);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={c}
                    style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{c}</Text>
                    <PtCheckbox checked={on} />
                  </Pressable>
                </View>
              );
            })}
          </PtPanel>
          <PtField
            label="Daily limit (optional)"
            prefix="₦"
            value={groupAmountInput(daily)}
            onChangeText={(t) => setDaily(sanitizeAmountInput(t))}
            placeholder="No daily limit"
            keyboardType="decimal-pad"
          />
        </>
      ) : null}
    </PtSheet>
  );
}
