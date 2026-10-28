import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtAddRow, PtNewPersonForm } from '../../components/pt/PtPeople';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { useCreateProject, useFamily, useVendor, useVendors, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, groupAmountInput, initials, sanitizeAmountInput } from '../../lib/format';
import { DEFAULT_COUNTRY, formatE164, isValidE164, toE164, type Country } from '../../lib/phone';
import { joinNames } from '../../lib/goalPlan';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { ProjectKind, VendorListing, Wallet, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'type' | 'budget' | 'milestones' | 'vendor' | 'funders' | 'release' | 'review';
const STEPS: Step[] = ['type', 'budget', 'milestones', 'vendor', 'funders', 'release', 'review'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Funders' monthly amounts move on the 25th (as the backend's FUNDING_DAY). */
const FUNDING_DAY = 25;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** PRW-01 kinds, with the milestones each usually breaks into (share of the budget). */
const KINDS: { value: ProjectKind; title: string; subtitle: string; icon: IconName; category: string; place: string; milestones: { title: string; description: string; share: number }[] }[] = [
  {
    value: 'building',
    title: 'Building',
    subtitle: 'A new house',
    icon: 'hard-hat',
    category: 'construction',
    place: 'Independence Layout, Enugu',
    milestones: [
      { title: 'Foundation', description: 'Setting out, excavation, footing, DPC', share: 3.2 },
      { title: 'Blockwork to lintel', description: 'Walls, lintel, columns', share: 4.1 },
      { title: 'Roofing', description: 'Trusses, long-span aluminium sheets', share: 3.6 },
      { title: 'Plastering and windows', description: 'Plaster, windows, doors, wiring', share: 3.4 },
      { title: 'Finishing', description: 'Tiles, paint, plumbing, fittings', share: 4.2 },
    ],
  },
  {
    value: 'renovation',
    title: 'Renovation',
    subtitle: 'Fix or extend',
    icon: 'wrench-outline',
    category: 'construction',
    place: 'Surulere, Lagos',
    milestones: [
      { title: 'Repairs and demolition', description: 'Roof leaks, cracks, old fittings out', share: 3 },
      { title: 'Plumbing and wiring', description: 'Pipes, sockets, the meter', share: 3 },
      { title: 'Finishing', description: 'Tiles, paint, doors', share: 4 },
    ],
  },
  {
    value: 'event',
    title: 'An event',
    subtitle: 'Wedding, burial',
    icon: 'calendar-blank-outline',
    category: 'events',
    place: 'Owerri',
    milestones: [
      { title: 'Venue and deposits', description: 'Hall, canopies, chairs', share: 4 },
      { title: 'Food and drinks', description: 'Caterer, drinks, small chops', share: 4 },
      { title: 'Decor, sound and photos', description: 'Decorator, DJ, photographer', share: 2 },
    ],
  },
  {
    value: 'community',
    title: 'Community',
    subtitle: 'Church, school, town',
    icon: 'bank-outline',
    category: 'all',
    place: 'Umuahia',
    milestones: [
      { title: 'Foundation', description: 'Setting out, footing', share: 3 },
      { title: 'Structure', description: 'Walls, columns, roof', share: 4 },
      { title: 'Finishing', description: 'Plaster, paint, fittings', share: 3 },
    ],
  },
];

interface PlannedMilestone {
  key: string;
  title: string;
  description: string;
  amount: string;
  /** YYYY-MM-01 */
  from: string;
  to: string;
}

interface Funder {
  key: string;
  userId?: number;
  phone?: string;
  name: string;
  full?: string;
  role: 'co_owner' | 'contributor';
  amount: string;
}

interface ProjectForm {
  kind: ProjectKind;
  location: string;
  budget: string;
  start: string | null;
  finish: string | null;
  buffer: boolean;
  milestones: PlannedMilestone[];
  vendorMode: 'directory' | 'invite' | 'later';
  vendor: { id: number; name: string } | null;
  vendorPhone: string;
  myMonthly: string;
  funders: Funder[];
  moveIn: boolean;
  photos: boolean;
  video: boolean;
  receipts: boolean;
  approvers: 'all' | 'owner';
  retention: number;
  retentionMonths: number;
}

const EMPTY: ProjectForm = {
  kind: 'building',
  location: '',
  budget: '',
  start: null,
  finish: null,
  buffer: true,
  milestones: [],
  vendorMode: 'directory',
  vendor: null,
  vendorPhone: '',
  myMonthly: '',
  funders: [],
  moveIn: true,
  photos: true,
  video: true,
  receipts: false,
  approvers: 'all',
  retention: 10,
  retentionMonths: 3,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const ym = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 });
const monthLabel = (iso: string | null) => (iso ? `${MONTHS[ym(iso).m]} ${ym(iso).y}` : '');
const addMonths = (iso: string, n: number) => {
  const { y, m } = ym(iso);
  const d = new Date(y, m + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const monthsBetween = (a: string, b: string) => (ym(b).y - ym(a).y) * 12 + (ym(b).m - ym(a).m) + 1;
/** The last day of the month a YYYY-MM-01 is in. */
const monthEnd = (iso: string) => {
  const { y, m } = ym(iso);
  const d = new Date(y, m + 1, 0);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** "Nov to Dec 2026", "Nov 2026 to Feb 2027", "Nov 2026". */
function span(from: string, to: string): string {
  if (from === to) return monthLabel(from);
  return ym(from).y === ym(to).y ? `${MONTHS[ym(from).m]} to ${monthLabel(to)}` : `${monthLabel(from)} to ${monthLabel(to)}`;
}

/** Next 36 months, from this one. */
function monthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return Array.from({ length: 36 }, (_, i) => {
    const v = addMonths(first, i);
    return { value: v, label: monthLabel(v) };
  });
}

/** The kind's usual milestones, shared out of the budget and spread over the timeline. */
function templateMilestones(kind: ProjectKind, budget: number, start: string, finish: string): PlannedMilestone[] {
  const parts = KINDS.find((k) => k.value === kind)?.milestones ?? [];
  const total = parts.reduce((sum, p) => sum + p.share, 0);
  const months = Math.max(1, monthsBetween(start, finish));
  let given = 0;
  return parts.map((p, i) => {
    const last = i === parts.length - 1;
    const amount = last ? budget - given : Math.round((budget * p.share) / total / 100_000) * 100_000;
    given += amount;
    const a = Math.floor((i * months) / parts.length);
    const b = Math.max(a, Math.floor(((i + 1) * months) / parts.length) - 1);
    return { key: `m${i}`, title: p.title, description: p.description, amount: String(amount), from: addMonths(start, a), to: addMonths(start, b) };
  });
}

/**
 * When each milestone's money is in, at the monthly pace (on the 25th) plus
 * what's moved in now: how many days before the end of its work it's ready, at
 * the tightest, and when the first one is ready.
 */
function pace(milestones: PlannedMilestone[], monthly: number, now: number): { leadDays: number | null; firstReady: Date | null; short: string | null } {
  if (!milestones.length) return { leadDays: null, firstReady: null, short: null };
  let need = 0;
  let lead: number | null = null;
  let firstReady: Date | null = null;
  for (const m of milestones) {
    need += Number(m.amount) || 0;
    let ready: Date | null;
    if (now >= need) ready = new Date();
    else if (monthly <= 0) ready = null;
    else {
      const n = Math.ceil((need - now) / monthly);
      const d = new Date();
      if (d.getDate() > FUNDING_DAY) d.setMonth(d.getMonth() + 1);
      d.setMonth(d.getMonth() + n - 1, FUNDING_DAY);
      ready = d;
    }
    if (!ready) return { leadDays: null, firstReady, short: m.title };
    firstReady ??= ready;
    const due = new Date(monthEnd(m.to));
    const days = Math.floor((due.getTime() - ready.getTime()) / 86_400_000);
    if (days < 0) return { leadDays: null, firstReady, short: m.title };
    lead = lead === null ? days : Math.min(lead, days);
  }
  return { leadDays: lead, firstReady, short: null };
}

/** "is ready now", "is ready by mid-November". */
function readyBy(d: Date | null): string {
  if (!d) return '';
  if (d.getTime() - Date.now() < 86_400_000) return 'is ready now';
  const part = d.getDate() <= 10 ? 'early' : d.getDate() <= 20 ? 'mid' : 'late';
  return `is ready by ${part === 'mid' ? 'mid-' : `${part} `}${FULL_MONTHS[d.getMonth()]}`;
}

/**
 * Project wallet from the client prototype: PRW-01 what you're building →
 * PRW-02 budget and timeline → PRW-03 milestones → PRW-04 the builder → PRW-05
 * funders → PRW-06 when the builder gets paid → WCR-06 review → WCR-07.
 * Auto-saved as a draft.
 */
export function ProjectWalletSetupScreen(props: RootScreenProps<'ProjectWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <ProjectSetup {...props} draft={draft} />;
}

function ProjectSetup({ navigation, route, draft }: RootScreenProps<'ProjectWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const create = useCreateProject();

  const [name, setName] = useState(draft?.name ?? route.params?.name ?? '');
  const [form, setForm] = useState<ProjectForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<ProjectForm>) }));
  const set = (patch: Partial<ProjectForm>) => setForm((f) => ({ ...f, ...patch }));
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'start' | 'finish' | 'vendors' | 'add' | 'approvers' | 'retention' | 'from' | 'to'>(null);
  const [editing, setEditing] = useState<PlannedMilestone | null>(null);
  const [adding, setAdding] = useState(false);

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'project',
    name,
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(name.trim() || flow.index > 0),
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

  const kind = KINDS.find((k) => k.value === form.kind) ?? KINDS[0];
  const members = (family.data?.members ?? []).filter((m) => !['vendor', 'child'].includes(m.role));
  const own = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active');
  const main = own.find((w) => w.type === 'main');
  // PRW-02 "Already saved ₦1,200,000 in House Project": the biggest unlocked savings or project pot.
  const free = (w: Wallet) => parseFloat(w.available ?? '0');
  const saved = own.filter((w) => (w.type === 'savings' || w.type === 'project') && !w.lock && free(w) > 0).sort((a, b) => free(b) - free(a))[0] ?? null;
  const myName = firstName(me?.full_name ?? 'You');

  const budget = Number(form.budget) || 0;
  const buffer = form.buffer ? Math.round(budget * 0.05) : 0;
  const months = form.start && form.finish ? monthsBetween(form.start, form.finish) : 0;
  const planned = form.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const monthly = (Number(form.myMonthly) || 0) + form.funders.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const movedIn = form.moveIn && saved ? free(saved) : 0;
  const forecast = pace(form.milestones, monthly, movedIn);
  const coOwners = form.funders.filter((f) => f.role === 'co_owner');
  const vendorPhone = form.vendorPhone ? toE164(country.dial, form.vendorPhone) : '';
  const vendorName = form.vendorMode === 'directory' && form.vendor ? form.vendor.name : form.vendorMode === 'invite' && vendorPhone ? formatE164(vendorPhone) : null;
  const approversLine = form.approvers === 'all' && coOwners.length ? `${joinNames([myName, ...coOwners.map((c) => c.name)])} ${coOwners.length === 1 ? 'both' : 'all'} say yes` : 'You say yes';

  const validate = (s: Step): string | null => {
    if (s === 'type' && !name.trim()) return 'Give the project a name.';
    if (s === 'budget') {
      if (!(budget > 0)) return 'Enter the total budget.';
      if (!form.start || !form.finish) return 'Pick when it starts and finishes.';
      if (months < 1) return 'The finish has to be after the start.';
    }
    if (s === 'milestones') {
      if (!form.milestones.length) return 'Add at least one milestone.';
      if (planned > budget + buffer) return `The milestones add up to ${formatNaira(planned)}, more than the budget and buffer.`;
    }
    if (s === 'vendor' && form.vendorMode === 'directory' && !form.vendor) return 'Choose a builder from the directory, invite your own, or add one later.';
    if (s === 'vendor' && form.vendorMode === 'invite' && !isValidE164(vendorPhone)) return "Enter your builder's phone number.";
    if (s === 'funders') {
      if (form.funders.some((f) => !(Number(f.amount) > 0))) return 'Enter a monthly amount for each person.';
      if (Number(form.myMonthly) > 0 && !main) return 'You need a Main wallet to fund this from.';
    }
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    // PRW-03 starts from the kind's usual milestones.
    if (step === 'budget' && !form.milestones.length && form.start && form.finish) {
      set({ milestones: templateMilestones(form.kind, budget, form.start, form.finish) });
    }
    flow.next();
  };

  const submit = () => {
    for (const s of ['type', 'budget', 'milestones', 'vendor', 'funders'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    setError(null);
    autosave.stop();
    const mine = Number(form.myMonthly) || 0;
    create.mutate(
      {
        title: name.trim(),
        kind: form.kind,
        location: form.location.trim() || undefined,
        starts_on: form.start ?? undefined,
        finishes_on: form.finish ? monthEnd(form.finish) : undefined,
        budget: form.budget,
        buffer_percent: form.buffer ? 5 : 0,
        milestones: form.milestones.map((m) => ({ title: m.title, description: m.description || undefined, amount: m.amount, starts_on: m.from, ends_on: monthEnd(m.to) })),
        vendor:
          form.vendorMode === 'directory' && form.vendor
            ? { vendor_profile_id: form.vendor.id }
            : form.vendorMode === 'invite'
              ? { identifier: vendorPhone }
              : null,
        my_monthly: mine > 0 ? form.myMonthly : undefined,
        source_wallet_id: mine > 0 ? main?.id : undefined,
        funders: form.funders.map((f) => ({ ...(f.userId ? { user_id: f.userId } : { identifier: f.phone }), role: f.role, amount: f.amount })),
        move_in_wallet_id: form.moveIn && saved ? saved.id : undefined,
        release: { photos: form.photos, video: form.video, receipts: form.receipts, approvers: form.approvers, retention_percent: form.retention, retention_months: form.retentionMonths },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const first = form.milestones[0];
          const funderNames = form.funders.map((f) => f.name);
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: 'Your project is set up',
              subtitle: [
                vendorName ? `${vendorName} has been invited to accept the milestones.` : 'Pick a builder when you are ready.',
                first && forecast.firstReady ? `${first.title} money ${readyBy(forecast.firstReady)}.` : null,
              ]
                .filter(Boolean)
                .join(' '),
              caption: `of ${formatNaira(budget + buffer)} · ${form.milestones.length} milestone${form.milestones.length === 1 ? '' : 's'}`,
              events: [
                ...(vendorName ? [{ label: vendorName, title: 'Invite sent', sub: 'They confirm the milestones and amounts' }] : []),
                ...(funderNames.length ? [{ label: joinNames(funderNames), title: 'Asked to confirm their monthly amounts' }] : []),
                ...(first ? [{ label: 'Next milestone', title: `${first.title} · ${formatNaira(first.amount)}`, sub: `Starts ${FULL_MONTHS[ym(first.from).m]}` }] : []),
              ],
              openLabel: 'Open project',
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

  const header = { title: 'Project wallet', step: flow.index + 1, total: STEPS.length };
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
  const monthField = (label: string, value: string | null, which: 'start' | 'finish') => (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>{label}</Text>
      <Pressable
        onPress={() => setSheet(which)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ height: 56, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, paddingHorizontal: 16, justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: ptFont.medium, fontSize: 16, color: value ? pt.ink : pt.inkSubtle }}>{value ? monthLabel(value) : 'Pick a month'}</Text>
      </Pressable>
    </View>
  );

  // ------------------------------------------------------------ PRW-01
  if (step === 'type') {
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="What are you building?"
        subtitle="Pay builders and vendors in stages, only when work is done."
        gap={16}
        footer={footer('Continue')}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {KINDS.map((k) => {
            const on = form.kind === k.value;
            return (
              <Pressable
                key={k.value}
                onPress={() => {
                  selection();
                  // Another kind has other milestones.
                  set({ kind: k.value, milestones: form.kind === k.value ? form.milestones : [] });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${k.title}. ${k.subtitle}`}
                style={{
                  width: '48%',
                  flexGrow: 1,
                  minHeight: 120,
                  borderRadius: ptRadius.md,
                  borderWidth: 2,
                  borderColor: on ? pt.brand : 'transparent',
                  backgroundColor: on ? pt.brandSoft : pt.raised,
                  padding: 14,
                  gap: 10,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: on ? pt.brand : pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name={k.icon} size={18} color={on ? '#FFFFFF' : pt.brand} />
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: on ? pt.brand : pt.ink }}>{k.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{k.subtitle}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <PtField label="Project name" value={name} onChangeText={setName} placeholder="Our house in Enugu" maxLength={120} />
        <PtField label="Where" value={form.location} onChangeText={(t) => set({ location: t })} placeholder={kind.place} maxLength={120} />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ PRW-02
  if (step === 'budget') {
    const options = monthOptions();
    return (
      <PtStepScreen onBack={back} flow={header} title="Budget and timeline" gap={14} footer={footer('Continue')}>
        <View style={{ gap: 8 }}>
          <PtField
            label="Total budget"
            prefix="₦"
            value={groupAmountInput(form.budget)}
            onChangeText={(t) => set({ budget: sanitizeAmountInput(t), milestones: [] })}
            placeholder="18,500,000"
            keyboardType="decimal-pad"
          />
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
            {form.kind === 'event' ? "From your planner's quote" : "From your builder's quote (bill of quantities)"}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {monthField('Start', form.start, 'start')}
          {monthField('Finish', form.finish, 'finish')}
        </View>
        <PtPanel>
          <PtSwitchRow title="Add a 5% buffer" subtitle="For price changes in cement, rods and labour" value={form.buffer} onChange={(v) => set({ buffer: v })} />
        </PtPanel>
        {budget > 0 ? (
          <PtPanel>
            <PtReviewRow
              label={form.buffer ? 'Budget with buffer' : 'Budget'}
              value={formatNaira(budget + buffer)}
              sub={months > 0 ? `${months} month${months === 1 ? '' : 's'} · about ${formatNaira(Math.round((budget + buffer) / months / 10_000) * 10_000)} a month` : null}
              last={!saved}
            />
            {saved ? <PtReviewRow label="Already saved" value={`${formatNaira(free(saved))} in ${saved.name}`} sub="Move it in at the end" last /> : null}
          </PtPanel>
        ) : null}
        <PtOptionSheet
          visible={sheet === 'start' || sheet === 'finish'}
          title={sheet === 'start' ? 'Start' : 'Finish'}
          options={sheet === 'finish' && form.start ? options.filter((o) => o.value >= (form.start ?? '')) : options}
          value={sheet === 'start' ? form.start : form.finish}
          onPick={(v) => {
            if (sheet === 'start') set({ start: v, finish: form.finish && form.finish < v ? null : form.finish, milestones: [] });
            else set({ finish: v, milestones: [] });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ PRW-03
  if (step === 'milestones') {
    const options = monthOptions();
    const save = () => {
      if (!editing) return;
      if (!editing.title.trim() || !(Number(editing.amount) > 0)) return;
      const exists = form.milestones.some((m) => m.key === editing.key);
      set({ milestones: exists ? form.milestones.map((m) => (m.key === editing.key ? editing : m)) : [...form.milestones, editing] });
      setEditing(null);
    };
    return (
      <PtStepScreen onBack={back} flow={header} title="Break it into milestones" subtitle="Each one is paid only when the work is done and checked." gap={14} footer={footer('Continue')}>
        {form.milestones.length ? (
          <PtPanel>
            {form.milestones.map((m, i) => (
              <React.Fragment key={m.key}>
                {i ? <PtDivider /> : null}
                <Pressable
                  onPress={() => setEditing(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${m.title}`}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 }}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.brand }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{m.title}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{[m.description, span(m.from, m.to)].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(m.amount)}</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </PtPanel>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>
            {form.milestones.length} milestone{form.milestones.length === 1 ? '' : 's'}
          </Text>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: planned > budget + buffer ? pt.danger : pt.ink }}>
            {formatNaira(planned)}
            {buffer ? ` + ${formatNaira(buffer)} buffer` : ''}
          </Text>
        </View>
        <PtAddRow
          label="Add a milestone"
          onPress={() => {
            const last = form.milestones[form.milestones.length - 1];
            const from = last ? addMonths(last.to, 1) : form.start ?? options[0].value;
            setEditing({ key: `m${Date.now()}`, title: '', description: '', amount: String(Math.max(0, budget - planned) || ''), from, to: from });
          }}
        />
        <PtSheet
          visible={editing !== null}
          title={editing && form.milestones.some((m) => m.key === editing.key) ? 'Edit the milestone' : 'Add a milestone'}
          onClose={() => setEditing(null)}
          footer={
            <View style={{ gap: 10 }}>
              <PtButton title="Save" onPress={save} />
              {editing && form.milestones.some((m) => m.key === editing.key) ? (
                <PtButton
                  title="Remove"
                  variant="ghost"
                  onPress={() => {
                    set({ milestones: form.milestones.filter((m) => m.key !== editing.key) });
                    setEditing(null);
                  }}
                />
              ) : null}
            </View>
          }
        >
          {editing ? (
            <View style={{ gap: 12 }}>
              <PtField label="Milestone" value={editing.title} onChangeText={(t) => setEditing({ ...editing, title: t })} placeholder="Foundation" maxLength={100} />
              <PtField label="What it covers" value={editing.description} onChangeText={(t) => setEditing({ ...editing, description: t })} placeholder="Setting out, excavation, footing" maxLength={200} />
              <PtField label="Amount" prefix="₦" value={groupAmountInput(editing.amount)} onChangeText={(t) => setEditing({ ...editing, amount: sanitizeAmountInput(t) })} keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['from', 'to'] as const).map((w) => (
                  <View key={w} style={{ flex: 1, gap: 8 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>{w === 'from' ? 'From' : 'To'}</Text>
                    <Pressable
                      onPress={() => setSheet(w)}
                      accessibilityRole="button"
                      accessibilityLabel={w === 'from' ? 'From month' : 'To month'}
                      style={{ height: 52, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, paddingHorizontal: 14, justifyContent: 'center' }}
                    >
                      <Text style={{ fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{monthLabel(editing[w])}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </PtSheet>
        <PtOptionSheet
          visible={editing !== null && (sheet === 'from' || sheet === 'to')}
          title={sheet === 'from' ? 'From' : 'To'}
          options={sheet === 'to' && editing ? options.filter((o) => o.value >= editing.from) : options}
          value={editing ? (sheet === 'from' ? editing.from : editing.to) : null}
          onPick={(v) => {
            if (editing) setEditing(sheet === 'from' ? { ...editing, from: v, to: editing.to < v ? v : editing.to } : { ...editing, to: v });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ PRW-04
  if (step === 'vendor') {
    return (
      <PtStepScreen onBack={back} flow={header} title="Who is doing the work?" gap={12} footer={footer('Continue')}>
        {form.vendorMode === 'directory' && form.vendor ? <VendorCard profileId={form.vendor.id} onPress={() => setSheet('vendors')} /> : null}
        <PtChoiceCard
          icon="search"
          title="Find in the vendor directory"
          subtitle={form.kind === 'event' ? 'Verified caterers, planners, decorators.' : 'Verified builders, caterers, planners.'}
          selected={form.vendorMode === 'directory' && !form.vendor}
          onPress={() => {
            set({ vendorMode: 'directory' });
            setSheet('vendors');
          }}
        />
        <PtChoiceCard icon="send" title="Invite my own builder" subtitle="We check their account and company." selected={form.vendorMode === 'invite'} onPress={() => set({ vendorMode: 'invite', vendor: null })} />
        {form.vendorMode === 'invite' ? (
          <PtPhoneField label="Their phone number" country={country} onChangeCountry={setCountry} value={form.vendorPhone} onChange={(d) => set({ vendorPhone: d })} />
        ) : null}
        <PtChoiceCard icon="clock" title="Add later" subtitle="Save money now, pick a vendor later." selected={form.vendorMode === 'later'} onPress={() => set({ vendorMode: 'later', vendor: null })} />
        <VendorPickerSheet
          visible={sheet === 'vendors'}
          category={kind.category}
          onPick={(v) => {
            set({ vendorMode: 'directory', vendor: { id: v.id, name: v.business_name } });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ PRW-05
  if (step === 'funders') {
    const notAdded = members.filter((m) => !form.funders.some((f) => f.userId === m.id));
    const weeks = forecast.leadDays !== null ? Math.max(1, Math.round(forecast.leadDays / 7)) : null;
    return (
      <PtStepScreen onBack={back} flow={header} title="Who is funding it?" gap={14} footer={footer('Continue')}>
        <PtPanel>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{myName} (you)</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>From Main · monthly</Text>
            </View>
            <PtAmountBox value={form.myMonthly} onChange={(v) => set({ myMonthly: v })} label="Your monthly amount" />
          </View>
          {form.funders.map((f, i) => (
            <React.Fragment key={f.key}>
              <PtDivider />
              <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <PtAvatar initials={f.phone && !f.name ? '+' : initials(f.full ?? f.name)} tone={f.phone ? 'gold' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => set({ funders: form.funders.filter((x) => x.key !== f.key) })}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${f.name}`}
                >
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                    {f.name || formatE164(f.phone ?? '')}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {f.phone ? 'Invite by phone · monthly' : 'From their Main · monthly'} · tap to remove
                  </Text>
                </Pressable>
                <PtAmountBox value={f.amount} onChange={(v) => set({ funders: form.funders.map((x) => (x.key === f.key ? { ...x, amount: v } : x)) })} label={`Monthly amount for ${f.name}`} />
              </View>
            </React.Fragment>
          ))}
          {adding ? (
            <>
              <PtDivider />
              <PtNewPersonForm
                withAmount
                nameRequired
                taken={[...form.funders.map((f) => f.phone ?? ''), me?.phone ?? '']}
                onCancel={() => setAdding(false)}
                onAdd={(np) => {
                  set({ funders: [...form.funders, { key: np.phone, phone: np.phone, name: np.name, role: 'contributor', amount: np.amount ?? '' }] });
                  setAdding(false);
                }}
              />
            </>
          ) : null}
        </PtPanel>
        {!adding ? <PtAddRow label="Add someone" onPress={() => setSheet('add')} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
          <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>Every month</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{formatNaira(monthly)}</Text>
        </View>
        {saved ? (
          <PtPanel>
            <PtSwitchRow title={`Move in ${saved.name} savings`} subtitle={`${formatNaira(free(saved))} now`} value={form.moveIn} onChange={(v) => set({ moveIn: v })} />
          </PtPanel>
        ) : null}
        {form.milestones.length && (monthly > 0 || movedIn > 0) ? (
          weeks !== null ? (
            <PtNote tone="success">At this pace you'll have each milestone's money about {weeks} week{weeks === 1 ? '' : 's'} before it's due.</PtNote>
          ) : (
            <PtNote tone="attention">At this pace the money for {forecast.short} won't be in by the time it's due. Add more each month, or move its dates.</PtNote>
          )
        ) : null}
        <PtOptionSheet
          visible={sheet === 'add'}
          title="Add someone"
          options={[...notAdded.map((m) => ({ value: m.id, label: m.name, hint: m.email })), { value: -1, label: 'Someone new', hint: 'Invite them by phone number' }]}
          value={null}
          onPick={(id) => {
            setSheet(null);
            if (id === -1) {
              setAdding(true);
              return;
            }
            const m = members.find((x) => x.id === id);
            if (!m) return;
            const role = ['owner', 'co_owner', 'admin'].includes(m.role) ? 'co_owner' : 'contributor';
            set({ funders: [...form.funders, { key: `u${id}`, userId: id, name: firstName(m.name), full: m.name, role, amount: '' }] });
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ PRW-06
  if (step === 'release') {
    const sends: { key: 'photos' | 'video' | 'receipts'; title: string; sub?: string }[] = [
      { key: 'photos', title: 'Photos from the site', sub: 'With date and location' },
      { key: 'video', title: 'A short video walk-through' },
      { key: 'receipts', title: 'Receipts for materials', sub: 'Cement, rods, roofing sheets' },
    ];
    return (
      <PtStepScreen onBack={back} flow={header} title="When does the builder get paid?" subtitle="For every milestone." gap={12} footer={footer('Review')}>
        <PtGroupLabel>The builder sends</PtGroupLabel>
        <PtPanel>
          {sends.map((s, i) => (
            <React.Fragment key={s.key}>
              {i ? <PtDivider /> : null}
              <Pressable
                onPress={() => {
                  selection();
                  set({ [s.key]: !form[s.key] } as Partial<ProjectForm>);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: form[s.key] }}
                accessibilityLabel={s.title}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }}>{s.title}</Text>
                  {s.sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{s.sub}</Text> : null}
                </View>
                <PtCheckbox checked={form[s.key]} />
              </Pressable>
            </React.Fragment>
          ))}
        </PtPanel>
        <PtGroupLabel>Then</PtGroupLabel>
        <PtPanel>
          <PtReviewRow label="Approvals" value={approversLine} onEdit={coOwners.length ? () => setSheet('approvers') : undefined} />
          <PtReviewRow label="Site inspection" value="Not available yet" sub="We'll add an inspection partner later" />
          <PtReviewRow
            label="Held back"
            value={form.retention ? `${form.retention}% until ${form.retentionMonths} month${form.retentionMonths === 1 ? '' : 's'} after handover` : 'Nothing held back'}
            sub={form.retention ? 'Covers repairs found later' : null}
            onEdit={() => setSheet('retention')}
            last
          />
        </PtPanel>
        <PtOptionSheet
          visible={sheet === 'approvers'}
          title="Who says yes to each payment"
          options={[
            { value: 'all', label: `${joinNames([myName, ...coOwners.map((c) => c.name)])} ${coOwners.length === 1 ? 'both' : 'all'} say yes` },
            { value: 'owner', label: 'Just me' },
          ]}
          value={form.approvers}
          onPick={(v) => {
            set({ approvers: v as 'all' | 'owner' });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'retention'}
          title="Held back"
          options={[
            { value: '10-3', label: '10% until 3 months after handover' },
            { value: '10-6', label: '10% until 6 months after handover' },
            { value: '5-3', label: '5% until 3 months after handover' },
            { value: '0-3', label: 'Nothing held back' },
          ]}
          value={`${form.retention}-${form.retentionMonths}`}
          onPick={(v) => {
            const [p, mo] = v.split('-').map(Number);
            set({ retention: p, retentionMonths: mo });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const sends = [form.photos ? 'Photos' : null, form.video ? 'video' : null, form.receipts ? 'receipts' : null].filter(Boolean) as string[];
  return (
    <PtStepScreen onBack={back} flow={header} title="Review the project" subtitle="Check everything. You can edit before you create." gap={16} footer={footer('Create project', submit, create.isPending)}>
      <PtPanel>
        <PtReviewRow label="Project" value={name.trim()} sub={form.location.trim() || kind.title} onEdit={() => flow.goTo('type')} />
        <PtReviewRow
          label="Budget"
          value={`${formatNaira(budget + buffer)}${buffer ? ' with 5% buffer' : ''}`}
          sub={form.start && form.finish ? `${monthLabel(form.start)} to ${monthLabel(form.finish)}` : null}
          onEdit={() => flow.goTo('budget')}
        />
        <PtReviewRow
          label="Milestones"
          value={form.milestones.length > 1 ? `${form.milestones.length}, from ${form.milestones[0].title} to ${form.milestones[form.milestones.length - 1].title}` : form.milestones[0]?.title ?? 'None'}
          onEdit={() => flow.goTo('milestones')}
        />
        <PtReviewRow label="Builder" value={vendorName ? `${vendorName}${form.vendorMode === 'directory' ? ' · verified' : ' · invited'}` : 'Add later'} onEdit={() => flow.goTo('vendor')} />
        <PtReviewRow
          label="Funding"
          value={`${formatNaira(monthly)} a month from ${form.funders.length + 1} ${form.funders.length ? 'people' : 'person'}`}
          sub={movedIn ? `+ ${formatNaira(movedIn)} moved in now` : null}
          onEdit={() => flow.goTo('funders')}
        />
        <PtReviewRow
          label="Release"
          value={`${sends.length ? `${joinNames(sends, true)}, ` : ''}${form.approvers === 'all' && coOwners.length ? 'both approve' : 'you approve'}`}
          sub={form.retention ? `${form.retention}% held until ${form.retentionMonths} months after handover` : null}
          onEdit={() => flow.goTo('release')}
          last
        />
      </PtPanel>
    </PtStepScreen>
  );
}

/** PRW-04 the chosen builder: name, place, verified, and their record on Patriai. */
function VendorCard({ profileId, onPress }: { profileId: number; onPress: () => void }) {
  const vendor = useVendor(profileId);
  const v = vendor.data;
  const stat = (n: number | undefined, label: string) => (
    <View style={{ flex: 1, backgroundColor: pt.surface, borderRadius: ptRadius.sm, paddingVertical: 10, alignItems: 'center' }}>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{n ?? '–'}</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{label}</Text>
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={v ? `${v.business_name}, change` : 'Builder'}
      style={{ borderRadius: ptRadius.md, borderWidth: 2, borderColor: pt.brand, backgroundColor: pt.raised, padding: 16, gap: 14 }}
    >
      {v ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PtAvatar initials={v.initials} tone="gold" size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{v.business_name}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={2}>
                {v.location || v.name}
              </Text>
            </View>
            {v.verified ? <PtChip label="Verified" tone="success" icon="check" /> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {stat(v.stats?.projects, v.stats?.projects === 1 ? 'project' : 'projects')}
            {stat(v.stats?.milestones_paid, v.stats?.milestones_paid === 1 ? 'milestone paid' : 'milestones paid')}
            {stat(v.stats?.open_disputes, v.stats?.open_disputes === 1 ? 'open dispute' : 'open disputes')}
          </View>
        </>
      ) : (
        <ActivityIndicator color={pt.brand} />
      )}
    </Pressable>
  );
}

/** "Find in the vendor directory": search, verified first. */
function VendorPickerSheet({ visible, category, onPick, onClose }: { visible: boolean; category: string; onPick: (v: VendorListing) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const vendors = useVendors(q, category);
  const list = vendors.data?.pages.flatMap((p) => p.vendors) ?? [];
  return (
    <PtSheet visible={visible} title="Vendor directory" subtitle="Verified builders, caterers, planners." onClose={onClose}>
      <View style={{ gap: 12 }}>
        <PtField label="Search" value={q} onChangeText={setQ} placeholder="Name or town" />
        {vendors.isLoading ? (
          <ActivityIndicator color={pt.brand} />
        ) : list.length ? (
          <PtPanel>
            {list.map((v, i) => (
              <React.Fragment key={v.id}>
                {i ? <PtDivider /> : null}
                <Pressable
                  onPress={() => onPick(v)}
                  accessibilityRole="button"
                  accessibilityLabel={v.business_name}
                  style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                >
                  <PtAvatar initials={v.initials} tone="gold" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{v.business_name}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                      {[v.location, v.projects_completed ? `${v.projects_completed} projects done` : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {v.verified ? <Feather name="check-circle" size={18} color={pt.brand} /> : null}
                </Pressable>
              </React.Fragment>
            ))}
          </PtPanel>
        ) : (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>No vendors found. Invite your own builder instead.</Text>
        )}
      </View>
    </PtSheet>
  );
}
