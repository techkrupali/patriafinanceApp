import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtAddRow, PtNewPersonForm } from '../../components/pt/PtPeople';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtPanel, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { CharityPickerSheet } from '../../components/savings/CharityPickerSheet';
import { PayeePickerSheet, type Payee } from '../../components/giving/PayeePickerSheet';
import { useCreateWallet, useFamily, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatMoney, formatNaira, formatYmd, groupAmountInput, initials, parseYmd, sanitizeAmountInput, toYmd, ymdMonthsFromNow } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { joinNames, ordinal } from '../../lib/goalPlan';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { GoalKind, OrganisationKind, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'type' | 'target' | 'plan' | 'people' | 'lock' | 'review';
const STEPS: Step[] = ['type', 'target', 'plan', 'people', 'lock', 'review'];

type Frequency = 'weekly' | 'monthly' | 'one_off';
type Role = 'co_owner' | 'contributor' | 'viewer';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** GLW-01 goal types: their usual name, what the due date is, and who gets paid directly. */
const KINDS: { value: GoalKind; title: string; icon: React.ComponentProps<typeof Feather>['name']; name: string; forHint: string; dueHint: string; payTo: string; payKind?: OrganisationKind }[] = [
  { value: 'school_fees', title: 'School fees', icon: 'book-open', name: `School fees ${new Date().getFullYear() + 1}`, forHint: 'Tolu and Kamsi, second term', dueHint: 'When school resumes', payTo: 'Pay the school directly', payKind: 'school' },
  { value: 'rent', title: 'Rent', icon: 'home', name: 'House rent', forHint: 'Flat in Lekki', dueHint: 'Your rent renewal date', payTo: 'Pay the landlord directly' },
  { value: 'car', title: 'A car', icon: 'truck', name: 'A new car', forHint: 'Deposit for a Corolla', dueHint: 'When you want to buy', payTo: 'Pay the seller directly' },
  { value: 'baby', title: 'A new baby', icon: 'smile', name: 'Our new baby', forHint: 'Hospital, baby things and the naming', dueHint: 'Your due date', payTo: 'Pay the hospital directly' },
  { value: 'travel', title: 'Travel', icon: 'navigation', name: 'Our trip', forHint: 'Christmas in Enugu', dueHint: 'When you travel', payTo: 'Pay the travel agent directly' },
  { value: 'wedding', title: 'Wedding', icon: 'heart', name: 'Our wedding', forHint: 'Venue, aso ebi, food', dueHint: 'The big day', payTo: 'Pay the venue directly' },
];

/** Someone saving toward the goal: a family member (account) or a phone number. */
interface Person {
  key: string;
  userId?: number;
  phone?: string;
  name: string;
  full?: string;
  role: Role;
  amount: string;
  /** A one-off gift instead of a share each period. */
  gift: boolean;
}

interface GoalForm {
  kind: GoalKind;
  forWhom: string;
  target: string;
  dueDate: string | null;
  lines: { key: string; name: string; amount: string }[];
  frequency: Frequency;
  myAmount: string;
  monthDay: number;
  weekDay: number;
  people: Person[];
  remindBefore: boolean;
  nudge: boolean;
  link: boolean;
  lock: 'target' | 'none';
  payDirect: boolean;
  payee: Payee | null;
  earlyApproval: boolean;
  charity: { id: number; name: string } | null;
}

const EMPTY: GoalForm = {
  kind: 'school_fees',
  forWhom: '',
  target: '',
  dueDate: null,
  lines: [],
  frequency: 'monthly',
  myAmount: '',
  monthDay: 26,
  weekDay: 1,
  people: [],
  remindBefore: true,
  nudge: true,
  link: true,
  lock: 'target',
  payDirect: false,
  payee: null,
  earlyApproval: true,
  charity: null,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "6 Jan" from a YYYY-MM-DD, `days` earlier. */
function dayBefore(ymd: string, days: number): string {
  const d = parseYmd(ymd) ?? new Date();
  d.setDate(d.getDate() - days);
  return toYmd(d);
}

const short = (ymd: string | null) => (ymd ? formatYmd(ymd).replace(/ \d{4}$/, '') : '');

/** WCR-06 "3 lines: fees, fees, books": "Tolu · JSS3 fees" → fees, "Books and uniforms" → books. */
const lineWord = (name: string) => (name.includes('·') ? name.split('·').pop()!.trim().split(/\s+/).pop()! : name.trim().split(/\s+/)[0]).toLowerCase();

/** The save dates from today up to the due date (monthly on the day, or weekly on the weekday). */
function saveDates(f: GoalForm): Date[] {
  const due = parseYmd(f.dueDate);
  if (!due || f.frequency === 'one_off') return [];
  const out: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 800 && d.getTime() <= due.getTime() && out.length < 120; i++) {
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    if (f.frequency === 'monthly' ? d.getDate() === f.monthDay : iso === f.weekDay) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Goal wallet from the client prototype: GLW-01 what the goal is → GLW-02 how
 * much, by when, what it covers → GLW-03 each person's amount (or a one-off
 * gift) → GLW-04 roles, reminders and the contribution link → GLW-05 lock, pay
 * the school directly, early withdrawal, if it's cancelled → WCR-06 → WCR-07.
 * Auto-saved as a draft.
 */
export function GoalWalletSetupScreen(props: RootScreenProps<'GoalWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <GoalSetup {...props} draft={draft} />;
}

function GoalSetup({ navigation, route, draft }: RootScreenProps<'GoalWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const create = useCreateWallet();

  const [name, setName] = useState(draft?.name ?? KINDS[0].name);
  const [form, setForm] = useState<GoalForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<GoalForm>) }));
  const set = (patch: Partial<GoalForm>) => setForm((f) => ({ ...f, ...patch }));
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'due' | 'add' | 'payee' | 'charity' | 'link' | 'day' | { role: string }>(null);
  const [adding, setAdding] = useState(false);
  const [line, setLine] = useState<{ key?: string; name: string; amount: string } | null>(null);

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'goal',
    name,
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(form.target || flow.index > 0),
  });

  // GIV-07 came back with a new account to pay directly.
  const added = route.params?.addedAccountId;
  useEffect(() => {
    if (!added) return;
    setForm((f) => ({ ...f, payDirect: true, payee: { savedAccountId: added, name: 'New account' } }));
    navigation.setParams({ addedAccountId: undefined });
  }, [added, navigation]);

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
  const members = (family.data?.members ?? []).filter((m) => m.role !== 'vendor');
  const main = (wallets.data ?? []).find((w) => w.type === 'main' && w.my_role === 'owner');
  const myName = firstName(me?.full_name ?? 'You');
  const target = Number(form.target) || 0;
  const dates = saveDates(form);
  const periodic = form.people.filter((p) => !p.gift);
  const gifts = form.people.filter((p) => p.gift);
  const perSave = (Number(form.myAmount) || 0) + periodic.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const giftTotal = gifts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const oneOff = form.frequency === 'one_off';
  const total = oneOff ? (Number(form.myAmount) || 0) + form.people.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) : perSave * dates.length + giftTotal;
  const lastSave = dates[dates.length - 1];
  const onTrack = target > 0 && total >= target;
  const due = parseYmd(form.dueDate);
  const weeks = due ? Math.max(1, Math.round((due.getTime() - Date.now()) / (7 * 86_400_000))) : null;
  const dayLabel = form.frequency === 'monthly' ? ordinal(form.monthDay) : DAYS[form.weekDay];
  const lockUntil = form.dueDate ? dayBefore(form.dueDate, 3) : null;
  const payOn = form.dueDate ? dayBefore(form.dueDate, 2) : null;
  const coOwners = form.people.filter((p) => p.role === 'co_owner');
  const linesTotal = form.lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const addFamily = (id: number) => {
    const m = members.find((x) => x.id === id);
    if (!m || form.people.some((p) => p.userId === id)) return;
    const role: Role = ['owner', 'co_owner', 'admin'].includes(m.role) ? 'co_owner' : 'contributor';
    set({ people: [...form.people, { key: `u${id}`, userId: id, name: firstName(m.name), full: m.name, role, amount: form.myAmount, gift: role !== 'co_owner' }] });
  };

  const validate = (s: Step): string | null => {
    if (s === 'type' && !name.trim()) return 'Give the goal a name.';
    if (s === 'target') {
      if (!(target > 0)) return 'Enter how much you need.';
      if (!due || due.getTime() <= Date.now()) return 'Pick a due date after today.';
      if (linesTotal > target) return `The lines add up to ${formatNaira(linesTotal)}, more than the target.`;
    }
    if (s === 'plan') {
      if (!(Number(form.myAmount) > 0) && form.people.length === 0) return 'Enter how much you put in.';
      if (form.people.some((p) => !(Number(p.amount) > 0))) return 'Enter an amount for each person.';
      if (!main && (Number(form.myAmount) > 0)) return 'You need a Main wallet to save from.';
      if (oneOff && main && Number(form.myAmount) > parseFloat(main.balance)) return `${main.name} only has ${formatMoney(main.balance)}.`;
    }
    if (s === 'lock' && form.payDirect && !form.payee) return `Choose who to pay directly, or turn it off.`;
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    flow.next();
  };

  const submit = () => {
    for (const s of ['type', 'target', 'plan', 'lock'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    setError(null);
    autosave.stop();
    const mine = Number(form.myAmount) > 0;
    create.mutate(
      {
        type: 'goal',
        name: name.trim(),
        purpose: form.kind,
        description: form.forWhom.trim() || undefined,
        mode: form.people.length ? 'shared' : 'private',
        target_amount: form.target,
        target_date: form.dueDate ?? undefined,
        source_wallet_id: mine && main ? main.id : undefined,
        initial_deposit: oneOff && mine ? form.myAmount : undefined,
        savings_plan: {
          schedule: !oneOff && mine,
          amount: !oneOff && mine ? form.myAmount : undefined,
          frequency: form.frequency === 'weekly' ? 'weekly' : 'monthly',
          day_of_week: form.frequency === 'weekly' ? form.weekDay : undefined,
          day_of_month: form.frequency === 'monthly' ? form.monthDay : undefined,
          auto_save: !oneOff && mine,
          allow_contributor_edit: true,
          missed_policy: 'retry',
        },
        members: form.people.map((p) => ({
          ...(p.userId ? { user_id: p.userId } : { identifier: p.phone }),
          role: p.role,
          pledge: p.amount,
          pledge_kind: oneOff || p.gift ? ('gift' as const) : ('period' as const),
        })),
        lock: { mode: form.lock === 'target' ? 'target' : 'none', until: form.lock === 'target' ? lockUntil ?? undefined : undefined, early_break: true, approval: form.earlyApproval, charity_id: form.charity?.id ?? null },
        goal: {
          kind: form.kind,
          for: form.forWhom.trim() || undefined,
          lines: form.lines.map((l) => ({ name: l.name, amount: l.amount })),
          link: form.link,
          reminders: { before_save: form.remindBefore, nudge: form.nudge },
          payout:
            form.payDirect && form.payee && payOn
              ? { ...('organisationId' in form.payee ? { organisation_id: form.payee.organisationId } : { saved_account_id: form.payee.savedAccountId }), run_on: payOn }
              : null,
        },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const first = dates[0];
          const invited = form.people.map((p) => p.name);
          const link = res.wallet.goal?.link ?? null;
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: `${name.trim()} is ready`,
              subtitle: [
                oneOff ? (mine ? `${formatNaira(form.myAmount)} moved from ${main?.name ?? 'Main'}.` : null) : mine && first ? `Your first ${formatNaira(form.myAmount)} moves on ${first.getDate()} ${MONTHS[first.getMonth()]}.` : null,
                invited.length ? `${joinNames(invited)} ${invited.length === 1 ? 'has' : 'have'} been invited.` : null,
              ]
                .filter(Boolean)
                .join(' '),
              caption: `of ${formatNaira(target)}${form.dueDate ? ` · due ${short(form.dueDate)}` : ''}`,
              events: [
                ...form.people.map((p) => ({
                  label: p.name,
                  title: p.gift || oneOff ? `Asked for their ${formatNaira(p.amount)} gift` : `Asked to confirm ${formatNaira(p.amount)} a ${form.frequency === 'weekly' ? 'week' : 'month'}`,
                  sub: p.gift || oneOff ? 'They can pay from anywhere, by bank transfer or the link' : 'Sent just now',
                })),
                ...(link ? [{ label: 'Contribution link', title: 'Ready to share', sub: 'WhatsApp, SMS or copy' }] : []),
              ],
              share: link ? { label: 'Share the contribution link', message: `Help us reach ${name.trim()}: add money here ${link}` } : undefined,
              openLabel: 'Open goal',
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

  const header = { title: 'Goal wallet', step: flow.index + 1, total: STEPS.length };
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
  const personRow = (p: Person, i: number, right: React.ReactNode, sub: string, onPress?: () => void) => (
    <React.Fragment key={p.key}>
      <PtDivider />
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={p.name} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        <PtAvatar initials={p.phone && !p.name ? '+' : initials(p.full ?? p.name)} tone={p.phone ? 'gold' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
            {p.name || formatE164(p.phone ?? '')}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={2}>
            {sub}
          </Text>
        </View>
        {right}
      </Pressable>
    </React.Fragment>
  );

  // ------------------------------------------------------------ GLW-01
  if (step === 'type') {
    return (
      <PtStepScreen onBack={back} flow={header} title="What is the goal?" gap={16} footer={footer('Continue')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {KINDS.map((k) => {
            const on = form.kind === k.value;
            return (
              <Pressable
                key={k.value}
                onPress={() => {
                  selection();
                  if (KINDS.some((x) => x.name === name.trim()) || !name.trim()) setName(k.name);
                  set({ kind: k.value });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={k.title}
                style={{
                  width: '48%',
                  flexGrow: 1,
                  minHeight: 112,
                  borderRadius: ptRadius.md,
                  borderWidth: 2,
                  borderColor: on ? pt.brand : 'transparent',
                  backgroundColor: on ? pt.brandSoft : pt.raised,
                  padding: 14,
                  gap: 14,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: on ? pt.brand : pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={k.icon} size={17} color={on ? '#FFFFFF' : pt.brand} />
                </View>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: on ? pt.brand : pt.ink }}>{k.title}</Text>
              </Pressable>
            );
          })}
        </View>
        <PtField label="Goal name" value={name} onChangeText={setName} placeholder={kind.name} maxLength={100} />
        <PtField label="For (optional)" value={form.forWhom} onChangeText={(t) => set({ forWhom: t })} placeholder={kind.forHint} maxLength={120} />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GLW-02
  if (step === 'target') {
    return (
      <PtStepScreen onBack={back} flow={header} title="How much, and by when?" gap={14} footer={footer('Continue')}>
        <PtField label="Target" prefix="₦" value={groupAmountInput(form.target)} onChangeText={(t) => set({ target: sanitizeAmountInput(t) })} placeholder="850,000" keyboardType="decimal-pad" />
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>Due date</Text>
          <Pressable
            onPress={() => setSheet('due')}
            accessibilityRole="button"
            accessibilityLabel="Due date"
            style={{ height: 56, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, paddingHorizontal: 16, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: ptFont.medium, fontSize: 16, color: form.dueDate ? pt.ink : pt.inkSubtle }}>{form.dueDate ? formatYmd(form.dueDate) : 'Pick a date'}</Text>
          </Pressable>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{form.forWhom.trim() ? `${kind.dueHint} · ${form.forWhom.trim()}` : kind.dueHint}</Text>
        </View>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>What it covers (optional)</PtGroupLabel>
          {form.lines.length ? (
            <PtPanel>
              {form.lines.map((l, i) => (
                <PtReviewRow
                  key={l.key}
                  label={l.name}
                  value={formatNaira(l.amount)}
                  onEdit={() => setLine({ key: l.key, name: l.name, amount: l.amount })}
                  last={i === form.lines.length - 1}
                />
              ))}
            </PtPanel>
          ) : null}
          {line ? (
            <PtPanel>
              <View style={{ gap: 12, paddingVertical: 14 }}>
                <PtField label="What" value={line.name} onChangeText={(t) => setLine({ ...line, name: t })} placeholder="Books and uniforms" maxLength={60} autoFocus />
                <PtField label="Amount" prefix="₦" value={groupAmountInput(line.amount)} onChangeText={(t) => setLine({ ...line, amount: sanitizeAmountInput(t) })} placeholder="100,000" keyboardType="decimal-pad" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PtButton
                    title={line.key ? 'Remove' : 'Cancel'}
                    variant="secondary"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => {
                      if (line.key) set({ lines: form.lines.filter((x) => x.key !== line.key) });
                      setLine(null);
                    }}
                  />
                  <PtButton
                    title={line.key ? 'Save' : 'Add'}
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => {
                      if (!line.name.trim() || !(Number(line.amount) > 0)) return;
                      const row = { key: line.key ?? `l${Date.now()}`, name: line.name.trim(), amount: line.amount };
                      set({ lines: line.key ? form.lines.map((x) => (x.key === line.key ? row : x)) : [...form.lines, row] });
                      setLine(null);
                    }}
                  />
                </View>
              </View>
            </PtPanel>
          ) : (
            <PtAddRow label="Add a line" onPress={() => setLine({ name: '', amount: '' })} />
          )}
        </View>
        <PtDateSheet
          visible={sheet === 'due'}
          title="Due date"
          value={form.dueDate ?? ymdMonthsFromNow(3)}
          minYear={new Date().getFullYear()}
          maxYear={new Date().getFullYear() + 10}
          doneLabel="Done"
          onDone={(ymd) => {
            set({ dueDate: ymd });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GLW-03
  if (step === 'plan') {
    const notAdded = members.filter((m) => !form.people.some((p) => p.userId === m.id));
    const when = oneOff ? 'once' : `${dayLabel}`;
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="How will you get there?"
        subtitle={weeks ? `${formatNaira(target)} in ${weeks} week${weeks === 1 ? '' : 's'}.` : undefined}
        gap={14}
        footer={footer('Continue')}
      >
        <PtSegmented
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'one_off', label: 'One-off' },
          ]}
          value={form.frequency}
          onChange={(v) => set({ frequency: v as Frequency })}
        />
        <PtPanel>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <Pressable onPress={() => !oneOff && setSheet('day')} accessibilityRole="button" accessibilityLabel="When you save" style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{myName}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{oneOff ? 'Now, from Main' : `Auto-debit from Main · ${when}`}</Text>
            </Pressable>
            <PtAmountBox value={form.myAmount} onChange={(v) => set({ myAmount: v })} label="Your amount" />
          </View>
          {form.people.map((p, i) =>
            personRow(
              p,
              i,
              <PtAmountBox value={p.amount} onChange={(v) => set({ people: form.people.map((x) => (x.key === p.key ? { ...x, amount: v } : x)) })} label={`Amount for ${p.name}`} />,
              oneOff || p.gift ? 'One-off gift · tap to make it regular' : `Auto-debit from their Main · ${when}`,
              oneOff ? undefined : () => set({ people: form.people.map((x) => (x.key === p.key ? { ...x, gift: !x.gift } : x)) }),
            ),
          )}
          {adding ? (
            <>
              <PtDivider />
              <PtNewPersonForm
                withAmount
                nameRequired
                taken={[...form.people.map((p) => p.phone ?? ''), me?.phone ?? '']}
                onCancel={() => setAdding(false)}
                onAdd={(np) => {
                  set({ people: [...form.people, { key: np.phone, phone: np.phone, name: np.name, role: 'contributor', amount: np.amount ?? '', gift: true }] });
                  setAdding(false);
                }}
              />
            </>
          ) : null}
        </PtPanel>
        {!adding ? <PtAddRow label="Add someone" onPress={() => setSheet('add')} /> : null}

        {target > 0 ? (
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>
                {formatNaira(total)} by {oneOff ? 'today' : lastSave ? `${lastSave.getDate()} ${MONTHS[lastSave.getMonth()]}` : short(form.dueDate)}
              </Text>
              <PtChip label={onTrack ? 'On track' : 'Short'} tone={onTrack ? 'success' : 'warning'} icon={onTrack ? 'check' : 'alert-circle'} />
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.line, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (total / Math.max(1, target)) * 100)}%`, height: 6, backgroundColor: pt.emerald700 }} />
            </View>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
              {oneOff
                ? 'Everyone puts in once.'
                : `${dates.length} ${form.frequency === 'weekly' ? 'weekly' : 'monthly'} save${dates.length === 1 ? '' : 's'} from ${periodic.length ? (periodic.length === 1 ? 'both of you' : 'all of you') : 'you'}${gifts.length ? `, plus ${joinNames(gifts.map((g) => `${g.name}'s`))} gift${gifts.length === 1 ? '' : 's'}` : ''}`}
              {!onTrack && target > total ? ` · ${formatNaira(target - total)} short` : ''}
            </Text>
          </View>
        ) : null}

        <PtOptionSheet
          visible={sheet === 'add'}
          title="Add someone"
          options={[...notAdded.map((m) => ({ value: m.id, label: m.name, hint: m.email })), { value: -1, label: 'Someone new', hint: 'Invite them by phone number' }]}
          value={null}
          onPick={(id) => {
            setSheet(null);
            if (id === -1) setAdding(true);
            else addFamily(id);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'day'}
          title="Save on"
          options={
            form.frequency === 'monthly'
              ? Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `The ${ordinal(i + 1)}`, hint: i + 1 === 26 ? 'The day after salary' : undefined }))
              : DAYS.slice(1).map((d, i) => ({ value: i + 1, label: d }))
          }
          value={form.frequency === 'monthly' ? form.monthDay : form.weekDay}
          onPick={(d) => {
            set(form.frequency === 'monthly' ? { monthDay: d } : { weekDay: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GLW-04
  if (step === 'people') {
    const roleKey = sheet && typeof sheet === 'object' ? sheet.role : null;
    const editing = form.people.find((p) => p.key === roleKey);
    const roleLine = (r: Role) => (r === 'co_owner' ? 'Co-owner · can approve' : r === 'contributor' ? 'Contributor · adds money, sees progress' : 'Viewer · sees progress');
    return (
      <PtStepScreen onBack={back} flow={header} title="Contributors and reminders" gap={14} footer={footer('Continue')}>
        <PtPanel>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{myName} (you)</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Owner · can approve</Text>
            </View>
            <PtChip label="Owner" icon="circle" />
          </View>
          {form.people.map((p, i) =>
            personRow(p, i, <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Edit</Text>, roleLine(p.role), () => setSheet({ role: p.key })),
          )}
        </PtPanel>
        <PtAddRow
          label="Add a contributor"
          onPress={() => {
            flow.goTo('plan');
            setSheet('add');
          }}
        />
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Reminders</PtGroupLabel>
          <PtPanel>
            <PtSwitchRow title="2 days before each save" subtitle="Push and SMS" value={form.remindBefore} onChange={(v) => set({ remindBefore: v })} />
            <PtDivider />
            <PtSwitchRow title="Nudge if we fall behind" subtitle="Tells the person who missed, kindly" value={form.nudge} onChange={(v) => set({ nudge: v })} />
          </PtPanel>
        </View>
        <PtPanel>
          <PtReviewRow
            label="Contribution link"
            value={form.link ? 'On — made when you create the goal' : 'Off'}
            sub={form.link ? 'Anyone with the link can add money, like an uncle abroad' : null}
            onEdit={() => setSheet('link')}
            last
          />
        </PtPanel>
        <PtOptionSheet
          visible={Boolean(editing)}
          title={editing?.name ?? ''}
          options={[
            { value: 'co_owner', label: 'Co-owner', hint: 'Adds money and can approve' },
            { value: 'contributor', label: 'Contributor', hint: 'Adds money, sees progress' },
            { value: 'viewer', label: 'Viewer', hint: 'Sees progress only' },
            { value: 'remove', label: `Remove ${editing?.name ?? ''}` },
          ]}
          value={editing?.role ?? null}
          onPick={(v) => {
            if (v === 'remove') set({ people: form.people.filter((p) => p.key !== roleKey) });
            else set({ people: form.people.map((p) => (p.key === roleKey ? { ...p, role: v as Role } : p)) });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtSheet visible={sheet === 'link'} title="Contribution link" subtitle="A page anyone can pay into, without the app" onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => setSheet(null)} />}>
          <PtPanel>
            <PtSwitchRow title="Share a link" subtitle="Shows the goal, how close it is, and the account to pay into" value={form.link} onChange={(v) => set({ link: v })} />
          </PtPanel>
        </PtSheet>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GLW-05
  if (step === 'lock') {
    const giftNames = gifts.map((g) => g.name);
    return (
      <PtStepScreen onBack={back} flow={header} title="Protect the goal" gap={14} footer={footer('Review')}>
        <PtChoiceCard
          title="Lock until the goal is reached"
          subtitle={lockUntil ? `Or until ${formatYmd(lockUntil)}, whichever comes first.` : 'Or until the due date, whichever comes first.'}
          selected={form.lock === 'target'}
          onPress={() => set({ lock: 'target' })}
        />
        <PtChoiceCard title="No lock" subtitle="Owners can withdraw any time." selected={form.lock === 'none'} onPress={() => set({ lock: 'none' })} />
        <PtPanel>
          <PtSwitchRow
            title={kind.payTo}
            subtitle={form.payee ? `Sends ${formatNaira(target)} to ${form.payee.name} on ${short(payOn)}` : 'Choose who, and it goes on the day'}
            value={form.payDirect}
            onChange={(v) => {
              set({ payDirect: v });
              if (v && !form.payee) setSheet('payee');
            }}
          />
          {form.payDirect && form.payee ? (
            <>
              <PtDivider />
              <PtReviewRow label="Paid to" value={form.payee.name} onEdit={() => setSheet('payee')} />
            </>
          ) : null}
          {form.lock === 'target' ? (
            <>
              <PtDivider />
              <PtReviewRow
                label="Withdraw early"
                value={`${coOwners.length && form.earlyApproval ? 'Both approve · ' : ''}5% fee, half to charity`}
                sub={form.charity ? form.charity.name : 'Pick the charity'}
                onEdit={() => setSheet('charity')}
              />
            </>
          ) : null}
          <PtDivider />
          <PtReviewRow
            label="If the goal is cancelled"
            value="Everyone gets back what they put in"
            sub={giftNames.length ? `${joinNames(giftNames)}'s gift goes back to them` : null}
            last
          />
        </PtPanel>
        <PayeePickerSheet
          visible={sheet === 'payee'}
          title={kind.payTo}
          kind={kind.payKind}
          onPick={(p) => {
            set({ payee: p, payDirect: true });
            setSheet(null);
          }}
          onAddNew={() => {
            setSheet(null);
            navigation.navigate('AddRecipient', { context: name.trim(), returnTo: 'GoalWalletSetup' });
          }}
          onClose={() => {
            setSheet(null);
            if (!form.payee) set({ payDirect: false });
          }}
        />
        <CharityPickerSheet
          visible={sheet === 'charity'}
          value={form.charity?.id ?? null}
          onPick={(o) => {
            set({ charity: { id: o.id, name: o.name } });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const planLine = oneOff
    ? `${formatNaira(total)} once`
    : `${formatNaira(form.myAmount || 0)}${periodic.length && periodic.every((p) => p.amount === form.myAmount) ? ' each' : ''} a ${form.frequency === 'weekly' ? 'week' : 'month'}${giftTotal ? ` + ${formatNaira(giftTotal)} gift` : ''}`;
  return (
    <PtStepScreen onBack={back} flow={header} title="Review the goal" subtitle="Check everything. You can edit before you create." gap={16} footer={footer('Create goal', submit, create.isPending)}>
      <PtPanel>
        <PtReviewRow label="Goal" value={name.trim()} sub={form.forWhom.trim() || kind.title} onEdit={() => flow.goTo('type')} />
        <PtReviewRow
          label="Target"
          value={`${formatNaira(target)}${form.dueDate ? ` by ${formatYmd(form.dueDate)}` : ''}`}
          sub={form.lines.length ? `${form.lines.length} line${form.lines.length === 1 ? '' : 's'}: ${form.lines.map((l) => lineWord(l.name)).join(', ')}` : null}
          onEdit={() => flow.goTo('target')}
        />
        <PtReviewRow label="Plan" value={planLine} sub={`${onTrack ? 'On track' : 'Short'} for ${formatNaira(total)}`} onEdit={() => flow.goTo('plan')} />
        <PtReviewRow label="People" value={[myName, ...form.people.map((p) => p.name)].join(', ')} sub={form.link ? 'Contribution link on' : null} onEdit={() => flow.goTo('people')} />
        <PtReviewRow
          label="Lock"
          value={form.lock === 'target' ? `Until goal or ${short(lockUntil)}` : 'No lock'}
          sub={form.payDirect && form.payee ? `Pays ${form.payee.name} on ${short(payOn)}` : null}
          onEdit={() => flow.goTo('lock')}
          last
        />
      </PtPanel>
    </PtStepScreen>
  );
}
