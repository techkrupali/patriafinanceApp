import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtChip } from '../../components/pt/PtChip';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtQrCode } from '../../components/pt/PtQrCode';
import { PtRing } from '../../components/pt/PtRing';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtSlider } from '../../components/pt/PtSlider';
import { PtAddRow } from '../../components/pt/PtPeople';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { useBudget, useChildLinkCode, useCreateWallet, useFamily, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, groupAmountInput, initials, sanitizeAmountInput } from '../../lib/format';
import { joinNames, ordinal } from '../../lib/goalPlan';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { AllowanceFrequency, ChildAgeBand, Wallet, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'child' | 'allowance' | 'controls' | 'requests' | 'goal' | 'phone' | 'people' | 'review';
const STEPS: Step[] = ['child', 'allowance', 'controls', 'requests', 'goal', 'phone', 'people', 'review'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const AGES: { value: ChildAgeBand; label: string; ages: string }[] = [
  { value: 'under_6', label: 'Under 6', ages: 'under 6' },
  { value: '6_9', label: '6 to 9', ages: '6 to 9' },
  { value: '10_12', label: '10 to 12', ages: '10 to 12' },
  { value: '13_15', label: '13 to 15', ages: '13 to 15' },
  { value: '16_17', label: '16 to 17', ages: '16 to 17' },
];

/** CHW-03 "Suggested for ages 6 to 9": what each age can do to start with. */
const SUGGESTED: Record<ChildAgeBand, { daily: number; allowance: number; shops: boolean; friends: boolean; online: boolean; cash: boolean; auto: number }> = {
  under_6: { daily: 500, allowance: 1000, shops: false, friends: false, online: false, cash: false, auto: 0 },
  '6_9': { daily: 1500, allowance: 3000, shops: true, friends: false, online: false, cash: false, auto: 2000 },
  '10_12': { daily: 3000, allowance: 5000, shops: true, friends: true, online: false, cash: false, auto: 2000 },
  '13_15': { daily: 5000, allowance: 8000, shops: true, friends: true, online: true, cash: false, auto: 5000 },
  '16_17': { daily: 10000, allowance: 15000, shops: true, friends: true, online: true, cash: true, auto: 5000 },
};

interface ChildForm {
  firstName: string;
  lastName: string;
  age: ChildAgeBand;
  amount: string;
  frequency: AllowanceFrequency;
  fromWalletId: number | null;
  categoryId: number | null;
  /** The source's label, kept for the review ("Household · School runs and lunch"). */
  fromLabel: string;
  pauseHolidays: boolean;
  notify: boolean;
  daily: number;
  shops: boolean;
  friends: boolean;
  online: boolean;
  cash: boolean;
  autoLimit: number;
  autoPerWeek: number;
  approvers: 'any' | 'all';
  expiryHours: number;
  reason: boolean;
  goalOn: boolean;
  goalName: string;
  goalAmount: string;
  savePercent: number;
  matchPercent: number;
  phoneMode: 'own' | 'managed';
  coparentId: number | null;
  coApprove: boolean;
  coChange: boolean;
  coSee: boolean;
  gifts: boolean;
}

const suggested = (age: ChildAgeBand) => {
  const s = SUGGESTED[age];
  return { amount: String(s.allowance), daily: s.daily, shops: s.shops, friends: s.friends, online: s.online, cash: s.cash, autoLimit: s.auto };
};

const EMPTY: ChildForm = {
  firstName: '',
  lastName: '',
  age: '6_9',
  ...suggested('6_9'),
  frequency: 'weekly',
  fromWalletId: null,
  categoryId: null,
  fromLabel: '',
  pauseHolidays: false,
  notify: true,
  autoPerWeek: 3,
  approvers: 'any',
  expiryHours: 24,
  reason: true,
  goalOn: true,
  goalName: '',
  goalAmount: '',
  savePercent: 20,
  matchPercent: 50,
  phoneMode: 'own',
  coparentId: null,
  coApprove: true,
  coChange: true,
  coSee: true,
  gifts: true,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The next Monday (or today, if it's Monday before 7 am). */
function nextMonday(): Date {
  const d = new Date();
  const before7 = d.getHours() < 7;
  d.setHours(0, 0, 0, 0);
  const add = (8 - d.getDay()) % 7 || (before7 ? 0 : 7);
  d.setDate(d.getDate() + add);
  return d;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/**
 * Child wallet from the client prototype: CHW-01 who it's for → CHW-02 pocket
 * money → CHW-03 what they can do → CHW-04 when they ask for money → CHW-05 a
 * savings goal and match → CHW-06 linking their phone → CHW-07 co-parent →
 * WCR-06 review → WCR-07. Auto-saved as a draft.
 */
export function ChildWalletSetupScreen(props: RootScreenProps<'ChildWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <ChildSetup {...props} draft={draft} />;
}

function ChildSetup({ navigation, draft }: RootScreenProps<'ChildWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const create = useCreateWallet();
  const linkCode = useChildLinkCode();

  const [form, setForm] = useState<ChildForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<ChildForm>) }));
  const set = (patch: Partial<ChildForm>) => setForm((f) => ({ ...f, ...patch }));
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'from' | 'perWeek' | 'approvers' | 'expiry' | 'save' | 'guardian'>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const kid = form.firstName.trim() || 'your child';
  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'child',
    name: form.firstName.trim() ? `${form.firstName.trim()}'s wallet` : '',
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(form.firstName.trim()),
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

  const own = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active');
  const main = own.find((w) => w.type === 'main');
  const members = (family.data?.members ?? []).filter((m) => !['vendor', 'child'].includes(m.role));
  const coparent = members.find((m) => m.id === form.coparentId) ?? null;
  const myName = firstName(me?.full_name ?? 'You');

  // Paid from Main until another wallet or category is chosen.
  useEffect(() => {
    if (!form.fromWalletId && main) set({ fromWalletId: main.id, fromLabel: main.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main?.id]);
  // CHW-07: a co-owner in the family is the likely co-parent.
  useEffect(() => {
    if (form.coparentId === null && !draft) {
      const spouse = members.find((m) => m.role === 'co_owner');
      if (spouse) set({ coparentId: spouse.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.length]);
  // CHW-06: the code shown, and its countdown.
  useEffect(() => {
    if (step !== 'phone' || form.phoneMode !== 'own' || !form.firstName.trim()) return;
    if (!code || new Date(code.expires_at).getTime() <= Date.now()) {
      linkCode.reserve.mutate(form.firstName.trim(), { onSuccess: setCode });
    }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form.phoneMode]);

  const amount = Number(form.amount) || 0;
  const first = nextMonday();
  const when = form.frequency === 'monthly' ? `Every month on the ${ordinal(first.getDate())} at 7:00 am` : `Every ${form.frequency === 'biweekly' ? 'other ' : ''}${WEEKDAYS[first.getDay()]} at 7:00 am`;
  const save = Math.floor((amount * form.savePercent) / 100);
  const match = Math.floor((save * form.matchPercent) / 100);
  const perPeriod = save + match;
  const goalAmount = Number(form.goalAmount) || 0;
  const periodWord = form.frequency === 'monthly' ? 'month' : form.frequency === 'biweekly' ? '2 weeks' : 'week';
  const reachBy = (() => {
    if (!(perPeriod > 0) || !(goalAmount > 0)) return null;
    const periods = Math.ceil(goalAmount / perPeriod);
    const d = new Date(first);
    if (form.frequency === 'monthly') d.setMonth(d.getMonth() + periods - 1);
    else d.setDate(d.getDate() + (periods - 1) * (form.frequency === 'biweekly' ? 14 : 7));
    const part = d.getDate() <= 10 ? 'early' : d.getDate() <= 20 ? 'mid' : 'late';
    return `${part} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  })();
  const ageLabel = AGES.find((a) => a.value === form.age)?.ages ?? '';
  const expiresIn = code ? Math.max(0, Math.floor((new Date(code.expires_at).getTime() - now) / 1000)) : 0;
  const goalWord = form.goalName.trim().replace(/^new\s+/i, '').toLowerCase();

  const validate = (s: Step): string | null => {
    if (s === 'child' && !form.firstName.trim()) return "Enter your child's first name.";
    if (s === 'allowance' && amount > 0 && !form.fromWalletId) return 'Choose where the pocket money comes from.';
    if (s === 'goal' && form.goalOn) {
      if (!form.goalName.trim()) return 'Name the goal, or skip for now.';
      if (!(goalAmount > 0)) return 'Enter how much the goal costs.';
    }
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    flow.next();
  };

  const submit = () => {
    for (const s of ['child', 'allowance', 'goal'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    setError(null);
    autosave.stop();
    const name = `${form.firstName.trim()}'s wallet`;
    create.mutate(
      {
        type: 'child',
        name,
        mode: coparent ? 'shared' : 'private',
        members: coparent
          ? [{ user_id: coparent.id, role: form.coChange ? 'co_owner' : form.coApprove ? 'contributor' : 'viewer', can_approve: form.coApprove }]
          : undefined,
        child: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim() || undefined,
          age_band: form.age,
          allowance: amount > 0 ? { amount: form.amount, frequency: form.frequency, starts_on: ymd(first), from_wallet_id: form.fromWalletId ?? undefined, category_id: form.categoryId, pause_holidays: form.pauseHolidays, notify: form.notify } : undefined,
          controls: { daily_limit: String(form.daily), shops: form.shops, friends: form.friends, online: form.online, cash: form.cash },
          requests: { auto_limit: String(form.autoLimit), auto_per_week: form.autoPerWeek, expiry_hours: form.expiryHours, reason_required: form.reason, approvers: form.approvers },
          goal: form.goalOn ? { name: form.goalName.trim(), amount: form.goalAmount, save_percent: form.savePercent, match_percent: form.matchPercent, match_wallet_id: main?.id } : null,
          phone: { mode: form.phoneMode, code: form.phoneMode === 'own' ? code?.code : undefined },
          coparent: coparent ? { approve: form.coApprove, change: form.coChange, see: form.coSee } : null,
          gifts: form.gifts,
        },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const linked = res.wallet.child?.phone;
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: `${form.firstName.trim()}'s wallet is ready`,
              subtitle: [
                amount > 0 ? `The first ${formatNaira(amount)} lands on ${WEEKDAYS[first.getDay()]} at 7:00 am.` : null,
                form.phoneMode === 'own' ? `Finish linking ${form.firstName.trim()}'s phone when you're together.` : null,
              ]
                .filter(Boolean)
                .join(' '),
              caption: '',
              events: [
                ...(form.phoneMode === 'own' ? [{ label: `${form.firstName.trim()}'s phone`, title: 'Not linked yet', sub: linked?.code ? `Code ${linked.code}` : undefined }] : []),
                ...(coparent ? [{ label: firstName(coparent.name), title: 'Added as co-parent', sub: "They'll get a notification" }] : []),
                ...(amount > 0 || form.goalOn ? [{ label: 'Rules added', title: [amount > 0 ? 'Allowance' : null, form.goalOn && save > 0 ? `${goalWord} saving` : null].filter(Boolean).join(' and '), sub: 'See them in Rules' }] : []),
              ],
              child: { initials: initials(`${form.firstName} ${form.lastName}`), phoneMode: form.phoneMode },
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

  const header = { title: 'Child wallet', step: flow.index + 1, total: STEPS.length };
  const footer = (title: string, onPress = next, loading = false, secondary?: { title: string; onPress: () => void }) => (
    <>
      {error ? (
        <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
          {error}
        </PtText>
      ) : null}
      <PtButton title={title} onPress={onPress} loading={loading} />
      {secondary ? <PtButton title={secondary.title} variant="ghost" onPress={secondary.onPress} /> : null}
    </>
  );
  const check = (key: 'shops' | 'friends' | 'online' | 'cash' | 'coApprove' | 'coChange' | 'coSee', title: string, sub: string | null, i: number) => (
    <React.Fragment key={key}>
      {i ? <PtDivider /> : null}
      <Pressable
        onPress={() => {
          selection();
          set({ [key]: !form[key] } as Partial<ChildForm>);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: form[key] }}
        accessibilityLabel={title}
        style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }}>{title}</Text>
          {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{sub}</Text> : null}
        </View>
        <PtCheckbox checked={form[key]} />
      </Pressable>
    </React.Fragment>
  );

  // ------------------------------------------------------------ CHW-01
  if (step === 'child') {
    return (
      <PtStepScreen onBack={back} flow={header} title="Who is this wallet for?" subtitle="Children under 18 use the app under your verification. No BVN needed." gap={14} footer={footer('Continue')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <PtAvatar initials={form.firstName.trim() ? initials(`${form.firstName} ${form.lastName}`) : '?'} tone="gold" size={80} />
          <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: pt.inkMuted }}>
            {form.firstName.trim() ? `${form.firstName.trim()} sees their initials on the wallet, so they know it's theirs.` : 'Your child sees their initials on the wallet, so they know it\'s theirs.'}
          </Text>
        </View>
        <PtField label="First name" value={form.firstName} onChangeText={(t) => set({ firstName: t })} placeholder="Kamsi" maxLength={60} />
        <PtField label="Last name" value={form.lastName} onChangeText={(t) => set({ lastName: t })} placeholder={me?.full_name?.split(/\s+/).slice(-1)[0] ?? 'Okafor'} maxLength={60} />
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Age</PtGroupLabel>
          <PtPills options={AGES.map((a) => ({ value: a.value, label: a.label }))} value={form.age} onChange={(v) => set({ age: v, ...suggested(v) })} />
        </View>
        <PtNote>We suggest settings for each age. {form.firstName.trim() || 'Your child'} gets more freedom as they grow, and you choose when.</PtNote>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ CHW-02
  if (step === 'allowance') {
    return (
      <PtStepScreen onBack={back} flow={header} title={`${form.firstName.trim()}'s pocket money`} gap={16} footer={footer('Continue')}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <PtHeroAmount value={form.amount} onChange={(v) => set({ amount: v })} label="Pocket money" />
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{when}</Text>
        </View>
        <PtSegmented
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'biweekly', label: 'Every 2 weeks' },
            { value: 'monthly', label: 'Monthly' },
          ]}
          value={form.frequency}
          onChange={(v) => set({ frequency: v as AllowanceFrequency })}
        />
        <PtPanel>
          <PtReviewRow label="Paid from" value={form.fromLabel || main?.name || 'Main wallet'} onEdit={() => setSheet('from')} />
          <PtReviewRow label="First payment" value={`${WEEKDAYS[first.getDay()]}, ${dayMonth(first)}`} last />
        </PtPanel>
        <PtPanel>
          <PtSwitchRow title="Pause during school holidays" subtitle="Restarts when term begins" value={form.pauseHolidays} onChange={(v) => set({ pauseHolidays: v })} />
          <PtDivider />
          <PtSwitchRow title={`Tell ${kid} when it lands`} subtitle="A short note in their app" value={form.notify} onChange={(v) => set({ notify: v })} />
        </PtPanel>
        <PaidFromSheet
          visible={sheet === 'from'}
          wallets={own.filter((w) => w.type === 'main' || w.type === 'spending')}
          onPick={(w, category) => {
            set({ fromWalletId: w.id, categoryId: category?.id ?? null, fromLabel: category ? `${w.name} · ${category.name}` : w.name });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ CHW-03
  if (step === 'controls') {
    return (
      <PtStepScreen onBack={back} flow={header} title={`What can ${kid} do?`} subtitle={`Suggested for ages ${ageLabel}. Change any of it.`} gap={14} footer={footer('Continue')}>
        <PtPanel>
          <View style={{ paddingVertical: 14, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Daily spending limit</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.brand }}>{formatNaira(form.daily)}</Text>
            </View>
            <PtSlider value={Math.round(form.daily / 100)} min={1} max={50} onChange={(v) => set({ daily: v * 100 })} label="Daily spending limit" />
          </View>
        </PtPanel>
        <PtPanel>
          {check('shops', 'Pay at shops and the school tuck shop', 'With a pay code or spending card', 0)}
          {check('friends', 'Send money to friends', 'Only to children you approve', 1)}
          {check('online', 'Pay online', 'Games, apps and websites', 2)}
          {check('cash', 'Withdraw cash', 'At agents and ATMs', 3)}
        </PtPanel>
        <PtNote tone="warning">Betting, lottery and adult sites are always blocked for children. This can't be turned off.</PtNote>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ CHW-04
  if (step === 'requests') {
    const parents = coparent ? `${myName} or ${firstName(coparent.name)}` : myName;
    const example = form.autoLimit >= 1500 ? 1500 : Math.max(500, form.autoLimit);
    return (
      <PtStepScreen onBack={back} flow={header} title={`When ${kid} asks for money`} subtitle="Small requests can go through without you lifting a finger." gap={14} footer={footer('Continue')}>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Approve automatically up to</PtGroupLabel>
          <PtPills
            options={[
              { value: 0, label: 'Never' },
              { value: 1000, label: '₦1,000' },
              { value: 2000, label: '₦2,000' },
              { value: 5000, label: '₦5,000' },
            ]}
            value={form.autoLimit}
            onChange={(v) => set({ autoLimit: v })}
          />
        </View>
        <PtPanel>
          {form.autoLimit > 0 ? (
            <PtReviewRow label="Automatic approvals" value={`Up to ${form.autoPerWeek} a week`} sub="After that, every request comes to you" onEdit={() => setSheet('perWeek')} />
          ) : null}
          <PtReviewRow
            label={form.autoLimit > 0 ? 'Bigger requests go to' : 'Requests go to'}
            value={coparent && form.approvers === 'all' ? `${myName} and ${firstName(coparent.name)}` : parents}
            sub={coparent ? (form.approvers === 'all' ? 'Both of you say yes' : 'Whoever answers first') : null}
            onEdit={coparent ? () => setSheet('approvers') : undefined}
          />
          <PtReviewRow label="If nobody answers" value={`Cancel after ${form.expiryHours} hours`} onEdit={() => setSheet('expiry')} last />
        </PtPanel>
        <PtPanel>
          <PtSwitchRow title={`${kid} must give a reason`} subtitle={'Like "school trip" or "birthday gift"'} value={form.reason} onChange={(v) => set({ reason: v })} />
        </PtPanel>
        <PtPanel>
          <View style={{ paddingVertical: 14, gap: 8 }}>
            <PtGroupLabel>{`What ${kid} sees`}</PtGroupLabel>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.ink }}>
              "Ask for {formatNaira(example)}
              {form.reason ? (
                <>
                  {' '}for <Text style={{ fontFamily: ptFont.bold }}>Ola's birthday gift</Text>
                </>
              ) : null}
              " → <Text style={{ fontFamily: ptFont.bold, color: form.autoLimit >= example ? pt.brand : pt.inkMuted }}>{form.autoLimit >= example ? 'Approved' : `Sent to ${parents}`}</Text>
            </Text>
          </View>
        </PtPanel>
        <PtOptionSheet
          visible={sheet === 'perWeek'}
          title="Automatic approvals"
          options={[1, 2, 3, 5, 7].map((n) => ({ value: n, label: `Up to ${n} a week` }))}
          value={form.autoPerWeek}
          onPick={(n) => {
            set({ autoPerWeek: n });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'approvers'}
          title="Bigger requests go to"
          options={[
            { value: 'any', label: parents, hint: 'Whoever answers first' },
            { value: 'all', label: coparent ? `${myName} and ${firstName(coparent.name)}` : myName, hint: 'Both of you say yes' },
          ]}
          value={form.approvers}
          onPick={(v) => {
            set({ approvers: v as 'any' | 'all' });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'expiry'}
          title="If nobody answers"
          options={[24, 48, 72].map((h) => ({ value: h, label: `Cancel after ${h} hours` }))}
          value={form.expiryHours}
          onPick={(h) => {
            set({ expiryHours: h });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ CHW-05
  if (step === 'goal') {
    const pct = 0;
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="Teach saving with a goal"
        subtitle={`${form.firstName.trim()} saves part of each allowance. You can add to it.`}
        gap={14}
        footer={footer('Continue', () => {
          set({ goalOn: true });
          next();
        }, false, {
          title: 'Skip for now',
          onPress: () => {
            set({ goalOn: false });
            setError(null);
            flow.next();
          },
        })}
      >
        <PtField label={`${form.firstName.trim()}'s goal`} value={form.goalName} onChangeText={(t) => set({ goalName: t })} placeholder="New bicycle" maxLength={60} />
        <PtField label="Goal amount" prefix="₦" value={groupAmountInput(form.goalAmount)} onChangeText={(t) => set({ goalAmount: sanitizeAmountInput(t) })} placeholder="25,000" keyboardType="decimal-pad" />
        <PtPanel>
          <PtReviewRow
            label={`${form.firstName.trim()} saves`}
            value={`${form.savePercent}% of each allowance`}
            sub={amount > 0 ? `${formatNaira(save)} every ${form.frequency === 'monthly' ? 'month' : form.frequency === 'biweekly' ? 'other ' + WEEKDAYS[first.getDay()] : WEEKDAYS[first.getDay()]}` : 'Set pocket money first'}
            onEdit={() => setSheet('save')}
          />
          <PtReviewRow
            label="Parents match"
            value={form.matchPercent ? `${form.matchPercent}% of what ${form.firstName.trim()} saves` : 'No match'}
            sub={form.matchPercent ? `${formatNaira(match)} a ${periodWord}, from Main` : null}
            last
          />
        </PtPanel>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Match</PtGroupLabel>
          <PtPills
            options={[
              { value: 0, label: 'None' },
              { value: 25, label: '25%' },
              { value: 50, label: '50%' },
              { value: 100, label: '100%' },
            ]}
            value={form.matchPercent}
            onChange={(v) => set({ matchPercent: v })}
          />
        </View>
        {perPeriod > 0 ? (
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <PtRing percent={pct} size={56} stroke={5} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>
                {formatNaira(perPeriod)} a {periodWord} together
              </Text>
              {reachBy ? (
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                  {goalWord ? `${goalWord.charAt(0).toUpperCase()}${goalWord.slice(1)}` : 'The goal'} by {reachBy}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        <PtOptionSheet
          visible={sheet === 'save'}
          title={`${form.firstName.trim()} saves`}
          options={[10, 20, 30, 50].map((p) => ({ value: p, label: `${p}% of each allowance`, hint: amount > 0 ? formatNaira(Math.floor((amount * p) / 100)) : undefined }))}
          value={form.savePercent}
          onPick={(p) => {
            set({ savePercent: p });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ CHW-06
  if (step === 'phone') {
    const mm = Math.floor(expiresIn / 60);
    const ss = String(expiresIn % 60).padStart(2, '0');
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title={`How will ${kid} use it?`}
        gap={12}
        footer={footer('Continue', next, false, form.phoneMode === 'own' ? { title: 'Link later', onPress: () => flow.next() } : undefined)}
      >
        <PtChoiceCard icon="smartphone" title={`On ${kid}'s own phone`} subtitle={`${kid} sees the balance, saves and asks for money.`} selected={form.phoneMode === 'own'} onPress={() => set({ phoneMode: 'own' })} />
        <PtChoiceCard icon="user" title="I manage it for them" subtitle={`No child app. You spend for ${kid}.`} selected={form.phoneMode === 'managed'} onPress={() => set({ phoneMode: 'managed' })} />
        {form.phoneMode === 'own' ? (
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 20, alignItems: 'center', gap: 14 }}>
            {code && expiresIn > 0 ? (
              <>
                <PtQrCode value={code.code} size={156} />
                <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, textAlign: 'center' }}>
                  Install Patriai on {kid}'s phone, tap <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>I have a code</Text>, then scan this.
                </Text>
                <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, letterSpacing: 4, color: pt.ink }} accessibilityLabel={`Code ${code.code}`}>
                  {code.code}
                </Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                  Code expires in {mm}:{ss}
                </Text>
              </>
            ) : linkCode.reserve.isPending ? (
              <ActivityIndicator color={pt.brand} />
            ) : (
              <>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center' }}>The code expired.</Text>
                <PtButton title="Show a new code" variant="secondary" size="sm" onPress={() => linkCode.reserve.mutate(form.firstName.trim(), { onSuccess: setCode })} />
              </>
            )}
          </View>
        ) : null}
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ CHW-07
  if (step === 'people') {
    const others = members.filter((m) => m.id !== form.coparentId);
    return (
      <PtStepScreen onBack={back} flow={header} title={`Who else looks after ${kid}'s money?`} gap={14} footer={footer('Review')}>
        <PtPanel>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{myName} (you)</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Parent · full control</Text>
            </View>
            <PtChip label="Owner" icon="circle" />
          </View>
        </PtPanel>
        {coparent ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <PtGroupLabel>{`${firstName(coparent.name)} · Co-parent`}</PtGroupLabel>
              </View>
              <Pressable onPress={() => set({ coparentId: null })} accessibilityRole="button" accessibilityLabel={`Remove ${coparent.name}`} hitSlop={8}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Remove</Text>
              </Pressable>
            </View>
            <PtPanel>
              {check('coApprove', 'Approve requests', null, 0)}
              {check('coChange', 'Change limits and allowance', null, 1)}
              {check('coSee', 'See every payment', null, 2)}
            </PtPanel>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Relatives</PtGroupLabel>
          <PtPanel>
            <PtSwitchRow title="Relatives can send gifts" subtitle="They add money to the wallet's account, but can't see spending" value={form.gifts} onChange={(v) => set({ gifts: v })} />
          </PtPanel>
        </View>
        {!coparent && others.length ? <PtAddRow label="Add a guardian" onPress={() => setSheet('guardian')} /> : null}
        <PtOptionSheet
          visible={sheet === 'guardian'}
          title="Add a guardian"
          options={others.map((m) => ({ value: m.id, label: m.name, hint: m.email }))}
          value={null}
          onPick={(id) => {
            set({ coparentId: id });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const allowed = [form.shops ? 'shops' : null, form.friends ? 'friends' : null, form.online ? 'online' : null, form.cash ? 'cash' : null].filter(Boolean) as string[];
  const notAllowed = [form.friends ? null : 'transfers', form.online ? null : 'online', form.cash ? null : 'cash'].filter(Boolean) as string[];
  return (
    <PtStepScreen
      onBack={back}
      flow={header}
      title={`Review ${form.firstName.trim()}'s wallet`}
      subtitle="Check everything. You can edit before you create."
      gap={16}
      footer={footer('Create wallet', submit, create.isPending)}
    >
      <PtPanel>
        <PtReviewRow label="Child" value={`${form.firstName.trim()} ${form.lastName.trim()}`.trim() + ` · age ${ageLabel}`} onEdit={() => flow.goTo('child')} />
        <PtReviewRow
          label="Allowance"
          value={amount > 0 ? `${formatNaira(amount)} ${form.frequency === 'monthly' ? 'every month' : `every ${form.frequency === 'biweekly' ? 'other ' : ''}${WEEKDAYS[first.getDay()]}`}` : 'No pocket money'}
          sub={amount > 0 ? `From ${form.fromLabel || main?.name || 'Main'} · first on ${dayMonth(first)}` : null}
          onEdit={() => flow.goTo('allowance')}
        />
        <PtReviewRow
          label="Spending"
          value={`${formatNaira(form.daily)} a day${allowed.length === 1 ? ` · ${allowed[0]} only` : allowed.length ? ` · ${joinNames(allowed)}` : ''}`}
          sub={notAllowed.length ? `No ${joinNames(notAllowed).replace(' and ', ' or ')}` : null}
          onEdit={() => flow.goTo('controls')}
        />
        <PtReviewRow
          label="Requests"
          value={form.autoLimit ? `Auto-approve up to ${formatNaira(form.autoLimit)}` : 'Every request comes to you'}
          sub={form.autoLimit ? `${form.autoPerWeek} a week, then to ${coparent ? `you or ${firstName(coparent.name)}` : 'you'}` : null}
          onEdit={() => flow.goTo('requests')}
        />
        <PtReviewRow
          label="Goal"
          value={form.goalOn ? `${form.goalName.trim()} · ${formatNaira(goalAmount)}` : 'No goal yet'}
          sub={form.goalOn ? `${form.firstName.trim()} saves ${form.savePercent}%${form.matchPercent ? `, you match ${form.matchPercent}%` : ''}` : null}
          onEdit={() => flow.goTo('goal')}
        />
        <PtReviewRow
          label="Co-parent"
          value={coparent ? `${firstName(coparent.name)} · ${form.coApprove && form.coChange && form.coSee ? 'full access' : [form.coApprove ? 'approves' : null, form.coChange ? 'changes limits' : null, form.coSee ? 'sees payments' : null].filter(Boolean).join(', ')}` : 'Just you'}
          onEdit={() => flow.goTo('people')}
          last
        />
      </PtPanel>
    </PtStepScreen>
  );
}

/** CHW-02 "Paid from": Main, or a spending wallet's category ("Household · School runs and lunch"). */
function PaidFromSheet({ visible, wallets, onPick, onClose }: { visible: boolean; wallets: Wallet[]; onPick: (w: Wallet, category: { id: number; name: string } | null) => void; onClose: () => void }) {
  const [spending, setSpending] = useState<Wallet | null>(null);
  const budget = useBudget(spending?.id ?? 0, Boolean(spending));
  const close = () => {
    setSpending(null);
    onClose();
  };
  return (
    <PtSheet visible={visible} title={spending ? spending.name : 'Paid from'} subtitle={spending ? 'Which category pays for it?' : undefined} onClose={close}>
      <PtPanel>
        {spending ? (
          budget.isLoading ? (
            <ActivityIndicator color={pt.brand} style={{ paddingVertical: 16 }} />
          ) : (
            [{ id: 0, name: 'No category', limit: '' }, ...(budget.data?.categories ?? [])].map((c, i) => (
              <React.Fragment key={c.id}>
                {i ? <PtDivider /> : null}
                <Pressable
                  onPress={() => {
                    onPick(spending, c.id ? { id: c.id, name: c.name } : null);
                    setSpending(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  style={{ minHeight: 56, justifyContent: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{c.name}</Text>
                  {c.limit ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{formatNaira(c.limit)} a month in that category</Text> : null}
                </Pressable>
              </React.Fragment>
            ))
          )
        ) : (
          wallets.map((w, i) => (
            <React.Fragment key={w.id}>
              {i ? <PtDivider /> : null}
              <Pressable
                onPress={() => (w.type === 'spending' ? setSpending(w) : onPick(w, null))}
                accessibilityRole="button"
                accessibilityLabel={w.name}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{w.name}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{w.type === 'spending' ? 'Pick a category' : formatNaira(w.balance)}</Text>
                </View>
                {w.type === 'spending' ? <Feather name="chevron-right" size={18} color={pt.inkMuted} /> : null}
              </Pressable>
            </React.Fragment>
          ))
        )}
      </PtPanel>
    </PtSheet>
  );
}
