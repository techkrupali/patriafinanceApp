import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtAddRow } from '../../components/pt/PtPeople';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { ChooseSavedSheet, accountLine, type RecipientKey } from '../../components/giving/ChooseSavedSheet';
import { ScheduleSheet, type ScheduleDraft } from '../../components/giving/ScheduleSheet';
import { useCreateWallet, useFamily, useOrganisations, useSaveAccount, useSavedAccounts, useSavingsInsights, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatMoney, formatNaira, formatYmd, groupAmountInput, initials, sanitizeAmountInput, toYmd } from '../../lib/format';
import { ordinal } from '../../lib/goalPlan';
import { GIVING_KINDS, longDate, nextGivingDate, partDates, pledgeParts, shortDate, whenLabel } from '../../lib/giving';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { GivingKind, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'kind' | 'recipients' | 'aside' | 'when' | 'pledge' | 'records' | 'review';
const STEPS: Step[] = ['kind', 'recipients', 'aside', 'when', 'pledge', 'records', 'review'];

/** Client: "fixed deposits and percentage of deposits from 1 or more wallets" — another wallet's line. */
interface ExtraLine {
  key: string;
  sourceId: number;
  kind: 'percent' | 'fixed';
  percent: number;
  amount: string;
  day: number;
}

interface GivingForm {
  kind: GivingKind;
  recipients: RecipientKey[];
  sourceId: number | null;
  percentOn: boolean;
  percent: number;
  fixedOn: boolean;
  fixed: string;
  fixedDay: number;
  roundupOn: boolean;
  roundupTo: '100' | '500' | '1000';
  extra: ExtraLine[];
  schedules: ScheduleDraft[];
  askFirst: boolean;
  thanksgiving: boolean;
  pledgeOn: boolean;
  pledge: { name: string; total: string; paid: string; due: string | null; payee: RecipientKey | null; plan: 'parts' | 'once' };
  receipts: boolean;
  statement: boolean;
  anonymous: boolean;
  viewerId: number | null;
}

const EMPTY: GivingForm = {
  kind: 'tithes',
  recipients: [],
  sourceId: null,
  percentOn: true,
  percent: 10,
  fixedOn: false,
  fixed: '20000',
  fixedDay: 25,
  roundupOn: false,
  roundupTo: '100',
  extra: [],
  schedules: [],
  askFirst: false,
  thanksgiving: true,
  pledgeOn: false,
  pledge: { name: '', total: '', paid: '', due: null, payee: null, plan: 'parts' },
  receipts: true,
  statement: true,
  anonymous: false,
  viewerId: null,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * Giving wallet from the client prototype: GIV-01 kind → GIV-02 who receives it
 * (verified organisations, saved accounts, groups; GIV-07 adds one) → GIV-03 how
 * money is set aside, from one or more wallets → GIV-04 giving dates → GIV-05 a
 * pledge paid in parts → GIV-06 records and who can see it → WCR-06 → WCR-07.
 */
export function GivingWalletSetupScreen(props: RootScreenProps<'GivingWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <GivingSetup {...props} draft={draft} />;
}

function GivingSetup({ navigation, route, draft }: RootScreenProps<'GivingWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const insights = useSavingsInsights();
  const saved = useSavedAccounts();
  const saveAccount = useSaveAccount();
  const create = useCreateWallet();

  const [name, setName] = useState(draft?.name ?? 'Tithes and offerings');
  const [form, setForm] = useState<GivingForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<GivingForm>) }));
  const set = (patch: Partial<GivingForm>) => setForm((f) => ({ ...f, ...patch }));
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<null | 'saved' | 'source' | 'fixedDay' | 'due' | 'payee'>(null);
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null);
  const [extra, setExtra] = useState<ExtraLine | null>(null);

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'giving',
    name,
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(form.recipients.length || flow.index > 0),
  });

  // GIV-07 came back with a new account: it's a recipient now.
  const added = route.params?.addedAccountId;
  useEffect(() => {
    if (!added) return;
    setForm((f) => (f.recipients.includes(`a${added}`) ? f : { ...f, recipients: [...f.recipients, `a${added}`] }));
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

  // ---- who receives it
  const accounts = saved.data?.accounts ?? [];
  const groups = saved.data?.groups ?? [];
  const recipientInfo = (key: RecipientKey) => {
    if (key.startsWith('g')) {
      const g = groups.find((x) => `g${x.id}` === key);
      return g ? { key, name: g.name, sub: g.accounts.map((a) => a.nickname).join(', '), verified: g.accounts.every((a) => a.verified), size: g.accounts.length, group: true, church: true } : null;
    }
    const a = accounts.find((x) => `a${x.id}` === key);
    return a ? { key, name: a.nickname, sub: accountLine(a), verified: a.verified, size: 1, group: false, church: a.organisation?.kind === 'church' || a.organisation?.kind === 'mosque' } : null;
  };
  const chosen = form.recipients.map(recipientInfo).filter((r): r is NonNullable<ReturnType<typeof recipientInfo>> => r !== null);
  const orgs = useOrganisations({ q: q.trim() }, q.trim().length >= 2);

  // ---- money
  const ownWallets = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && !w.emergency_locked && w.type !== 'giving' && w.type !== 'emergency');
  const main = ownWallets.find((w) => w.type === 'main');
  const source = ownWallets.find((w) => w.id === form.sourceId) ?? main ?? ownWallets[0];
  const depositsOf = (id: number | undefined) => parseFloat(insights.data?.monthly_deposits?.[String(id)] ?? '0');
  const percentEstimate = Math.round((depositsOf(source?.id) * form.percent) / 100 / 500) * 500;
  const roundupEstimate = parseFloat(insights.data?.roundups?.[form.roundupTo] ?? '0');
  const extraMonthly = form.extra.reduce((sum, l) => sum + (l.kind === 'percent' ? (depositsOf(l.sourceId) * l.percent) / 100 : Number(l.amount) || 0), 0);
  const monthlyAside = (form.percentOn ? percentEstimate : 0) + (form.fixedOn ? Number(form.fixed) || 0 : 0) + (form.roundupOn ? roundupEstimate : 0) + extraMonthly;
  const spouse = (family.data?.members ?? []).find((m) => ['owner', 'co_owner', 'admin'].includes(m.role));

  // ---- pledge
  const pledgeTotal = Number(form.pledge.total) || 0;
  const pledgePaid = Number(form.pledge.paid) || 0;
  const pledgeLeft = Math.max(0, pledgeTotal - pledgePaid);
  const salaryDay = insights.data?.salary?.day && insights.data.salary.day <= 28 ? insights.data.salary.day : 25;
  const parts = form.pledge.due ? pledgeParts(pledgeLeft, form.pledge.due, form.pledge.plan, salaryDay) : [];
  const partsIfSplit = form.pledge.due ? pledgeParts(pledgeLeft, form.pledge.due, 'parts', salaryDay) : [];

  /** GIV-04 starting dates from who receives what. */
  const suggestSchedules = (): ScheduleDraft[] => {
    const out: ScheduleDraft[] = [];
    const base = { dayOfWeek: 7, dayOfMonth: 15, weekOfMonth: 1, runOn: null };
    chosen.forEach((r, i) => {
      const key = `s${Date.now()}${i}`;
      if (form.kind === 'tithes' && r.group) out.push({ ...base, key, label: 'Tithe', amount: String(percentEstimate || 10000), payee: r.key, frequency: 'monthly_weekday' });
      else if (form.kind === 'tithes' && r.church && !out.some((s) => s.label === 'Sunday offering')) out.push({ ...base, key, label: 'Sunday offering', amount: '2000', payee: r.key, frequency: 'weekly' });
      else if (form.kind === 'zakat') out.push({ ...base, key, label: 'Sadaqah', amount: '2000', payee: r.key, frequency: 'weekly', dayOfWeek: 5 });
      else if (form.kind === 'parents') out.push({ ...base, key, label: 'Upkeep', amount: '50000', payee: r.key, frequency: 'monthly', dayOfMonth: salaryDay });
      else if (form.kind === 'dues') out.push({ ...base, key, label: 'Dues', amount: '5000', payee: r.key, frequency: 'monthly', dayOfMonth: 1 });
      else out.push({ ...base, key, label: 'Monthly gift', amount: '10000', payee: r.key, frequency: 'monthly' });
    });
    return out;
  };

  const validate = (s: Step): string | null => {
    if (s === 'kind' && !name.trim()) return 'Give the wallet a name.';
    if (s === 'recipients' && chosen.length === 0) return 'Choose who receives it.';
    if (s === 'aside') {
      if (!source) return 'You need a wallet to set money aside from.';
      if (form.fixedOn && !(Number(form.fixed) > 0)) return 'Enter the fixed amount each month.';
      if (form.roundupOn && !main) return 'Round-ups come from your Main wallet.';
    }
    if (s === 'when' && form.schedules.some((x) => !form.recipients.includes(x.payee))) return 'A giving date goes to someone no longer chosen. Edit or remove it.';
    if (s === 'pledge' && form.pledgeOn) {
      if (!form.pledge.name.trim()) return 'Say what the pledge is for.';
      if (!(pledgeTotal > 0) || pledgePaid >= pledgeTotal) return 'Enter the total and what you have paid so far.';
      if (!form.pledge.due) return 'Pick when it is due.';
      if (!form.pledge.payee) return 'Choose who receives it.';
    }
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    if (step === 'aside' && form.schedules.length === 0) set({ schedules: suggestSchedules() });
    flow.next();
  };

  const recipientRef = (k: RecipientKey) => (k.startsWith('g') ? { group_id: Number(k.slice(1)) } : { saved_account_id: Number(k.slice(1)) });

  const submit = () => {
    for (const s of ['kind', 'recipients', 'aside', 'when', 'pledge'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    if (!source) return;
    setError(null);
    autosave.stop();
    const pledge =
      form.pledgeOn && form.pledge.payee && form.pledge.due
        ? {
            name: form.pledge.name.trim(),
            total: form.pledge.total,
            paid_before: String(pledgePaid),
            due_date: form.pledge.due,
            ...recipientRef(form.pledge.payee),
            parts: parts.map((p) => ({ date: p.date, amount: String(p.amount) })),
          }
        : null;
    create.mutate(
      {
        type: 'giving',
        name: name.trim(),
        purpose: form.kind,
        mode: form.viewerId ? 'shared' : 'private',
        members: form.viewerId ? [{ user_id: form.viewerId, role: 'viewer' }] : undefined,
        giving: {
          kind: form.kind,
          source_wallet_id: source.id,
          recipients: form.recipients.map(recipientRef) as ({ saved_account_id: number } | { group_id: number })[],
          set_aside: [
            ...(form.percentOn ? [{ kind: 'percent' as const, source_wallet_id: source.id, percent: form.percent }] : []),
            ...(form.fixedOn ? [{ kind: 'fixed' as const, source_wallet_id: source.id, amount: form.fixed, day_of_month: form.fixedDay }] : []),
            ...(form.roundupOn && main ? [{ kind: 'roundup' as const, source_wallet_id: main.id, roundup_to: form.roundupTo }] : []),
            ...form.extra.map((l) =>
              l.kind === 'percent'
                ? { kind: 'percent' as const, source_wallet_id: l.sourceId, percent: l.percent }
                : { kind: 'fixed' as const, source_wallet_id: l.sourceId, amount: l.amount, day_of_month: l.day },
            ),
          ],
          schedules: form.schedules.map((x) => ({
            label: x.label,
            amount: x.amount,
            ...recipientRef(x.payee),
            frequency: x.frequency,
            day_of_week: x.frequency === 'weekly' || x.frequency === 'monthly_weekday' ? x.dayOfWeek : undefined,
            day_of_month: x.frequency === 'monthly' ? x.dayOfMonth : undefined,
            week_of_month: x.frequency === 'monthly_weekday' ? x.weekOfMonth : undefined,
            run_on: x.frequency === 'once' ? x.runOn ?? undefined : undefined,
          })),
          ask_first: form.askFirst,
          thanksgiving_reminder: form.thanksgiving,
          pledge,
          receipts: form.receipts,
          yearly_statement: form.statement,
          anonymous: form.anonymous,
        },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const upcoming = [
            ...form.schedules.map((x) => ({ date: nextGivingDate(x), title: x.label, to: recipientInfo(x.payee)?.name ?? '', amount: x.amount })),
            ...(pledge ? parts.map((p, i) => ({ date: new Date(`${p.date}T00:00:00`), title: parts.length > 1 ? `Pledge part ${i + 1}` : 'Pledge', to: form.pledge.name.trim(), amount: String(p.amount) })) : []),
          ]
            .filter((u): u is { date: Date; title: string; to: string; amount: string } => u.date !== null)
            .sort((a, b) => a.date.getTime() - b.date.getTime());
          const first = upcoming[0];
          const soon = first && first.date.getTime() - Date.now() < 8 * 86_400_000;
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: 'Giving is set up',
              subtitle: [
                first ? `Your first ${first.title.toLowerCase()} goes on ${longDate(first.date)} at 7:00 am.` : null,
                form.percentOn ? `We'll set aside ${form.percent}% when money lands in ${source.name}.` : null,
              ]
                .filter(Boolean)
                .join(' '),
              caption: '',
              events: [],
              payments: upcoming.slice(0, 3).map((u) => ({ title: u.title, sub: `${u.to} · ${shortDate(u.date)}`, amount: u.amount })),
              note: soon ? `The first ${first.title.toLowerCase()} comes from ${source.name} this week, since nothing is set aside yet.` : undefined,
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

  const header = { title: 'Giving wallet', step: flow.index + 1, total: STEPS.length };
  const footer = (title: string, onPress = next, loading = false, extraButton?: React.ReactNode) => (
    <>
      {error ? (
        <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
          {error}
        </PtText>
      ) : null}
      <PtButton title={title} onPress={onPress} loading={loading} />
      {extraButton}
    </>
  );

  // ------------------------------------------------------------ GIV-01
  if (step === 'kind') {
    return (
      <PtStepScreen onBack={back} flow={header} title="What kind of giving?" subtitle="Set money aside first, so giving never feels squeezed." gap={16} footer={footer('Continue')}>
        <View style={{ gap: 10 }}>
          {GIVING_KINDS.map((k) => (
            <PtChoiceCard
              key={k.value}
              title={k.title}
              subtitle={k.line}
              icon={k.icon}
              selected={form.kind === k.value}
              onPress={() => {
                if (GIVING_KINDS.some((x) => x.name === name.trim()) || !name.trim()) setName(k.name);
                set({ kind: k.value, schedules: [] });
              }}
            />
          ))}
        </View>
        <PtField label="Wallet name" value={name} onChangeText={setName} placeholder="Tithes and offerings" maxLength={100} />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GIV-02
  if (step === 'recipients') {
    const results = (orgs.data?.organisations ?? []).filter((o) => !accounts.some((a) => a.organisation?.id === o.id && form.recipients.includes(`a${a.id}`)));
    return (
      <PtStepScreen onBack={back} flow={header} title="Who receives it?" subtitle="Pick from verified organisations or add an account." gap={16} footer={footer('Continue')}>
        <PtField label="Search" value={q} onChangeText={setQ} placeholder="Search churches, mosques, charities" />
        {q.trim().length >= 2 ? (
          <PtPanel>
            {orgs.isLoading ? <ActivityIndicator color={pt.brand} style={{ paddingVertical: 14 }} /> : null}
            {!orgs.isLoading && results.length === 0 ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 14 }}>No organisation by that name yet. Add its account instead.</Text>
            ) : null}
            {results.map((o, i) => (
              <React.Fragment key={o.id}>
                {i > 0 ? <PtDivider /> : null}
                <Pressable
                  onPress={() =>
                    saveAccount.mutate(
                      { organisation_id: o.id },
                      {
                        onSuccess: (r) => {
                          set({ recipients: [...form.recipients.filter((k) => k !== `a${r.account.id}`), `a${r.account.id}`] });
                          setQ('');
                        },
                        onError: (e) => setError(e.message),
                      },
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${o.name}`}
                  style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                >
                  <PtAvatar initials={initials(o.name)} tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                      {o.name}
                    </Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                      {[o.kind.charAt(0).toUpperCase() + o.kind.slice(1), o.area, o.state].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {o.verified ? <PtChip label="Verified" tone="success" icon="check" /> : null}
                </Pressable>
              </React.Fragment>
            ))}
          </PtPanel>
        ) : null}

        {chosen.length ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Chosen · from your saved accounts</PtGroupLabel>
            <PtPanel>
              {chosen.map((r, i) => (
                <React.Fragment key={r.key}>
                  {i > 0 ? <PtDivider /> : null}
                  <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                    <PtAvatar initials={initials(r.name)} tone={r.group ? 'deep' : AVATAR_CYCLE[(i + 2) % AVATAR_CYCLE.length]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={2}>
                        {r.name}
                        {r.group ? ' (group)' : ''}
                      </Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={2}>
                        {r.sub}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        selection();
                        set({ recipients: form.recipients.filter((k) => k !== r.key), schedules: form.schedules.filter((x) => x.payee !== r.key) });
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${r.name}`}
                    >
                      <PtChip label={r.verified ? 'Verified' : 'Checked'} tone={r.verified ? 'success' : 'neutral'} icon={r.verified ? 'check' : 'circle'} />
                    </Pressable>
                  </View>
                </React.Fragment>
              ))}
            </PtPanel>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PtButton title="Choose saved" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setSheet('saved')} />
          <PtButton
            title="+ New account"
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => navigation.navigate('AddRecipient', { context: name.trim(), returnTo: 'GivingWalletSetup' })}
          />
        </View>
        <PtNote>Verified means Patriai has confirmed the organisation and its accounts. Others are checked by account name only.</PtNote>

        <ChooseSavedSheet
          visible={sheet === 'saved'}
          chosen={form.recipients}
          onDone={(keys) => {
            set({ recipients: keys, schedules: form.schedules.filter((x) => keys.includes(x.payee)) });
            setSheet(null);
          }}
          onAddNew={() => {
            setSheet(null);
            navigation.navigate('AddRecipient', { context: name.trim(), returnTo: 'GivingWalletSetup' });
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GIV-03
  if (step === 'aside') {
    const others = ownWallets.filter((w) => w.id !== source?.id);
    return (
      <PtStepScreen onBack={back} flow={header} title="How should we set money aside?" gap={12} footer={footer('Continue')}>
        <PtChoiceCard
          kind="check"
          title={`${form.percent}% of every deposit`}
          subtitle={form.kind === 'tithes' ? 'For tithe. Moves the moment money lands.' : 'Moves the moment money lands.'}
          selected={form.percentOn}
          onPress={() => set({ percentOn: !form.percentOn })}
          extra={
            form.percentOn ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.ink, marginTop: 4 }}>
                {percentEstimate > 0 ? (
                  <>
                    About <Text style={{ fontFamily: ptFont.bold }}>{formatNaira(percentEstimate)}</Text> a month
                  </>
                ) : (
                  `${form.percent}% of what lands in ${source?.name ?? 'Main'}`
                )}
              </Text>
            ) : null
          }
        />
        {form.percentOn ? (
          <PtPills options={[5, 10, 15, 20].map((p) => ({ value: p, label: `${p}%` }))} value={form.percent} onChange={(p) => set({ percent: p })} />
        ) : null}
        <PtChoiceCard
          kind="check"
          title="A fixed amount each month"
          subtitle="For offerings and charity."
          selected={form.fixedOn}
          onPress={() => set({ fixedOn: !form.fixedOn })}
          extra={
            form.fixedOn ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.ink, marginTop: 4 }}>
                <Text style={{ fontFamily: ptFont.bold }}>{formatNaira(form.fixed || 0)}</Text> on the {ordinal(form.fixedDay)}
              </Text>
            ) : null
          }
        />
        {form.fixedOn ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <PtField label="Each month" prefix="₦" value={groupAmountInput(form.fixed)} onChangeText={(t) => set({ fixed: sanitizeAmountInput(t) })} placeholder="20,000" keyboardType="decimal-pad" />
            </View>
            <PtButton title={`The ${ordinal(form.fixedDay)}`} variant="secondary" size="sm" style={{ height: 56 }} onPress={() => setSheet('fixedDay')} />
          </View>
        ) : null}
        <PtChoiceCard kind="check" title="Round-ups" subtitle="Spare change from spending." selected={form.roundupOn} onPress={() => set({ roundupOn: !form.roundupOn })} />
        {form.roundupOn ? (
          <PtSegmented
            options={[
              { value: '100', label: '₦100' },
              { value: '500', label: '₦500' },
              { value: '1000', label: '₦1,000' },
            ]}
            value={form.roundupTo}
            onChange={(v) => set({ roundupTo: v as GivingForm['roundupTo'] })}
          />
        ) : null}

        <PtPanel>
          <PtReviewRow
            label="Take money from"
            value={source?.name ?? 'Choose a wallet'}
            sub={source ? `${formatMoney(source.balance)} available` : null}
            onEdit={() => setSheet('source')}
            last={form.extra.length === 0}
          />
          {form.extra.map((l, i) => {
            const w = ownWallets.find((x) => x.id === l.sourceId);
            return (
              <PtReviewRow
                key={l.key}
                label="Also from"
                value={`${w?.name ?? 'A wallet'} · ${l.kind === 'percent' ? `${l.percent}% of every deposit` : `${formatNaira(l.amount)} on the ${ordinal(l.day)}`}`}
                onEdit={() => setExtra(l)}
                last={i === form.extra.length - 1}
              />
            );
          })}
        </PtPanel>
        {others.length ? (
          <PtAddRow
            label="Set aside from another wallet too"
            onPress={() => setExtra({ key: '', sourceId: others[0].id, kind: 'percent', percent: 10, amount: '', day: 25 })}
          />
        ) : null}
        <PtNote>Money set aside stays in this wallet until a giving date. You can always see it.</PtNote>

        <PtOptionSheet
          visible={sheet === 'source'}
          title="Take money from"
          options={ownWallets.map((w) => ({ value: w.id, label: w.name, hint: `${formatMoney(w.balance)} available` }))}
          value={source?.id ?? null}
          onPick={(id) => {
            set({ sourceId: id, extra: form.extra.filter((l) => l.sourceId !== id) });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'fixedDay'}
          title="Set aside on"
          options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `The ${ordinal(i + 1)}` }))}
          value={form.fixedDay}
          onPick={(d) => {
            set({ fixedDay: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <ExtraLineSheet
          line={extra}
          wallets={others.map((w) => ({ id: w.id, name: w.name }))}
          onSave={(l) => {
            set({ extra: l.key ? form.extra.map((x) => (x.key === l.key ? l : x)) : [...form.extra, { ...l, key: `x${Date.now()}` }] });
            setExtra(null);
          }}
          onRemove={() => {
            set({ extra: form.extra.filter((x) => x.key !== extra?.key) });
            setExtra(null);
          }}
          onClose={() => setExtra(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GIV-04
  if (step === 'when') {
    const payees = chosen.map((r) => ({ key: r.key as RecipientKey, name: r.name, size: r.size }));
    return (
      <PtStepScreen onBack={back} flow={header} title="When should it go out?" subtitle="Payments go at 7:00 am so they arrive before service." gap={14} footer={footer('Continue')}>
        {form.schedules.length ? (
          <PtPanel>
            {form.schedules.map((x, i) => {
              const r = recipientInfo(x.payee);
              const each = r && r.size > 1 ? ` · ${formatNaira(Math.floor((Number(x.amount) || 0) / r.size))} each` : '';
              return (
                <React.Fragment key={x.key}>
                  {i > 0 ? <PtDivider /> : null}
                  <Pressable
                    onPress={() => setSchedule(x)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${x.label}`}
                    style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="calendar" size={18} color={pt.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{x.label}</Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.inkMuted }}>
                        {r?.name ?? 'Choose who receives it'}
                        {each} · {whenLabel(x)}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(x.amount || 0)}</Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </PtPanel>
        ) : null}
        <PtAddRow
          label="Add a giving date"
          onPress={() => setSchedule({ key: '', label: '', amount: '', payee: chosen[0]?.key as RecipientKey, frequency: 'weekly', dayOfWeek: 7, dayOfMonth: 15, weekOfMonth: 1, runOn: null })}
        />
        <PtPanel>
          <PtSwitchRow
            title="Ask me before each payment"
            subtitle={form.askFirst ? 'On: we ask you each time' : 'Off: it goes automatically'}
            value={form.askFirst}
            onChange={(v) => set({ askFirst: v })}
          />
          <PtDivider />
          <PtSwitchRow title="Thanksgiving and special Sundays" subtitle="Remind me to add a one-off" value={form.thanksgiving} onChange={(v) => set({ thanksgiving: v })} />
        </PtPanel>

        <ScheduleSheet
          initial={schedule}
          recipients={payees}
          onSave={(x) => {
            set({ schedules: x.key ? form.schedules.map((y) => (y.key === x.key ? x : y)) : [...form.schedules, { ...x, key: `s${Date.now()}` }] });
            setSchedule(null);
          }}
          onRemove={() => {
            set({ schedules: form.schedules.filter((y) => y.key !== schedule?.key) });
            setSchedule(null);
          }}
          onClose={() => setSchedule(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GIV-05
  if (step === 'pledge') {
    const pct = pledgeTotal > 0 ? Math.min(100, (pledgePaid / pledgeTotal) * 100) : 0;
    const ready = pledgeTotal > 0 && pledgeLeft > 0 && Boolean(form.pledge.due);
    const payee = form.pledge.payee ? recipientInfo(form.pledge.payee) : null;
    const setPledge = (patch: Partial<GivingForm['pledge']>) => set({ pledgeOn: true, pledge: { ...form.pledge, ...patch } });
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="Have you made a pledge?"
        subtitle="Track a promise and pay it off in parts."
        gap={14}
        footer={footer('Continue', next, false, (
          <PtButton
            title="No pledge for now"
            variant="ghost"
            onPress={() => {
              set({ pledgeOn: false });
              setError(null);
              flow.next();
            }}
          />
        ))}
      >
        {ready ? (
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>
                {form.pledge.name || 'Your pledge'}
              </Text>
              <PtChip label={`${formatNaira(pledgeLeft)} to go`} tone="warning" icon="clock" />
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.line, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: 6, backgroundColor: pt.gold500 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{formatNaira(pledgePaid)} paid</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>of {formatNaira(pledgeTotal)}</Text>
            </View>
          </View>
        ) : null}
        <PtField label="What is it for" value={form.pledge.name} onChangeText={(t) => setPledge({ name: t })} placeholder="Church building fund" maxLength={80} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PtField label="You pledged" prefix="₦" value={groupAmountInput(form.pledge.total)} onChangeText={(t) => setPledge({ total: sanitizeAmountInput(t) })} placeholder="500,000" keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <PtField label="Paid so far" prefix="₦" value={groupAmountInput(form.pledge.paid)} onChangeText={(t) => setPledge({ paid: sanitizeAmountInput(t) })} placeholder="0" keyboardType="decimal-pad" />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>Pay by</Text>
          <Pressable
            onPress={() => setSheet('due')}
            accessibilityRole="button"
            accessibilityLabel="Pay by"
            style={{ height: 56, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, paddingHorizontal: 16, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: ptFont.medium, fontSize: 16, color: form.pledge.due ? pt.ink : pt.inkSubtle }}>{form.pledge.due ? formatYmd(form.pledge.due) : '31 Dec'}</Text>
          </Pressable>
        </View>
        <PtPanel>
          <PtReviewRow label="Goes to" value={payee?.name ?? 'Choose who receives it'} onEdit={() => setSheet('payee')} last />
        </PtPanel>
        {ready ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Pay the rest</PtGroupLabel>
            {partsIfSplit.length > 1 ? (
              <PtChoiceCard
                title={`${formatNaira(partsIfSplit[0].amount)} on ${partDates(partsIfSplit)}`}
                subtitle={`From ${main?.name ?? 'Main'}, after salary.`}
                selected={form.pledge.plan === 'parts'}
                onPress={() => setPledge({ plan: 'parts' })}
              />
            ) : null}
            <PtChoiceCard
              title={`All at once on ${form.pledge.due ? formatYmd(form.pledge.due).replace(/ \d{4}$/, '') : 'the day'}`}
              subtitle={`${formatNaira(pledgeLeft)} from ${main?.name ?? 'Main'}.`}
              selected={form.pledge.plan === 'once' || partsIfSplit.length <= 1}
              onPress={() => setPledge({ plan: 'once' })}
            />
          </View>
        ) : null}

        <PtDateSheet
          visible={sheet === 'due'}
          title="Pay by"
          value={form.pledge.due ?? toYmd(new Date(new Date().getFullYear(), 11, 31))}
          minYear={new Date().getFullYear()}
          maxYear={new Date().getFullYear() + 5}
          doneLabel="Done"
          onDone={(ymd) => {
            setPledge({ due: ymd });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'payee'}
          title="Goes to"
          options={chosen.map((r) => ({ value: r.key, label: r.name, hint: r.sub }))}
          value={form.pledge.payee}
          onPick={(k) => {
            setPledge({ payee: k as RecipientKey });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ GIV-06
  if (step === 'records') {
    return (
      <PtStepScreen onBack={back} flow={header} title="Records and privacy" gap={16} footer={footer('Review')}>
        <PtPanel>
          <PtSwitchRow title="Receipt after every payment" subtitle={me?.email ? `Sent to ${me.email}` : 'In the app and by email'} value={form.receipts} onChange={(v) => set({ receipts: v })} />
          <PtDivider />
          <PtSwitchRow title="Yearly giving statement" subtitle="Emailed every January" value={form.statement} onChange={(v) => set({ statement: v })} />
          <PtDivider />
          <PtSwitchRow
            title="Give anonymously"
            subtitle={`${form.kind === 'tithes' ? 'The church sees' : 'They see'} "Patriai member", not your name`}
            value={form.anonymous}
            onChange={(v) => set({ anonymous: v })}
          />
        </PtPanel>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Who can see this wallet</PtGroupLabel>
          <PtChoiceCard title="Only me" subtitle="Family sees nothing about it." selected={!form.viewerId} onPress={() => set({ viewerId: null })} />
          {spouse ? (
            <PtChoiceCard
              title={`Me and ${firstName(spouse.name)}`}
              subtitle="They can see it, but can't change it."
              selected={form.viewerId === spouse.id}
              onPress={() => set({ viewerId: spouse.id })}
            />
          ) : null}
        </View>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const asideParts = [
    form.percentOn ? `${form.percent}% of deposits` : null,
    form.fixedOn ? `${formatNaira(form.fixed || 0)} a month` : null,
    form.roundupOn ? 'round-ups' : null,
    ...form.extra.map((l) => (l.kind === 'percent' ? `${l.percent}% from ${ownWallets.find((w) => w.id === l.sourceId)?.name ?? 'another wallet'}` : `${formatNaira(l.amount)} from ${ownWallets.find((w) => w.id === l.sourceId)?.name ?? 'another wallet'}`)),
  ].filter(Boolean);
  const viewer = form.viewerId ? (family.data?.members ?? []).find((m) => m.id === form.viewerId) : null;
  return (
    <PtStepScreen onBack={back} flow={header} title="Review your giving" subtitle="Check everything. You can edit before you create." gap={16} footer={footer('Create wallet', submit, create.isPending)}>
      <PtPanel>
        <PtReviewRow label="Name" value={name.trim()} sub={viewer ? `${firstName(viewer.name)} can see it` : 'Only you can see it'} onEdit={() => flow.goTo('kind')} />
        <PtReviewRow
          label="Set aside"
          value={asideParts.length ? asideParts.join(' + ') : 'When you add money'}
          sub={monthlyAside > 0 ? `About ${formatNaira(Math.round(monthlyAside / 500) * 500)} a month from ${source?.name ?? 'Main'}${form.extra.length ? ' and more' : ''}` : null}
          onEdit={() => flow.goTo('aside')}
        />
        {form.schedules.map((x) => {
          const r = recipientInfo(x.payee);
          return (
            <PtReviewRow
              key={x.key}
              label={x.label}
              value={`${formatNaira(x.amount || 0)} · ${whenLabel(x).charAt(0).toLowerCase()}${whenLabel(x).slice(1)}`}
              sub={r ? `${r.name}${r.size > 1 ? ` · split ${Array.from({ length: r.size }, () => Math.round(100 / r.size)).join('/')}` : ''}` : null}
              onEdit={() => flow.goTo('when')}
            />
          );
        })}
        <PtReviewRow
          label="Pledge"
          value={form.pledgeOn && parts.length ? `${formatNaira(parts[0].amount)} on ${partDates(parts)}` : 'No pledge'}
          sub={form.pledgeOn ? `${form.pledge.name.trim()}, ${formatNaira(pledgeLeft)} left` : null}
          onEdit={() => flow.goTo('pledge')}
          last
        />
      </PtPanel>
      {form.askFirst ? <PtNote>We'll ask you before each payment goes.</PtNote> : null}
    </PtStepScreen>
  );
}

/** GIV-03 "Set aside from another wallet too" — a share of its deposits or a fixed amount. */
function ExtraLineSheet({
  line,
  wallets,
  onSave,
  onRemove,
  onClose,
}: {
  line: ExtraLine | null;
  wallets: { id: number; name: string }[];
  onSave: (l: ExtraLine) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [l, setL] = useState<ExtraLine | null>(line);
  const [openedFor, setOpenedFor] = useState<ExtraLine | null>(null);
  if (line !== openedFor) {
    setOpenedFor(line);
    setL(line);
  }
  const ok = l && (l.kind === 'percent' ? l.percent > 0 : Number(l.amount) > 0);
  return (
    <PtSheet
      visible={Boolean(line)}
      title="Set aside from another wallet"
      subtitle="A share of what lands in it, or a fixed amount"
      onClose={onClose}
      footer={
        <>
          <PtButton title="Save" disabled={!ok} onPress={() => l && onSave(l)} />
          {line?.key ? <PtButton title="Remove" variant="ghost" onPress={onRemove} /> : null}
        </>
      }
    >
      {l ? (
        <>
          <PtGroupLabel>From</PtGroupLabel>
          <PtPills options={wallets.map((w) => ({ value: w.id, label: w.name }))} value={l.sourceId} onChange={(id) => setL({ ...l, sourceId: id })} />
          <PtSegmented
            options={[
              { value: 'percent', label: 'Share of deposits' },
              { value: 'fixed', label: 'Fixed amount' },
            ]}
            value={l.kind}
            onChange={(k) => setL({ ...l, kind: k as ExtraLine['kind'] })}
          />
          {l.kind === 'percent' ? (
            <PtPills options={[5, 10, 15, 20].map((p) => ({ value: p, label: `${p}%` }))} value={l.percent} onChange={(p) => setL({ ...l, percent: p })} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PtField label="Each month" prefix="₦" value={groupAmountInput(l.amount)} onChangeText={(t) => setL({ ...l, amount: sanitizeAmountInput(t) })} placeholder="5,000" keyboardType="decimal-pad" />
              </View>
              <View style={{ width: 110 }}>
                <PtField
                  label="On day"
                  value={String(l.day)}
                  onChangeText={(t) => setL({ ...l, day: Math.min(28, Number(t.replace(/\D/g, '').slice(0, 2)) || 1) })}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </View>
          )}
        </>
      ) : null}
    </PtSheet>
  );
}

