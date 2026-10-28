import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtChip } from '../../components/pt/PtChip';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSlider } from '../../components/pt/PtSlider';
import { PtProjectionChart } from '../../components/pt/PtProjectionChart';
import { PtAddRow, PtNewPersonForm, PtRoleButton } from '../../components/pt/PtPeople';
import {
  PtChoiceCard,
  PtDivider,
  PtGroupLabel,
  PtNote,
  PtPanel,
  PtPills,
  PtReviewRow,
  PtSegmented,
  PtSwitchRow,
} from '../../components/pt/PtForm';
import { useCreateWallet, useFamily, useSavingsInsights, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatMoney, formatNaira, formatYmd, groupAmountInput, initials, parseYmd, sanitizeAmountInput, toYmd, ymdMonthsFromNow } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { joinNames, ordinal } from '../../lib/goalPlan';
import { WALLET_COLOURS, WALLET_COLOUR_KEYS } from '../../lib/walletColours';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { CharityPickerSheet } from '../../components/savings/CharityPickerSheet';
import { notifySuccess, selection } from '../../lib/haptics';
import type { FamilyMember, InvitePermissions, SavingsFrequency, SavingsMissedPolicy, WalletColour, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'template' | 'who' | 'name' | 'method' | 'amounts' | 'target' | 'lock' | 'missed' | 'review';
const STEPS: Step[] = ['template', 'who', 'name', 'method', 'amounts', 'target', 'lock', 'missed', 'review'];
const TOTAL = 8;

type Role = 'co_owner' | 'contributor';
type Methods = { salary: boolean; roundups: boolean; schedule: boolean; manual: boolean };

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'co_owner', label: 'Co-owner', hint: 'Can save and approve' },
  { value: 'contributor', label: 'Contributor', hint: 'Can add money only' },
];

const PERMISSIONS: { key: keyof InvitePermissions; title: string; subtitle: string }[] = [
  { key: 'view', title: 'See the balance', subtitle: 'And every payment in and out' },
  { key: 'fund', title: 'Add money', subtitle: 'Save into it' },
  { key: 'request', title: 'Ask to take money out', subtitle: 'You approve first' },
  { key: 'withdraw', title: 'Take money out', subtitle: 'Without asking' },
];

const DEFAULT_PERMS: InvitePermissions = { view: true, fund: true, request: true, withdraw: false };

const PURPOSES = [
  { value: 'rent', label: 'Rent' },
  { value: 'school', label: 'School' },
  { value: 'travel', label: 'Travel' },
  { value: 'event', label: 'Event' },
  { value: 'car', label: 'Car' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' },
];

const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PER_MONTH: Record<SavingsFrequency, number> = { daily: 30.44, weekly: 4.345, monthly: 1 };

/** Next 15 December (or this year's, while it's still ahead). */
function nextDecember(): string {
  const now = new Date();
  const year = now.getMonth() === 11 && now.getDate() >= 15 ? now.getFullYear() + 1 : now.getFullYear();
  return toYmd(new Date(year, 11, 15));
}

/** WCR-02 starting points: they fill in the usual settings; everything can change. */
const TEMPLATES: {
  key: string;
  title: string;
  line: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  purpose: string;
  methods: Partial<Methods>;
  lock: 'date' | 'target';
  dateHint: string;
  date: () => string;
}[] = [
  { key: 'rent', title: 'House rent', line: 'Rent is due every year. Save from every salary.', icon: 'home', purpose: 'rent', methods: { salary: true }, lock: 'date', dateHint: 'Your rent renewal date', date: () => ymdMonthsFromNow(4) },
  { key: 'school', title: 'School fees', line: "Spread next term's fees across the months.", icon: 'book-open', purpose: 'school', methods: { schedule: true }, lock: 'date', dateHint: 'When next term starts', date: () => ymdMonthsFromNow(3) },
  { key: 'christmas', title: 'Christmas in the village', line: 'Travel, gifts and food for December.', icon: 'gift', purpose: 'travel', methods: { schedule: true, roundups: true }, lock: 'date', dateHint: 'When you travel home', date: nextDecember },
  { key: 'event', title: 'Wedding or event', line: 'Aso ebi, venue, souvenirs.', icon: 'heart', purpose: 'event', methods: { schedule: true }, lock: 'date', dateHint: 'The big day', date: () => ymdMonthsFromNow(6) },
  { key: 'car', title: 'A new car', line: 'Save for the deposit or the full price.', icon: 'truck', purpose: 'car', methods: { salary: true, roundups: true }, lock: 'target', dateHint: 'When you want to buy', date: () => ymdMonthsFromNow(12) },
  { key: 'japa', title: 'Japa fund', line: 'Visa, flights, proof of funds.', icon: 'send', purpose: 'travel', methods: { salary: true }, lock: 'target', dateHint: 'When you plan to travel', date: () => ymdMonthsFromNow(12) },
];

interface NewPerson {
  key: string;
  phone: string;
  name: string;
  role: Role;
}

interface Milestone {
  key: string;
  title: string;
  amount: string;
}

/** Everything the flow holds — saved as the draft's data. */
interface SavingsForm {
  template: string | null;
  mode: 'private' | 'shared';
  picked: number[];
  roles: Record<number, Role>;
  /** By person key (`u12` or a phone number). */
  perms: Record<string, InvitePermissions>;
  canApprove: Record<string, boolean>;
  newPeople: NewPerson[];
  purpose: string | null;
  colour: WalletColour;
  why: string;
  methods: Methods;
  salaryPercent: number;
  roundupTo: '100' | '500' | '1000';
  amount: string;
  frequency: SavingsFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  sourceId: number | null;
  startOn: boolean;
  start: string;
  allowEdit: boolean;
  target: string;
  targetDate: string | null;
  dateHint: string;
  milestones: Milestone[];
  lockMode: 'none' | 'date' | 'target';
  earlyBreak: boolean;
  earlyApproval: boolean;
  /** SAV-05 "Where the fee goes": the charity for half of an early-break fee. */
  charity: { id: number; name: string } | null;
  missed: SavingsMissedPolicy;
  tellOthers: boolean;
  /** SAV-06 "Tell me — Push and SMS". */
  sms: boolean;
}

const EMPTY: SavingsForm = {
  template: 'rent',
  mode: 'private',
  picked: [],
  roles: {},
  perms: {},
  canApprove: {},
  newPeople: [],
  purpose: null,
  colour: 'emerald',
  why: '',
  methods: { salary: false, roundups: false, schedule: true, manual: false },
  salaryPercent: 15,
  roundupTo: '100',
  amount: '',
  frequency: 'monthly',
  dayOfWeek: 5,
  dayOfMonth: 25,
  sourceId: null,
  startOn: false,
  start: '',
  allowEdit: false,
  target: '',
  targetDate: null,
  dateHint: '',
  milestones: [],
  lockMode: 'none',
  earlyBreak: true,
  earlyApproval: true,
  charity: null,
  missed: 'retry',
  tellOthers: false,
  sms: true,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const familyKey = (id: number) => `u${id}`;

/** "15% of each salary + round-ups to ₦100 + ₦20,000 every Friday". */
function methodsLabel(f: SavingsForm): string {
  if (f.methods.manual) return 'When you add money';
  const freq =
    f.frequency === 'weekly' ? `every ${DAY_NAMES[f.dayOfWeek]}` : f.frequency === 'monthly' ? `on the ${ordinal(f.dayOfMonth)}` : 'every day';
  return [
    f.methods.salary ? `${f.salaryPercent}% of each salary` : null,
    f.methods.roundups ? `round-ups to ₦${Number(f.roundupTo).toLocaleString('en-NG')}` : null,
    f.methods.schedule && Number(f.amount) > 0 ? `${formatNaira(f.amount)} ${freq}` : null,
  ]
    .filter(Boolean)
    .join(' + ');
}

/**
 * Savings wallet from the client prototype: WCR-02 starting point → WCR-03 who
 * it's for → SAV-01 name → SAV-02 how money comes in → SAV-03 amounts → SAV-04
 * target, projection and milestones → SAV-05 lock → SAV-06 missed saves →
 * WCR-06 review → WCR-07. Keeps the client's sheet: milestones (or skip),
 * contributors with their own permissions, one plan for everyone, contributors
 * may set their own amount, auto-saved drafts.
 */
export function SavingsWalletSetupScreen(props: RootScreenProps<'SavingsWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <SavingsSetup {...props} draft={draft} />;
}

function SavingsSetup({ navigation, draft }: RootScreenProps<'SavingsWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const insights = useSavingsInsights();
  const create = useCreateWallet();

  const [name, setName] = useState(draft?.name ?? '');
  const [form, setForm] = useState<SavingsForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<SavingsForm>) }));
  const set = (patch: Partial<SavingsForm>) => setForm((f) => ({ ...f, ...patch }));
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'date' | 'source' | 'day' | 'charity' | { role: string }>(null);
  const [permsFor, setPermsFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [milestone, setMilestone] = useState({ title: '', amount: '' });

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'savings',
    name,
    step: Math.min(flow.index + 1, TOTAL),
    totalSteps: TOTAL,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(name.trim() || form.target || flow.index > 0),
  });

  const leaveSetup = () =>
    confirmLeaveSetup(
      Boolean(autosave.draftId),
      () => flow.leave(() => navigation.goBack()),
      () => void autosave.discard().then(() => flow.leave(() => navigation.goBack())),
    );
  const back = () => {
    setError(null);
    flow.back(leaveSetup);
  };

  // ---- people
  const members = (family.data?.members ?? []).filter((m) => m.role !== 'vendor');
  const roleOf = (m: FamilyMember): Role => form.roles[m.id] ?? (['owner', 'co_owner', 'admin'].includes(m.role) ? 'co_owner' : 'contributor');
  const shared = form.mode === 'shared';
  const pickedFamily = members.filter((m) => form.picked.includes(m.id));
  const people = shared
    ? [
        ...pickedFamily.map((m) => ({ key: familyKey(m.id), name: firstName(m.name), role: roleOf(m) })),
        ...form.newPeople.map((p) => ({ key: p.key, name: p.name.trim() || formatE164(p.phone), role: p.role })),
      ]
    : [];
  const coOwners = people.filter((p) => p.role === 'co_owner').map((p) => p.name);
  const permsOf = (key: string, role: Role): InvitePermissions => form.perms[key] ?? (role === 'co_owner' ? { ...DEFAULT_PERMS, withdraw: true } : DEFAULT_PERMS);

  // ---- money
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked && w.type !== 'emergency');
  const main = sources.find((w) => w.type === 'main');
  const source = sources.find((w) => w.id === form.sourceId) ?? main ?? sources[0];
  const automatic = !form.methods.manual && (form.methods.salary || form.methods.roundups || form.methods.schedule);
  const salary = insights.data?.salary;
  const salaryShare = salary ? (parseFloat(salary.amount) * form.salaryPercent) / 100 : 0;
  const roundupEstimate = parseFloat(insights.data?.roundups?.[form.roundupTo] ?? '0');
  const scheduledMonthly = form.methods.schedule ? (Number(form.amount) || 0) * PER_MONTH[form.frequency] : 0;
  const myMonthly = form.methods.manual ? 0 : (form.methods.salary ? salaryShare : 0) + (form.methods.roundups ? roundupEstimate : 0) + scheduledMonthly;
  const savers = people.filter((p) => permsOf(p.key, p.role).fund);
  const othersMonthly = form.methods.manual ? 0 : scheduledMonthly * savers.length;
  const othersUnknown = form.methods.salary && !form.methods.manual && savers.length > 0;
  const target = Number(form.target) || 0;
  const startWith = form.startOn ? Number(form.start) || 0 : 0;

  const projection = useMemo(() => {
    const end = parseYmd(form.targetDate);
    const months = end ? Math.max(1, Math.min(12, Math.round((end.getTime() - Date.now()) / 86_400_000 / 30.44))) : 6;
    const monthly = myMonthly + othersMonthly;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const points = Array.from({ length: months + 1 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      return { label: i === 0 ? 'Now' : monthNames[d.getMonth()], value: startWith + monthly * i };
    });
    const reach = points[points.length - 1].value;
    // Other savers' salaries aren't known here, so "behind" can't be called when they share theirs.
    const onTrack = target > 0 && monthly > 0 ? (reach >= target ? true : othersUnknown ? null : false) : null;
    return { points, reach, monthly, onTrack };
  }, [form.targetDate, myMonthly, othersMonthly, othersUnknown, startWith, target]);

  const validate = (s: Step): string | null => {
    if (s === 'name' && !name.trim()) return 'Give your savings a name.';
    if (s === 'method' && !form.methods.manual && !form.methods.salary && !form.methods.roundups && !form.methods.schedule) {
      return 'Pick at least one way money comes in.';
    }
    if (s === 'amounts') {
      if (form.methods.schedule && !form.methods.manual && !(Number(form.amount) > 0)) return 'Enter how much to save each time.';
      if ((automatic || form.startOn) && !source) return 'Choose the wallet your savings come from.';
      if ((form.methods.salary || form.methods.roundups) && !form.methods.manual && !main) return 'Salary share and round-ups need your Main wallet.';
      if (form.startOn) {
        if (!(Number(form.start) > 0)) return 'Enter how much to add now, or turn it off.';
        if (source && Number(form.start) > parseFloat(source.balance)) return `${source.name} only has ${formatMoney(source.balance)}.`;
      }
    }
    if (s === 'target') {
      if (!(target > 0)) return 'Enter how much you need.';
      const d = parseYmd(form.targetDate);
      if (d && d.getTime() <= Date.now()) return 'Pick a date after today.';
    }
    if (s === 'lock' && form.lockMode === 'date' && !form.targetDate) return 'Pick the date it opens.';
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    flow.next();
  };

  const applyTemplate = (key: string | null) => {
    const t = TEMPLATES.find((x) => x.key === key);
    setError(null);
    if (t) {
      if (!name.trim()) setName(t.title);
      set({
        template: t.key,
        purpose: t.purpose,
        methods: { salary: false, roundups: false, schedule: false, manual: false, ...t.methods },
        lockMode: t.lock,
        dateHint: t.dateHint,
        targetDate: form.targetDate ?? t.date(),
      });
    } else {
      set({ template: null });
    }
    flow.next();
  };

  const submit = () => {
    for (const s of ['name', 'method', 'amounts', 'target', 'lock'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    setError(null);
    autosave.stop();
    const memberPayload = shared
      ? [
          ...pickedFamily.map((m) => ({
            user_id: m.id,
            role: roleOf(m),
            permissions: permsOf(familyKey(m.id), roleOf(m)),
            can_approve: roleOf(m) === 'contributor' ? Boolean(form.canApprove[familyKey(m.id)]) : undefined,
          })),
          ...form.newPeople.map((p) => ({
            identifier: p.phone,
            role: p.role,
            permissions: permsOf(p.key, p.role),
            can_approve: p.role === 'contributor' ? Boolean(form.canApprove[p.key]) : undefined,
          })),
        ]
      : undefined;

    create.mutate(
      {
        type: 'savings',
        name: name.trim(),
        purpose: form.purpose ?? undefined,
        description: form.why.trim() || undefined,
        colour: form.colour,
        mode: form.mode,
        target_amount: form.target,
        target_date: form.targetDate ?? undefined,
        source_wallet_id: (automatic || form.startOn) && source ? source.id : undefined,
        initial_deposit: form.startOn ? form.start : undefined,
        milestones: form.milestones.map((m) => ({ title: m.title, amount: m.amount })),
        members: memberPayload,
        savings_plan: {
          schedule: form.methods.schedule && !form.methods.manual,
          amount: form.methods.schedule ? form.amount : undefined,
          frequency: form.frequency,
          day_of_week: form.frequency === 'weekly' ? form.dayOfWeek : undefined,
          day_of_month: form.frequency === 'monthly' ? form.dayOfMonth : undefined,
          salary_percent: form.methods.salary && !form.methods.manual ? form.salaryPercent : undefined,
          roundup_to: form.methods.roundups && !form.methods.manual ? form.roundupTo : undefined,
          auto_save: automatic,
          allow_contributor_edit: form.allowEdit,
          missed_policy: form.missed,
          notify_others_on_miss: shared && form.tellOthers,
          notify_sms: form.sms,
        },
        lock: {
          mode: form.lockMode,
          until: form.lockMode === 'date' ? form.targetDate ?? undefined : undefined,
          early_break: form.earlyBreak,
          approval: form.earlyApproval,
          charity_id: form.earlyBreak ? form.charity?.id ?? null : null,
        },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const moved = startWith > 0 ? `${formatNaira(startWith)} moved from ${source?.name ?? 'Main'}. ` : '';
          const nextSave = form.methods.manual
            ? 'Add money whenever you like.'
            : form.methods.salary
              ? `Your next save happens when salary lands${salary ? ` on the ${ordinal(salary.day)}` : ''}.`
              : form.methods.schedule
                ? `You save ${methodsLabel({ ...form, methods: { ...form.methods, salary: false, roundups: false } })}.`
                : 'Round-ups start with your next payment.';
          const rules = [
            form.methods.salary && !form.methods.manual ? `Save ${form.salaryPercent}% from every salary` : null,
            form.methods.roundups && !form.methods.manual ? `Round-ups to ₦${Number(form.roundupTo).toLocaleString('en-NG')}` : null,
            form.methods.schedule && !form.methods.manual && Number(form.amount) > 0 ? `Save ${methodsLabel({ ...form, methods: { salary: false, roundups: false, schedule: true, manual: false } })}` : null,
          ].filter((r): r is string => Boolean(r));
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: `${name.trim()} is ready`,
              subtitle: moved + nextSave,
              caption: [`of ${formatNaira(target)}`, form.lockMode === 'date' && form.targetDate ? `locked to ${formatYmd(form.targetDate).replace(/ \d{4}$/, '')}` : form.lockMode === 'target' ? 'locked until reached' : null]
                .filter(Boolean)
                .join(' · '),
              events: [
                ...people.map((p) => ({
                  label: p.name,
                  title: form.methods.salary && !form.methods.manual ? `Asked to confirm their ${form.salaryPercent}%` : 'Asked to join and save',
                  sub: 'Sent just now',
                })),
                ...rules.map((r) => ({ label: 'Rule added', title: r, sub: 'See it in Rules' })),
              ],
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

  const errorText = error ? (
    <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
      {error}
    </PtText>
  ) : null;
  const header = { title: 'Savings wallet', step: Math.min(flow.index + 1, TOTAL), total: TOTAL };
  const footer = (title: string, onPress = next, loading = false) => (
    <>
      {errorText}
      <PtButton title={title} onPress={onPress} loading={loading} />
    </>
  );

  // ------------------------------------------------------------ WCR-02
  if (step === 'template') {
    const chosen = TEMPLATES.find((t) => t.key === form.template);
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="Pick a starting point"
        subtitle="Templates fill in the usual settings. You can change everything."
        gap={20}
        footer={footer(chosen ? `Use ${chosen.title}` : 'Start from scratch', () => applyTemplate(form.template))}
      >
        <View style={{ gap: 10 }}>
          {TEMPLATES.map((t) => (
            <PtChoiceCard key={t.key} title={t.title} subtitle={t.line} icon={t.icon} selected={form.template === t.key} onPress={() => set({ template: t.key })} />
          ))}
          <Pressable
            onPress={() => {
              selection();
              applyTemplate(null);
            }}
            accessibilityRole="button"
            style={{ minHeight: 56, borderRadius: ptRadius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>Start from scratch</Text>
          </Pressable>
        </View>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-03
  if (step === 'who') {
    const roleSheetFor = sheet && typeof sheet === 'object' ? sheet.role : null;
    const roleSheetPerson = roleSheetFor ? people.find((p) => p.key === roleSheetFor) : null;
    return (
      <PtStepScreen onBack={back} flow={header} title="Who is this for?" subtitle="You can invite people later, too." gap={20} footer={footer('Continue')}>
        <View style={{ gap: 10 }}>
          <PtChoiceCard title="Just me" subtitle="Only you see it and save into it." icon="user" selected={!shared} onPress={() => set({ mode: 'private' })} />
          <PtChoiceCard title="Shared with family" subtitle="Others can see progress and save into it." icon="users" selected={shared} onPress={() => set({ mode: 'shared' })} />
        </View>

        {shared ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Who can save into it</PtGroupLabel>
            <PtPanel>
              <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
                <View>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }}>{firstName(me?.full_name ?? 'You')} (you)</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Owner</Text>
                </View>
              </View>
              {family.isLoading ? <ActivityIndicator color={pt.brand} style={{ marginVertical: 12 }} /> : null}
              {[
                ...members.map((m, i) => ({ key: familyKey(m.id), id: m.id as number | null, name: m.name, avatar: m.avatar || initials(m.name), tone: AVATAR_CYCLE[i % AVATAR_CYCLE.length], role: roleOf(m), on: form.picked.includes(m.id), phone: null as string | null })),
                ...form.newPeople.map((p) => ({ key: p.key, id: null, name: p.name || formatE164(p.phone), avatar: p.name ? initials(p.name) : '+', tone: 'dashed' as const, role: p.role, on: true, phone: p.phone })),
              ].map((row) => {
                const perms = permsOf(row.key, row.role);
                const open = permsFor === row.key;
                const can = row.role === 'co_owner' ? 'can save and approve' : perms.withdraw ? 'can add and take out money' : 'can add money only';
                return (
                  <React.Fragment key={row.key}>
                    <PtDivider />
                    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                      <Pressable
                        onPress={() => {
                          selection();
                          if (row.id !== null) set({ picked: row.on ? form.picked.filter((id) => id !== row.id) : [...form.picked, row.id] });
                          else set({ newPeople: form.newPeople.filter((p) => p.key !== row.key) });
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: row.on }}
                        accessibilityLabel={row.on ? `Remove ${row.name}` : `Add ${row.name}`}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      >
                        <PtAvatar initials={row.avatar} tone={row.tone} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                            {firstName(row.name)}
                          </Text>
                          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                            {row.on ? `${ROLES.find((r) => r.value === row.role)?.label} · ${can}` : row.phone ?? 'Tap to add'}
                          </Text>
                        </View>
                        <PtCheckbox checked={row.on} />
                      </Pressable>
                    </View>
                    {row.on ? (
                      <View style={{ flexDirection: 'row', gap: 10, paddingBottom: 10, paddingLeft: 50 }}>
                        <PtRoleButton
                          label={ROLES.find((r) => r.value === row.role)?.label ?? 'Role'}
                          accessibilityLabel={`Role for ${row.name}`}
                          onPress={() => setSheet({ role: row.key })}
                        />
                        <PtButton
                          title={open ? 'Done' : 'What they can do'}
                          variant="ghost"
                          size="sm"
                          onPress={() => setPermsFor(open ? null : row.key)}
                        />
                      </View>
                    ) : null}
                    {row.on && open ? (
                      <View style={{ paddingLeft: 50, paddingBottom: 6 }}>
                        {row.role === 'co_owner' ? (
                          <PtNote>Co-owners can do everything you can, including approving payments and changing rules.</PtNote>
                        ) : (
                          <>
                            {PERMISSIONS.map((p) => (
                              <PtSwitchRow
                                key={p.key}
                                title={p.title}
                                subtitle={p.subtitle}
                                value={perms[p.key]}
                                onChange={(v) => set({ perms: { ...form.perms, [row.key]: { ...perms, [p.key]: v } } })}
                              />
                            ))}
                            <PtSwitchRow
                              title="Approve payments"
                              subtitle="Their yes counts when money leaves"
                              value={Boolean(form.canApprove[row.key])}
                              onChange={(v) => set({ canApprove: { ...form.canApprove, [row.key]: v } })}
                            />
                          </>
                        )}
                      </View>
                    ) : null}
                  </React.Fragment>
                );
              })}
              <PtDivider />
              {adding ? (
                <PtNewPersonForm
                  roles={ROLES}
                  defaultRole="contributor"
                  taken={[...form.newPeople.map((p) => p.phone), me?.phone ?? '']}
                  onCancel={() => setAdding(false)}
                  onAdd={(p) => {
                    set({ newPeople: [...form.newPeople, { key: p.phone, phone: p.phone, name: p.name, role: (p.role ?? 'contributor') as Role }] });
                    setAdding(false);
                  }}
                />
              ) : (
                <PtAddRow label="Invite someone new" onPress={() => setAdding(true)} />
              )}
            </PtPanel>
          </View>
        ) : null}

        <PtOptionSheet
          visible={Boolean(roleSheetFor)}
          title={`Role for ${roleSheetPerson?.name ?? 'this person'}`}
          options={ROLES.map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
          value={roleSheetPerson?.role ?? null}
          onPick={(role) => {
            const m = members.find((x) => familyKey(x.id) === roleSheetFor);
            if (m) set({ roles: { ...form.roles, [m.id]: role } });
            else set({ newPeople: form.newPeople.map((p) => (p.key === roleSheetFor ? { ...p, role } : p)) });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SAV-01
  if (step === 'name') {
    return (
      <PtStepScreen onBack={back} flow={header} title="Name your savings" subtitle="A clear name helps everyone know what this money is for." gap={20} footer={footer('Continue')}>
        <PtField
          label="Wallet name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="House rent"
          maxLength={100}
        />
        <View style={{ gap: 12 }}>
          <PtGroupLabel>What is it for</PtGroupLabel>
          <PtPills options={PURPOSES} value={form.purpose} onChange={(p) => set({ purpose: p })} />
        </View>
        <View style={{ gap: 12 }}>
          <PtGroupLabel>Colour</PtGroupLabel>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {WALLET_COLOUR_KEYS.map((c) => {
              const on = form.colour === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    selection();
                    set({ colour: c });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Colour ${c}`}
                  style={{ width: 44, height: 44, borderRadius: 22, borderWidth: on ? 2.5 : 0, borderColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ width: on ? 34 : 40, height: on ? 34 : 40, borderRadius: 20, backgroundColor: WALLET_COLOURS[c] }} />
                </Pressable>
              );
            })}
          </View>
        </View>
        <PtField label="Why it matters (optional)" value={form.why} onChangeText={(t) => set({ why: t })} placeholder="Flat in Lekki, renews 25 Feb" maxLength={200} hint="Shown to members on the wallet page." />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SAV-02
  if (step === 'method') {
    const toggle = (key: keyof Methods) => {
      setError(null);
      if (key === 'manual') set({ methods: { salary: false, roundups: false, schedule: false, manual: !form.methods.manual } });
      else set({ methods: { ...form.methods, manual: false, [key]: !form.methods[key] } });
    };
    return (
      <PtStepScreen onBack={back} flow={header} title="How should money come in?" subtitle="Pick one or more. Patriai does the moving for you." gap={20} footer={footer('Continue')}>
        <View style={{ gap: 10 }}>
          <PtChoiceCard kind="check" icon="percent" title="A share of every salary" subtitle="A percentage moves the moment salary lands." selected={form.methods.salary} onPress={() => toggle('salary')} />
          <PtChoiceCard kind="check" icon="refresh-cw" title="Round-ups" subtitle="Spend ₦4,650, save ₦350 to make it ₦5,000." selected={form.methods.roundups} onPress={() => toggle('roundups')} />
          <PtChoiceCard kind="check" icon="calendar" title="A fixed amount on a schedule" subtitle="Like ₦20,000 every Friday." selected={form.methods.schedule} onPress={() => toggle('schedule')} />
          <PtChoiceCard kind="check" icon="plus" title="Only when I add money" subtitle="No automatic saving." selected={form.methods.manual} onPress={() => toggle('manual')} />
        </View>
        <PtNote>Saving automatically is how most families reach their goal. You can pause any time.</PtNote>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SAV-03
  if (step === 'amounts') {
    const freqLabel = form.frequency === 'weekly' ? `Every ${DAY_NAMES[form.dayOfWeek]}` : form.frequency === 'monthly' ? `On the ${ordinal(form.dayOfMonth)}` : 'Every day';
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="Set the amounts"
        subtitle={insights.data?.months ? `Based on what came into your Main wallet over the last ${insights.data.months} month${insights.data.months === 1 ? '' : 's'}.` : 'Patriai moves the money on time, every time.'}
        gap={18}
        footer={footer('Continue')}
      >
        {form.methods.salary && !form.methods.manual ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Share of salary</PtGroupLabel>
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Save from each salary</Text>
                <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, color: pt.brand }}>{form.salaryPercent}%</Text>
              </View>
              <PtSlider value={form.salaryPercent} min={1} max={30} label="Share of each salary" onChange={(v) => set({ salaryPercent: v })} />
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
                {salary ? (
                  <>
                    About <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{formatNaira(salaryShare)}</Text> when {salary.from ?? 'your salary'} pays you, usually on the {ordinal(salary.day)}
                  </>
                ) : (
                  'Saves this share of every salary-sized payment (₦30,000 or more) that lands in Main, once a month.'
                )}
              </Text>
            </View>
          </View>
        ) : null}

        {form.methods.roundups && !form.methods.manual ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Round-ups</PtGroupLabel>
            <PtSegmented
              options={[
                { value: '100' as const, label: '₦100' },
                { value: '500' as const, label: '₦500' },
                { value: '1000' as const, label: '₦1,000' },
              ]}
              value={form.roundupTo}
              onChange={(v) => set({ roundupTo: v })}
            />
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>
              {roundupEstimate > 0 ? `About ${formatNaira(roundupEstimate)} a month from your spending` : 'Each payment from Main is rounded up and the difference saved every day.'}
            </Text>
          </View>
        ) : null}

        {form.methods.schedule && !form.methods.manual ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Fixed amount</PtGroupLabel>
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 14 }}>
              <PtField
                label={shared ? 'Each person saves' : 'Save'}
                prefix="₦"
                value={groupAmountInput(form.amount)}
                onChangeText={(t) => {
                  set({ amount: sanitizeAmountInput(t) });
                  setError(null);
                }}
                placeholder="20,000"
                keyboardType="decimal-pad"
              />
              <PtSegmented
                options={[
                  { value: 'weekly' as const, label: 'Weekly' },
                  { value: 'monthly' as const, label: 'Monthly' },
                  { value: 'daily' as const, label: 'Daily' },
                ]}
                value={form.frequency}
                onChange={(v) => set({ frequency: v })}
              />
              {form.frequency === 'weekly' ? (
                <PtPills options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: DAYS[d] }))} value={form.dayOfWeek} onChange={(d) => set({ dayOfWeek: d })} />
              ) : form.frequency === 'monthly' ? (
                <PtReviewRow label="When" value={freqLabel} onEdit={() => setSheet('day')} last />
              ) : null}
              {shared ? (
                <PtSwitchRow
                  title="Let savers choose their own amount"
                  subtitle="They can change how much and how often they save"
                  value={form.allowEdit}
                  onChange={(v) => set({ allowEdit: v })}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <PtGroupLabel>Take money from</PtGroupLabel>
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>{source?.name ?? 'No wallet yet'}</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 18, color: pt.ink }}>{source ? formatMoney(source.balance) : '—'}</Text>
              {source?.virtual_account ? (
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Account {source.virtual_account.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3')}</Text>
              ) : null}
            </View>
            {sources.length > 1 ? (
              <Pressable onPress={() => setSheet('source')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change wallet">
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {(form.methods.salary || form.methods.roundups) && !form.methods.manual && source && source.type !== 'main' ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Salary share and round-ups always come from Main, where they happen.</Text>
          ) : null}
        </View>

        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
          <PtSwitchRow
            title={form.startOn && Number(form.start) > 0 ? `Add ${formatNaira(form.start)} now to start` : 'Add money now to start'}
            subtitle={`Moves from ${source?.name ?? 'Main'} when you create the wallet`}
            value={form.startOn}
            onChange={(v) => set({ startOn: v })}
          />
          {form.startOn ? (
            <View style={{ paddingBottom: 14 }}>
              <PtField
                label="How much"
                prefix="₦"
                value={groupAmountInput(form.start)}
                onChangeText={(t) => {
                  set({ start: sanitizeAmountInput(t) });
                  setError(null);
                }}
                placeholder="100,000"
                keyboardType="decimal-pad"
              />
            </View>
          ) : null}
        </View>

        <PtOptionSheet
          visible={sheet === 'source'}
          title="Take money from"
          options={sources.map((w) => ({ value: w.id, label: w.name, hint: formatMoney(w.balance) }))}
          value={source?.id ?? null}
          onPick={(id) => {
            set({ sourceId: id });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'day'}
          title="Save on"
          options={[1, 5, 10, 15, 20, 25, 28].map((d) => ({ value: d, label: `The ${ordinal(d)} of each month` }))}
          value={form.dayOfMonth}
          onPick={(d) => {
            set({ dayOfMonth: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SAV-04
  if (step === 'target') {
    const addMilestone = () => {
      const amount = Number(milestone.amount);
      if (!milestone.title.trim() || !(amount > 0)) {
        setError('Give the milestone a name and an amount.');
        return;
      }
      if (target > 0 && amount > target) {
        setError("A milestone can't be more than the target.");
        return;
      }
      setError(null);
      set({ milestones: [...form.milestones, { key: `${Date.now()}`, title: milestone.title.trim(), amount: milestone.amount }] });
      setMilestone({ title: '', amount: '' });
    };
    const who = shared && savers.length ? `You and ${joinNames(savers.map((s) => s.name))}` : 'You';
    return (
      <PtStepScreen onBack={back} flow={header} title="How much, and by when?" gap={18} footer={footer('Continue')}>
        <PtField
          label="Target amount"
          prefix="₦"
          value={groupAmountInput(form.target)}
          onChangeText={(t) => {
            set({ target: sanitizeAmountInput(t) });
            setError(null);
          }}
          placeholder="600,000"
          keyboardType="decimal-pad"
        />
        <PtField
          label="Need it by"
          value={form.targetDate ? formatYmd(form.targetDate) : ''}
          placeholder="Pick a date"
          onPressBox={() => setSheet('date')}
          hint={form.dateHint || undefined}
        />

        {target > 0 ? (
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Your projection</Text>
              {projection.onTrack === true ? <PtChip label="On track" tone="success" icon="check" /> : projection.onTrack === false ? <PtChip label="Behind" tone="warning" /> : null}
            </View>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
              {projection.monthly > 0 ? (
                <>
                  {othersUnknown ? 'On your own, saving' : `${who} saving`} {methodsLabel(form)}, you reach{' '}
                  <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>
                    {formatNaira(projection.reach)}
                    {form.targetDate ? ` by ${formatYmd(form.targetDate).replace(/ \d{4}$/, '')}` : ' in 6 months'}
                  </Text>
                  {othersUnknown ? ` — plus what ${joinNames(savers.map((p) => p.name))} save from their salaries.` : '.'}
                </>
              ) : (
                `Add money whenever you like — ${formatNaira(Math.max(0, target - startWith))} to go.`
              )}
            </Text>
            {projection.monthly > 0 ? <PtProjectionChart points={projection.points} target={target} /> : null}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <PtGroupLabel>Milestones (optional)</PtGroupLabel>
            {target > 0 && form.milestones.length === 0 ? (
              <Pressable
                onPress={() => {
                  selection();
                  set({
                    milestones: [
                      { pct: 0.25, title: 'Quarter way' },
                      { pct: 0.5, title: 'Halfway' },
                      { pct: 0.75, title: 'Three quarters' },
                    ].map((m) => ({ key: m.title, title: m.title, amount: String(Math.round(target * m.pct)) })),
                  });
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Suggest for me</Text>
              </Pressable>
            ) : null}
          </View>
          <PtPanel>
            {form.milestones.map((m) => (
              <View key={m.key} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: pt.line }}>
                <Feather name="flag" size={16} color={pt.brand} />
                <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{m.title}</Text>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(m.amount)}</Text>
                <Pressable
                  onPress={() => {
                    selection();
                    set({ milestones: form.milestones.filter((x) => x.key !== m.key) });
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.title}`}
                >
                  <Feather name="x" size={18} color={pt.inkSubtle} />
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingVertical: 12 }}>
              <View style={{ flex: 1.3 }}>
                <PtField label="Checkpoint" value={milestone.title} onChangeText={(t) => setMilestone((m) => ({ ...m, title: t }))} placeholder="Halfway" maxLength={100} />
              </View>
              <View style={{ flex: 1 }}>
                <PtField
                  label="Amount"
                  prefix="₦"
                  value={groupAmountInput(milestone.amount)}
                  onChangeText={(t) => setMilestone((m) => ({ ...m, amount: sanitizeAmountInput(t) }))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </View>
              <PtButton title="Add" variant="secondary" size="sm" onPress={addMilestone} style={{ height: 52 }} />
            </View>
          </PtPanel>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Everyone sees each checkpoint as you reach it. You can skip this.</Text>
        </View>

        <PtDateSheet
          visible={sheet === 'date'}
          title="Need it by"
          value={form.targetDate ?? ymdMonthsFromNow(4)}
          minYear={new Date().getFullYear()}
          maxYear={new Date().getFullYear() + 10}
          doneLabel="Done"
          onDone={(ymd) => {
            setSheet(null);
            setError(null);
            set({ targetDate: ymd });
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SAV-05
  if (step === 'lock') {
    const dateText = form.targetDate ? formatYmd(form.targetDate) : null;
    return (
      <PtStepScreen onBack={back} flow={header} title="Lock this money?" subtitle="A lock stops impulse withdrawals." gap={18} footer={footer('Continue')}>
        <View style={{ gap: 10 }}>
          <PtChoiceCard title="No lock" subtitle="Withdraw any time." selected={form.lockMode === 'none'} onPress={() => set({ lockMode: 'none' })} />
          <PtChoiceCard
            title={dateText ? `Lock until ${dateText}` : 'Lock until a date'}
            subtitle={dateText ? `Opens on ${form.dateHint ? form.dateHint.charAt(0).toLowerCase() + form.dateHint.slice(1) : 'that date'}.` : 'Set the date on the last step first.'}
            selected={form.lockMode === 'date'}
            onPress={() => (form.targetDate ? set({ lockMode: 'date' }) : setSheet('date'))}
          />
          <PtChoiceCard
            title="Lock until the target is reached"
            subtitle={`Opens when it hits ${formatNaira(target)}.`}
            selected={form.lockMode === 'target'}
            onPress={() => set({ lockMode: 'target' })}
          />
        </View>
        {form.lockMode !== 'none' ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>If you need it early</PtGroupLabel>
            <PtPanel>
              <PtSwitchRow
                title="Allow early break"
                subtitle={form.earlyBreak ? '5% of the amount is kept as a fee' : 'Nothing comes out until it opens'}
                value={form.earlyBreak}
                onChange={(v) => set({ earlyBreak: v })}
              />
              {form.earlyBreak && coOwners.length > 0 ? (
                <>
                  <PtDivider />
                  <PtSwitchRow
                    title={`${joinNames(coOwners)} must approve`}
                    subtitle={coOwners.length === 1 ? 'Because they save into it too' : 'Because they all save into it too'}
                    value={form.earlyApproval}
                    onChange={(v) => set({ earlyApproval: v })}
                  />
                </>
              ) : null}
              {form.earlyBreak ? (
                <>
                  <PtDivider />
                  <PtReviewRow
                    label="Where the fee goes"
                    value={form.charity ? '50% to a charity you pick' : 'Pick a charity for half of it'}
                    sub={form.charity ? `${form.charity.name} · 50% Patriai fee` : "Until you pick one, it's all a Patriai fee"}
                    onEdit={() => setSheet('charity')}
                    last
                  />
                </>
              ) : null}
            </PtPanel>
            {form.earlyBreak ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                The fee is a nudge to keep saving. If you do break early, half of it helps someone else.
              </Text>
            ) : null}
          </View>
        ) : null}
        <CharityPickerSheet
          visible={sheet === 'charity'}
          value={form.charity?.id ?? null}
          onPick={(o) => {
            set({ charity: { id: o.id, name: o.name } });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtDateSheet
          visible={sheet === 'date'}
          title="Lock until"
          value={ymdMonthsFromNow(4)}
          minYear={new Date().getFullYear()}
          maxYear={new Date().getFullYear() + 10}
          doneLabel="Done"
          onDone={(ymd) => {
            setSheet(null);
            setError(null);
            set({ targetDate: ymd, lockMode: 'date' });
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ SAV-06
  if (step === 'missed') {
    const others = coOwners.length ? joinNames(coOwners) : people.length ? 'the other savers' : null;
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="If a save can't happen"
        subtitle="Sometimes salary is late or Main is low. What should we do?"
        gap={18}
        footer={footer('Review')}
      >
        <View style={{ gap: 10 }}>
          <PtChoiceCard title="Try again in 3 days" subtitle="We check again, up to 3 times." selected={form.missed === 'retry'} onPress={() => set({ missed: 'retry' })} />
          <PtChoiceCard title="Save whatever is there" subtitle="Moves what is available, keeps ₦5,000 behind." selected={form.missed === 'partial'} onPress={() => set({ missed: 'partial' })} />
          <PtChoiceCard title="Skip this time" subtitle="Picks up again at the next save." selected={form.missed === 'skip'} onPress={() => set({ missed: 'skip' })} />
        </View>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Let people know</PtGroupLabel>
          <PtPanel>
            <PtSwitchRow title="Tell me" subtitle={form.sms ? 'Push and SMS' : 'Push only'} value={form.sms} onChange={(v) => set({ sms: v })} />
            {others ? (
              <>
                <PtDivider />
                <PtSwitchRow
                  title={`Tell ${others} too`}
                  subtitle="They see when anyone misses a save"
                  value={form.tellOthers}
                  onChange={(v) => set({ tellOthers: v })}
                />
              </>
            ) : null}
          </PtPanel>
        </View>
        <PtNote tone="success">A missed save never takes money that isn't there.</PtNote>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const missedLabel = { retry: 'Try again in 3 days', partial: 'Save whatever is there', skip: 'Skip this time' }[form.missed];
  const lockLabel =
    form.lockMode === 'none' ? 'No lock' : form.lockMode === 'date' ? `Until ${formatYmd(form.targetDate)}` : `Until ${formatNaira(target)} is reached`;
  const earlyLabel =
    form.lockMode === 'none'
      ? null
      : !form.earlyBreak
        ? 'No early break'
        : coOwners.length && form.earlyApproval
          ? `Early break: 5% fee and ${joinNames(coOwners)}'s yes`
          : 'Early break: 5% fee';
  const estimates = form.methods.salary && salary && !form.methods.manual ? `${firstName(me?.full_name ?? 'You')} about ${formatNaira(salaryShare)} a month` : null;

  return (
    <PtStepScreen
      onBack={back}
      flow={{ ...header, step: TOTAL }}
      title="Review your savings"
      subtitle="Check everything. You can edit before you create."
      gap={18}
      footer={footer('Create wallet', submit, create.isPending)}
    >
      <PtPanel>
        <PtReviewRow label="Name" value={name.trim()} sub={shared ? (people.length ? `Shared with ${joinNames(people.map((p) => p.name))}` : 'Shared') : 'Just you'} onEdit={() => flow.goTo('name')} />
        <PtReviewRow label="Saving" value={methodsLabel(form)} sub={estimates} onEdit={() => flow.goTo('method')} />
        {startWith > 0 ? <PtReviewRow label="Start with" value={`${formatMoney(startWith)} from ${source?.name ?? 'Main'}`} onEdit={() => flow.goTo('amounts')} /> : null}
        <PtReviewRow
          label="Target"
          value={form.targetDate ? `${formatNaira(target)} by ${formatYmd(form.targetDate)}` : formatNaira(target)}
          sub={projection.onTrack === true ? 'On track' : projection.onTrack === false ? 'Behind — save a little more to make it' : null}
          onEdit={() => flow.goTo('target')}
        />
        {form.milestones.length ? (
          <PtReviewRow label="Milestones" value={form.milestones.map((m) => m.title).join(', ')} onEdit={() => flow.goTo('target')} />
        ) : null}
        <PtReviewRow label="Lock" value={lockLabel} sub={earlyLabel} onEdit={() => flow.goTo('lock')} />
        <PtReviewRow label="If missed" value={missedLabel} onEdit={() => flow.goTo('missed')} last />
      </PtPanel>
      {people.length ? (
        <PtNote>
          {joinNames(people.map((p) => p.name))} {people.length === 1 ? 'gets a request' : 'get requests'} to join. Their saving starts once they agree.
        </PtNote>
      ) : null}
    </PtStepScreen>
  );
}
