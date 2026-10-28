import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtSlider } from '../../components/pt/PtSlider';
import { PtChoiceCard, PtDivider, PtGroupLabel, PtNote, PtPanel, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { useCreateWallet, useFamily, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, initials } from '../../lib/format';
import { DEFAULT_COUNTRY, formatE164, isValidE164, toE164, type Country } from '../../lib/phone';
import { ordinal } from '../../lib/goalPlan';
import { roleLabel } from '../../lib/governance';
import { JOINT_SPLITS, contributionLine, splitShort } from '../../lib/joint';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { JointMode, JointSplit, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'partner' | 'money' | 'spend' | 'notify' | 'leave' | 'review';
const STEPS: Step[] = ['partner', 'money', 'spend', 'notify', 'leave', 'review'];

/** JNT-03 slider: ₦5,000 steps up to ₦200,000 a payment. */
const SLIDER_STEP = 5_000;
const SLIDER_MAX = 40;
const DAY_LIMITS = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000, 1_000_000];
const NOTICE_DAYS = [0, 7, 14, 30, 60, 90];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface JointForm {
  partnerId: number | null;
  phone: string;
  mode: JointMode;
  total: string;
  /** Share of income: my percent of the total. */
  myPercent: number;
  /** Fixed: each person's own amount. */
  mine: string;
  theirs: string;
  day: number;
  short: 'retry' | 'skip';
  perPayment: number;
  perDay: number;
  expiryHours: number;
  newAccount: boolean;
  personal: boolean;
  rules: boolean;
  weekly: boolean;
  statement: boolean;
  bigPayment: boolean;
  split: JointSplit;
  noticeDays: number;
}

const EMPTY: JointForm = {
  partnerId: null,
  phone: '',
  mode: 'equal',
  total: '300000',
  myPercent: 50,
  mine: '150000',
  theirs: '150000',
  day: 26,
  short: 'retry',
  perPayment: 50_000,
  perDay: 100_000,
  expiryHours: 24,
  newAccount: true,
  personal: true,
  rules: true,
  weekly: true,
  statement: true,
  bigPayment: true,
  split: 'contributed',
  noticeDays: 30,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The next time the monthly day comes round: "Thursday, 26 Nov". */
function nextDay(day: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (d.getDate() >= day) d.setMonth(d.getMonth() + 1, 1);
  d.setDate(day);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * Joint wallet from the client prototype: JNT-01 who you run money with →
 * JNT-02 how you each put money in → JNT-03 what each can spend alone → JNT-04
 * notifications → JNT-05 if one of you leaves → WCR-06 review → WCR-07 waiting
 * for the partner to accept with their PIN. Auto-saved as a draft.
 */
export function JointWalletSetupScreen(props: RootScreenProps<'JointWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <JointSetup {...props} draft={draft} />;
}

function JointSetup({ navigation, draft }: RootScreenProps<'JointWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const create = useCreateWallet();

  const [name, setName] = useState(draft?.name ?? '');
  const [nameTouched, setNameTouched] = useState(Boolean(draft?.name));
  const [form, setForm] = useState<JointForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<JointForm>) }));
  const set = (patch: Partial<JointForm>) => setForm((f) => ({ ...f, ...patch }));
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'day' | 'short' | 'perDay' | 'expiry' | 'notice' | 'percent'>(null);

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'joint',
    name,
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(form.partnerId || form.phone || flow.index > 0),
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

  const members = (family.data?.members ?? []).filter((m) => !['vendor', 'child'].includes(m.role));
  const main = (wallets.data ?? []).find((w) => w.type === 'main' && w.my_role === 'owner');
  const myName = firstName(me?.full_name ?? 'You');
  const partner = members.find((m) => m.id === form.partnerId) ?? null;
  const e164 = form.phone ? toE164(country.dial, form.phone) : '';
  const partnerName = partner ? firstName(partner.name) : e164 ? formatE164(e164) : 'your partner';
  const partnerInitials = partner ? initials(partner.name) : '+';

  // JNT-02 amounts, whole naira.
  const total = Number(form.total) || 0;
  const mine = form.mode === 'fixed' ? Number(form.mine) || 0 : form.mode === 'equal' ? Math.round(total / 2) : Math.round((total * form.myPercent) / 100);
  const theirs = form.mode === 'fixed' ? Number(form.theirs) || 0 : total - mine;
  const monthly = mine + theirs;
  const pct = (n: number) => (monthly > 0 ? Math.round((n / monthly) * 100) : 0);

  const pickPartner = (id: number) => {
    selection();
    const m = members.find((x) => x.id === id);
    set({ partnerId: id, phone: '' });
    if (!nameTouched && m) setName(`${myName} and ${firstName(m.name)}`);
  };

  const validate = (s: Step): string | null => {
    if (s === 'partner') {
      if (!form.partnerId && !form.phone) return 'Choose who you run this wallet with.';
      if (!form.partnerId && !isValidE164(e164)) return 'Enter a valid phone number.';
      if (!name.trim()) return 'Give the wallet a name.';
    }
    if (s === 'money') {
      if (!(monthly > 0)) return 'Enter how much goes in each month.';
      if (mine > 0 && !main) return 'You need a Main wallet to pay your share from.';
    }
    if (s === 'spend' && form.perDay < form.perPayment) return 'The day limit can\'t be less than one payment.';
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    flow.next();
  };

  const submit = () => {
    for (const s of ['partner', 'money', 'spend'] as Step[]) {
      const problem = validate(s);
      if (problem) {
        setError(problem);
        flow.goTo(s);
        return;
      }
    }
    setError(null);
    autosave.stop();
    create.mutate(
      {
        type: 'joint',
        name: name.trim(),
        mode: 'shared',
        source_wallet_id: mine > 0 ? main?.id : undefined,
        members: [{ ...(form.partnerId ? { user_id: form.partnerId } : { identifier: e164 }), role: 'co_owner', pledge: String(theirs), pledge_kind: 'period' }],
        joint: {
          contribution: { mode: form.mode, day: form.day, mine: String(mine), partner: String(theirs) },
          short: form.short,
          limits: { per_payment: String(form.perPayment), per_day: String(form.perDay) },
          expiry_hours: form.expiryHours,
          always: { new_account: form.newAccount, personal: form.personal, rules: form.rules },
          notify: { weekly: form.weekly, statement: form.statement, big_payment: form.bigPayment, big_amount: String(form.perDay) },
          leave: { split: form.split, notice_days: form.noticeDays },
        },
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const invite = res.wallet.joint?.invitation ?? null;
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: `Waiting for ${partnerName}`,
              subtitle: `We've sent ${partnerName} the rules to accept. Once they do, your joint wallet gets its own account number.`,
              caption: '',
              events: [
                { label: partnerName, title: 'Invite sent', sub: 'Expires in 7 days' },
                { label: 'Account number', title: `Ready when ${partnerName} accepts`, sub: 'Assetmatrix MFB' },
                { label: 'First contribution', title: nextDay(form.day) },
              ],
              waiting: {
                initials: [initials(me?.full_name), partnerInitials],
                remind: invite ? { label: `Remind ${partnerName}`, invitationId: invite.id } : null,
              },
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

  const header = { title: 'Joint wallet', step: flow.index + 1, total: STEPS.length };
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
  const personRow = (avatar: React.ReactNode, title: string, sub: string, right: React.ReactNode, first = false) => (
    <React.Fragment key={title}>
      {first ? null : <PtDivider />}
      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        {avatar}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {right}
      </View>
    </React.Fragment>
  );
  const amountText = (n: number) => <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{formatNaira(n)}</Text>;

  // ------------------------------------------------------------ JNT-01
  if (step === 'partner') {
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="Who are you running money with?"
        subtitle="A joint wallet is shared equally between two people."
        gap={14}
        footer={footer('Continue')}
      >
        {members.length ? (
          <View style={{ gap: 10 }}>
            <PtGroupLabel>From your family</PtGroupLabel>
            {members.map((m) => (
              <PtChoiceCard
                key={m.id}
                title={m.name}
                subtitle={`${roleLabel(m.role)} · ${m.verified ? 'verified' : 'not verified yet'}`}
                selected={form.partnerId === m.id}
                onPress={() => pickPartner(m.id)}
              />
            ))}
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          <PtGroupLabel>Someone else</PtGroupLabel>
          <PtPhoneField
            label="Phone number"
            country={country}
            onChangeCountry={setCountry}
            value={form.phone}
            onChange={(digits) => {
              set({ phone: digits, partnerId: digits ? null : form.partnerId });
              if (!nameTouched) setName(digits ? `${myName}'s joint wallet` : '');
            }}
          />
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>We send them an invite. Both of you must be verified.</Text>
        </View>
        <PtField
          label="Wallet name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setNameTouched(true);
          }}
          placeholder={`${myName} and Emeka`}
          maxLength={100}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ JNT-02
  if (step === 'money') {
    return (
      <PtStepScreen onBack={back} flow={header} title="How do you each put money in?" gap={16} footer={footer('Continue')}>
        <PtSegmented
          options={[
            { value: 'equal', label: 'Equal' },
            { value: 'income', label: 'Share of income' },
            { value: 'fixed', label: 'Fixed' },
          ]}
          value={form.mode}
          onChange={(v) => {
            const mode = v as JointMode;
            // Fixed starts from the amounts you had.
            set(mode === 'fixed' ? { mode, mine: String(mine), theirs: String(theirs) } : { mode, total: String(monthly || total) });
          }}
        />
        <View style={{ alignItems: 'center', gap: 4, paddingVertical: 4 }}>
          {form.mode === 'fixed' ? (
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 44, letterSpacing: -1, color: pt.ink }}>{formatNaira(monthly)}</Text>
          ) : (
            <PtHeroAmount
              value={form.total}
              onChange={(v) => {
                set({ total: v });
                setError(null);
              }}
              label="Monthly total"
            />
          )}
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>a month into the joint wallet</Text>
        </View>
        <PtPanel>
          {personRow(
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />,
            myName,
            `From Main · ${pct(mine)}%`,
            form.mode === 'fixed' ? (
              <PtAmountBox value={form.mine} onChange={(v) => set({ mine: v })} label="Your amount" />
            ) : form.mode === 'income' ? (
              <Pressable onPress={() => setSheet('percent')} accessibilityRole="button" accessibilityLabel="Your share of income">
                {amountText(mine)}
              </Pressable>
            ) : (
              amountText(mine)
            ),
            true,
          )}
          {personRow(
            <PtAvatar initials={partnerInitials} tone={partner ? 'mint' : 'gold'} />,
            partnerName,
            `From their Main · ${pct(theirs)}%`,
            form.mode === 'fixed' ? <PtAmountBox value={form.theirs} onChange={(v) => set({ theirs: v })} label={`Amount for ${partnerName}`} /> : amountText(theirs),
          )}
        </PtPanel>
        {form.mode === 'income' ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Tap your amount to change your share. Whoever earns more puts in more.</Text>
        ) : null}
        <PtPanel>
          <PtReviewRow label="When" value={`Every ${ordinal(form.day)}${form.day === 26 ? ', the day after salary' : ''}`} onEdit={() => setSheet('day')} />
          <PtReviewRow
            label="If one of you is short"
            value={form.short === 'retry' ? 'Remind both, try again in 2 days' : 'Remind both, wait for next month'}
            onEdit={() => setSheet('short')}
            last
          />
        </PtPanel>
        <PtOptionSheet
          visible={sheet === 'day'}
          title="Pay in on"
          options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `The ${ordinal(i + 1)}`, hint: i + 1 === 26 ? 'The day after salary' : undefined }))}
          value={form.day}
          onPick={(d) => {
            set({ day: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'short'}
          title="If one of you is short"
          options={[
            { value: 'retry', label: 'Remind both, try again in 2 days' },
            { value: 'skip', label: 'Remind both, wait for next month' },
          ]}
          value={form.short}
          onPick={(v) => {
            set({ short: v as 'retry' | 'skip' });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'percent'}
          title="Your share"
          options={[30, 35, 40, 45, 50, 55, 60, 65, 70].map((p) => ({ value: p, label: `${p}%`, hint: `${partnerName} ${100 - p}%` }))}
          value={form.myPercent}
          onPick={(p) => {
            set({ myPercent: p });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ JNT-03
  if (step === 'spend') {
    const always: { key: 'newAccount' | 'personal' | 'rules'; label: string }[] = [
      { key: 'newAccount', label: 'Sending to a new account' },
      { key: 'personal', label: 'Moving money out to a personal wallet' },
      { key: 'rules', label: 'Changing these rules' },
    ];
    return (
      <PtStepScreen onBack={back} flow={header} title="What can each of you spend alone?" subtitle="Above these limits, you both approve." gap={14} footer={footer('Continue')}>
        <PtPanel>
          <View style={{ paddingVertical: 14, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Per payment</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.brand }}>{formatNaira(form.perPayment)}</Text>
            </View>
            <PtSlider
              value={Math.round(form.perPayment / SLIDER_STEP)}
              min={1}
              max={SLIDER_MAX}
              onChange={(v) => {
                const perPayment = v * SLIDER_STEP;
                set({ perPayment, perDay: Math.max(form.perDay, perPayment) });
              }}
              label="Per payment"
            />
          </View>
        </PtPanel>
        <PtPanel>
          <PtReviewRow label="Alone, each day" value={`Up to ${formatNaira(form.perDay)} in total`} onEdit={() => setSheet('perDay')} />
          <PtReviewRow label="Above the limit" value="The other person approves" sub={`Expires after ${form.expiryHours} hours`} onEdit={() => setSheet('expiry')} last />
        </PtPanel>
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Always need both of you</PtGroupLabel>
          <PtPanel>
            {always.map((a, i) => (
              <React.Fragment key={a.key}>
                {i ? <PtDivider /> : null}
                <Pressable
                  onPress={() => {
                    selection();
                    set({ [a.key]: !form[a.key] } as Partial<JointForm>);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form[a.key] }}
                  accessibilityLabel={a.label}
                  style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }}>{a.label}</Text>
                  <PtCheckbox checked={form[a.key]} />
                </Pressable>
              </React.Fragment>
            ))}
          </PtPanel>
        </View>
        <PtOptionSheet
          visible={sheet === 'perDay'}
          title="Alone, each day"
          options={DAY_LIMITS.filter((d) => d >= form.perPayment).map((d) => ({ value: d, label: `Up to ${formatNaira(d)}` }))}
          value={form.perDay}
          onPick={(d) => {
            set({ perDay: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
        <PtOptionSheet
          visible={sheet === 'expiry'}
          title="If the other person doesn't answer"
          options={[24, 48, 72].map((h) => ({ value: h, label: `Expires after ${h} hours` }))}
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

  // ------------------------------------------------------------ JNT-04
  if (step === 'notify') {
    const alwaysOn = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name="lock" size={16} color={pt.brand} />
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Always on</Text>
      </View>
    );
    return (
      <PtStepScreen onBack={back} flow={header} title="No surprises" subtitle="In a joint wallet, you both see everything." gap={14} footer={footer('Continue')}>
        <PtPanel>
          <PtSwitchRow title="Every payment notifies both of you" subtitle="Push and SMS, within seconds" right={alwaysOn} />
          <PtDivider />
          <PtSwitchRow title="Every rule change" subtitle="Including who changed it" right={alwaysOn} />
        </PtPanel>
        <PtPanel>
          <PtSwitchRow title="Weekly summary" subtitle="Sunday evening, for both of you" value={form.weekly} onChange={(v) => set({ weekly: v })} />
          <PtDivider />
          <PtSwitchRow title="Monthly statement" subtitle="By email on the 1st" value={form.statement} onChange={(v) => set({ statement: v })} />
          <PtDivider />
          <PtSwitchRow title="Big payment alert" subtitle={`Anything over ${formatNaira(form.perDay)}`} value={form.bigPayment} onChange={(v) => set({ bigPayment: v })} />
        </PtPanel>
        <PtNote icon="lock">Notifications for a joint wallet can't be turned off. That's what keeps it fair for both of you.</PtNote>
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ JNT-05
  if (step === 'leave') {
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="If one of you leaves"
        subtitle="Agree now, while things are good. You can change it together later."
        gap={12}
        footer={footer('Review')}
      >
        {JOINT_SPLITS.map((s) => (
          <PtChoiceCard key={s.value} title={s.title} subtitle={s.subtitle} selected={form.split === s.value} onPress={() => set({ split: s.value })} />
        ))}
        <PtPanel>
          <PtReviewRow
            label="Notice to leave"
            value={form.noticeDays ? `${form.noticeDays} days` : 'No notice'}
            sub={form.noticeDays ? 'Payments continue during notice' : null}
            onEdit={() => setSheet('notice')}
          />
          <PtReviewRow label="Closing the wallet" value="Both must confirm with PIN" last />
        </PtPanel>
        <PtNote>If you can't agree, Patriai support helps you resolve it. Money is never released by one person alone.</PtNote>
        <PtOptionSheet
          visible={sheet === 'notice'}
          title="Notice to leave"
          options={NOTICE_DAYS.map((d) => ({ value: d, label: d ? `${d} days` : 'No notice', hint: d ? 'Payments continue during notice' : 'The split happens straight away' }))}
          value={form.noticeDays}
          onPick={(d) => {
            set({ noticeDays: d });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  return (
    <PtStepScreen
      onBack={back}
      flow={header}
      title="Review the joint wallet"
      subtitle="Check everything. You can edit before you create."
      gap={16}
      footer={footer(`Send to ${partnerName}`, submit, create.isPending)}
    >
      <PtPanel>
        <PtReviewRow label="Partners" value={`${myName} and ${partnerName}`} sub={name.trim() === `${myName} and ${partnerName}` ? null : name.trim()} onEdit={() => flow.goTo('partner')} />
        <PtReviewRow label="Contributions" value={contributionLine(mine, theirs, form.day)} sub={`${formatNaira(monthly)} a month`} onEdit={() => flow.goTo('money')} />
        <PtReviewRow
          label="Spend alone"
          value={`Up to ${formatNaira(form.perPayment)} a payment`}
          sub={`${formatNaira(form.perDay)} a day each; above that, both approve`}
          onEdit={() => flow.goTo('spend')}
        />
        <PtReviewRow label="Notifications" value="Both of you, every payment" onEdit={() => flow.goTo('notify')} />
        <PtReviewRow
          label="If one leaves"
          value={splitShort(form.split)}
          sub={form.noticeDays ? `${form.noticeDays} days' notice` : 'No notice'}
          onEdit={() => flow.goTo('leave')}
          last
        />
      </PtPanel>
      <PtNote>The wallet opens once {partnerName} accepts and confirms with their PIN.</PtNote>
    </PtStepScreen>
  );
}
