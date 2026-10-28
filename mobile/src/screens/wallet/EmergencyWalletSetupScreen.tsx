import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAvatar, AVATAR_CYCLE, type PtAvatarTone } from '../../components/pt/PtAvatar';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtAddRow, PtNewPersonForm } from '../../components/pt/PtPeople';
import { PtDivider, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import {
  FastReleaseSection,
  KeyholdersSection,
  PurposesChecklist,
  TrustedSection,
  UnlockYourselfSection,
} from '../../components/emergency/EmergencySections';
import { useCreateWallet, useFamily, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatMoney, formatNaira, groupAmountInput, initials, sanitizeAmountInput } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { joinNames } from '../../lib/goalPlan';
import {
  EMPTY_RULES,
  purposesLabel,
  requiredYeses,
  rulesPayload,
  trustedPowers,
  validateManual,
  validateRules,
  type EmergencyPins,
  type EmergencyRulesState,
} from '../../lib/emergencyRules';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { useSetupFlow } from '../../lib/useSetupFlow';
import { notifySuccess, selection } from '../../lib/haptics';
import type { EmergencyPurpose, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'purpose' | 'funding' | 'release' | 'fast' | 'trusted' | 'review';
const STEPS: Step[] = ['purpose', 'funding', 'release', 'fast', 'trusted', 'review'];
const SAVE_DAY = 25;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Someone putting money in: a family member (account) or a phone number. */
interface Contributor {
  key: string;
  userId?: number;
  phone?: string;
  name: string;
  amount: string;
}

interface EmergencyForm extends EmergencyRulesState {
  purposes: EmergencyPurpose[];
  target: string;
  myAmount: string;
  sourceId: number | null;
  startOn: boolean;
  start: string;
  contributors: Contributor[];
  /** Phones of contributors invited by phone who hold a key once they join. */
  phoneKeyholders: string[];
}

const EMPTY: EmergencyForm = {
  ...EMPTY_RULES,
  purposes: ['medical'],
  target: '',
  myAmount: '',
  sourceId: null,
  startOn: false,
  start: '',
  contributors: [],
  phoneKeyholders: [],
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Family go by first name; someone invited by phone by what you typed ("Uncle Obi"). */
const shortName = (c: Contributor) => (c.phone ? c.name.trim() || formatE164(c.phone) : firstName(c.name));

/** "25 Nov" — the next saving day. */
function nextSaveDay(): string {
  const d = new Date();
  if (d.getDate() >= SAVE_DAY) d.setMonth(d.getMonth() + 1);
  return `${SAVE_DAY} ${MONTHS[d.getMonth()]}`;
}

/**
 * Emergency fund from the client prototype: EMG-01 what it's for → EMG-02 who
 * puts money in → EMG-03 keyholders → EMG-04 fast release (and opening it
 * yourself with the custom PIN) → EMG-05 if you can't ask yourself (ordered
 * beneficiaries, death emergency unlock) → WCR-06 review → WCR-07. Auto-saved
 * as a draft; the custom PIN never is.
 */
export function EmergencyWalletSetupScreen(props: RootScreenProps<'EmergencyWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <EmergencySetup {...props} draft={draft} />;
}

function EmergencySetup({ navigation, draft }: RootScreenProps<'EmergencyWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();
  const create = useCreateWallet();

  const [name, setName] = useState(draft?.name ?? '');
  const [form, setForm] = useState<EmergencyForm>(() => ({ ...EMPTY, ...((draft?.data ?? {}) as Partial<EmergencyForm>) }));
  const [pins, setPins] = useState<EmergencyPins>({ pin: '', pinConfirm: '' });
  const set = (patch: Partial<EmergencyForm>) => setForm((f) => ({ ...f, ...patch }));
  const flow = useSetupFlow(navigation, STEPS, (draft?.step ?? 1) - 1);
  const step = flow.step;

  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'emergency',
    name,
    step: flow.index + 1,
    totalSteps: STEPS.length,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(name.trim() || form.target || flow.index > 0),
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
  const sources = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && w.status === 'active' && w.type !== 'emergency');
  const source = sources.find((w) => w.id === form.sourceId) ?? sources.find((w) => w.type === 'main') ?? sources[0];
  const myName = firstName(me?.full_name ?? 'You');
  const target = Number(form.target) || 0;
  const monthly = (Number(form.myAmount) || 0) + form.contributors.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const startWith = form.startOn ? Number(form.start) || 0 : 0;
  const months = target > 0 && monthly > 0 ? Math.max(1, Math.ceil(Math.max(0, target - startWith) / monthly)) : null;
  const savers = ['you', ...form.contributors.map(shortName)];
  // Phone contributors stay keyholders only while they're still contributors.
  const phoneKeyholders = form.phoneKeyholders.filter((p) => form.contributors.some((c) => c.phone === p));
  const keyholderCount = form.keyholders.length + phoneKeyholders.length + 1;
  const required = requiredYeses(form, phoneKeyholders.length);
  const keyholderNames = [
    myName,
    ...form.keyholders.map((id) => firstName(members.find((m) => m.id === id)?.name ?? 'Keyholder')),
    ...form.contributors.filter((c) => c.phone && phoneKeyholders.includes(c.phone)).map(shortName),
  ];

  const stewardCard = (text: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 12, backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 16 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(95,211,165,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="shield" size={16} color={pt.emerald300} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 11, letterSpacing: 0.88, color: pt.emerald300 }}>STEWARD SUGGESTS</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: '#FFFFFF' }}>{text}</Text>
      </View>
    </View>
  );
  const bold = (t: string) => <Text style={{ fontFamily: ptFont.bold }}>{t}</Text>;
  const reachable = (m: number) => `is reachable in about ${m} month${m === 1 ? '' : 's'}.`;

  const steward =
    months !== null
      ? stewardCard(
          <>
            With {joinNames(savers)} saving, {bold(formatNaira(target))} {reachable(months)}
          </>,
        )
      : null;

  // EMG-01, before anyone has an amount: split the target across the family over about ten months.
  const planners = form.contributors.length ? savers : ['you', ...members.slice(0, 3).map((m) => firstName(m.name))];
  const each = target > 0 ? Math.ceil(target / planners.length / 10 / 5_000) * 5_000 : 0;
  const firstSteward =
    steward ??
    stewardCard(
      each > 0 ? (
        <>
          With {joinNames(planners)} saving about {bold(formatNaira(each))} a month{planners.length > 1 ? ' each' : ''}, {bold(formatNaira(target))}{' '}
          {reachable(Math.max(1, Math.ceil(target / (each * planners.length))))}
        </>
      ) : (
        `Set a target and see how soon ${joinNames(planners)} can reach it, saving a little every month.`
      ),
    );

  const validate = (s: Step): string | null => {
    if (s === 'purpose') {
      if (!name.trim()) return 'Give the fund a name.';
      if (form.purposes.length === 0) return 'Pick at least one emergency it is for.';
    }
    if (s === 'funding') {
      if ((Number(form.myAmount) > 0 || form.startOn) && !source) return 'You need a wallet to save from.';
      if (form.contributors.some((c) => !(Number(c.amount) > 0))) return 'Enter how much each person puts in.';
      if (form.startOn && !(Number(form.start) > 0)) return 'Enter how much to add now, or turn it off.';
      if (form.startOn && source && Number(form.start) > parseFloat(source.balance)) return `${source.name} only has ${formatMoney(source.balance)}.`;
    }
    if (s === 'fast') return validateManual(form, pins, { pinRequired: true });
    // Every way the fund opens is known once the last rules step is done.
    if (s === 'trusted') return validateRules(form, pins, { pinRequired: true, invited: phoneKeyholders.length });
    return null;
  };

  const next = () => {
    const problem = validate(step);
    setError(problem);
    if (problem) return;
    flow.next();
  };

  const submit = () => {
    for (const s of ['purpose', 'funding', 'fast', 'trusted'] as Step[]) {
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
        type: 'emergency',
        name: name.trim(),
        purpose: form.purposes[0],
        target_amount: form.target || undefined,
        source_wallet_id: (Number(form.myAmount) > 0 || form.startOn) && source ? source.id : undefined,
        initial_deposit: form.startOn ? form.start : undefined,
        monthly_amount: Number(form.myAmount) > 0 ? form.myAmount : undefined,
        monthly_day: SAVE_DAY,
        members: form.contributors.map((c) =>
          c.userId
            ? { user_id: c.userId, role: 'contributor' as const, pledge: c.amount }
            : { identifier: c.phone, role: 'contributor' as const, pledge: c.amount, keyholder: phoneKeyholders.includes(c.phone ?? '') },
        ),
        emergency: rulesPayload(form, pins, form.purposes, phoneKeyholders.length),
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          const invited = form.contributors.map(shortName);
          const extraKeyholders = form.keyholders.filter((id) => !form.contributors.some((c) => c.userId === id));
          flow.leave(() => {
            navigation.popToTop();
            navigation.navigate('SetupDone', {
              walletId: res.wallet.id,
              title: `${name.trim()} is ready`,
              subtitle:
                (invited.length ? `We've invited ${joinNames(invited)}. ` : '') +
                (monthly > 0 ? `Saving starts on ${nextSaveDay()}.` : 'Anyone can add money to it any time.'),
              caption: [target > 0 ? `of ${formatNaira(target)}` : null, keyholderCount > 1 ? `${required} of ${keyholderCount} to release` : null]
                .filter(Boolean)
                .join(' · '),
              events: [
                ...form.contributors.map((c) => {
                  const key = c.userId !== undefined ? form.keyholders.includes(c.userId) : phoneKeyholders.includes(c.phone ?? '');
                  return {
                    label: shortName(c),
                    title: c.phone ? 'SMS invite sent' : 'Invite sent',
                    sub: [key ? 'Keyholder' : 'Contributor', `${formatNaira(c.amount)} a month`, c.phone ? 'joins with their phone number' : null].filter(Boolean).join(' · '),
                  };
                }),
                ...extraKeyholders.map((id) => ({
                  label: firstName(members.find((m) => m.id === id)?.name ?? 'Keyholder'),
                  title: 'Made a keyholder',
                  sub: 'They can see the fund now',
                })),
                ...form.trustedContacts.map((c) => ({
                  label: c.name,
                  title: 'SMS link sent',
                  sub: ['Trusted contact', c.relation.trim() || null].filter(Boolean).join(' · '),
                })),
              ],
              openLabel: 'Open fund',
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

  const header = { title: 'Emergency wallet', step: flow.index + 1, total: STEPS.length };
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

  // ------------------------------------------------------------ EMG-01
  if (step === 'purpose') {
    return (
      <PtStepScreen onBack={back} flow={header} title="What is this fund for?" subtitle="Name the emergencies so everyone agrees when to use it." gap={18} footer={footer('Continue')}>
        <PtField
          label="Wallet name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="Mama and Papa's health fund"
          maxLength={100}
        />
        <PurposesChecklist value={form.purposes} onChange={(p) => set({ purposes: p })} />
        {firstSteward}
        <PtField
          label="Target"
          prefix="₦"
          value={groupAmountInput(form.target)}
          onChangeText={(t) => set({ target: sanitizeAmountInput(t) })}
          placeholder="1,200,000"
          keyboardType="decimal-pad"
          hint="Optional. Everyone sees how close the fund is."
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ EMG-02
  if (step === 'funding') {
    const notAdded = members.filter((m) => !form.contributors.some((c) => c.userId === m.id));
    return (
      <PtStepScreen onBack={back} flow={header} title="Who puts money in?" subtitle={`Each person saves automatically on the ${SAVE_DAY}th.`} gap={16} footer={footer('Continue')}>
        <PtPanel>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{myName} (you)</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>From {source?.name ?? 'Main'} · monthly</Text>
            </View>
            <PtAmountBox value={form.myAmount} onChange={(v) => set({ myAmount: v })} label="Your monthly amount" />
          </View>
          {form.contributors.map((c, i) => (
            <React.Fragment key={c.key}>
              <PtDivider />
              <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <PtAvatar initials={c.phone && !c.name ? '+' : initials(c.name)} tone={(c.phone ? 'gold' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]) as PtAvatarTone} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                    {c.name || formatE164(c.phone ?? '')}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {c.phone ? 'Invite by phone · not on Patriai yet' : 'From their Main · monthly'}
                  </Text>
                </View>
                <PtAmountBox
                  value={c.amount}
                  onChange={(v) => set({ contributors: form.contributors.map((x) => (x.key === c.key ? { ...x, amount: v } : x)) })}
                  label={`Monthly amount for ${c.name || c.phone}`}
                />
                <Pressable
                  onPress={() => {
                    selection();
                    set({
                      contributors: form.contributors.filter((x) => x.key !== c.key),
                      phoneKeyholders: form.phoneKeyholders.filter((p) => p !== c.phone),
                    });
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${c.name || c.phone}`}
                >
                  <Feather name="x" size={18} color={pt.inkSubtle} />
                </Pressable>
              </View>
            </React.Fragment>
          ))}
          {adding ? (
            <>
              <PtDivider />
              <PtNewPersonForm
                withAmount
                taken={[...form.contributors.map((c) => c.phone ?? ''), me?.phone ?? '']}
                onCancel={() => setAdding(false)}
                onAdd={(p) => {
                  set({ contributors: [...form.contributors, { key: p.phone, phone: p.phone, name: p.name, amount: p.amount ?? '' }] });
                  setAdding(false);
                }}
              />
            </>
          ) : null}
        </PtPanel>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 15, color: pt.inkMuted }}>Every month</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{formatNaira(monthly)}</Text>
        </View>

        {!adding ? <PtAddRow label="Add a contributor" onPress={() => setPicker(true)} /> : null}
        <PtNote>Contributors can see the balance and every release. They can't take money out on their own.</PtNote>
        {steward}

        <PtPanel>
          <PtSwitchRow
            title={form.startOn && Number(form.start) > 0 ? `Add ${formatNaira(form.start)} now to start` : 'Add money now to start'}
            subtitle={`Moves from ${source?.name ?? 'Main'} when you create the fund`}
            value={form.startOn}
            onChange={(v) => set({ startOn: v })}
          />
          {form.startOn ? (
            <View style={{ paddingBottom: 14 }}>
              <PtField label="How much" prefix="₦" value={groupAmountInput(form.start)} onChangeText={(t) => set({ start: sanitizeAmountInput(t) })} placeholder="200,000" keyboardType="decimal-pad" />
            </View>
          ) : null}
        </PtPanel>

        <PtOptionSheet
          visible={picker}
          title="Add a contributor"
          options={[
            ...notAdded.map((m) => ({ value: m.id, label: m.name, hint: m.email })),
            { value: -1, label: 'Someone new', hint: 'Invite them by phone number' },
          ]}
          value={null}
          onPick={(id) => {
            setPicker(false);
            if (id === -1) {
              setAdding(true);
              return;
            }
            const m = members.find((x) => x.id === id);
            if (m) set({ contributors: [...form.contributors, { key: `u${m.id}`, userId: m.id, name: m.name, amount: '' }] });
          }}
          onClose={() => setPicker(false)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ EMG-03
  if (step === 'release') {
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="Who agrees to release money?"
        subtitle="Pick keyholders. A release needs enough of them to say yes."
        gap={16}
        footer={footer('Continue')}
      >
        <KeyholdersSection
          value={form}
          onChange={set}
          me={{ name: myName, initials: initials(me?.full_name) }}
          candidates={[
            ...members.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, contributes: form.contributors.some((c) => c.userId === m.id) })),
            // EMG-03: someone invited by phone (Uncle Obi) can hold a key too, from when they join.
            ...form.contributors.filter((c) => c.phone).map((c) => ({ phone: c.phone, name: shortName(c), contributes: true })),
          ]}
          invited={phoneKeyholders}
          onInvited={(phones) => set({ phoneKeyholders: phones })}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ EMG-04
  if (step === 'fast') {
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="When every minute counts"
        subtitle="Release a small amount at once, with proof. Others review after."
        gap={16}
        footer={footer('Continue')}
      >
        <FastReleaseSection value={form} onChange={set} />
        <UnlockYourselfSection value={form} onChange={set} pins={pins} onPins={setPins} />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ EMG-05
  if (step === 'trusted') {
    return (
      <PtStepScreen
        onBack={back}
        flow={header}
        title="If you can't ask yourself"
        subtitle="Trusted contacts can start a request for you. Keyholders still decide."
        gap={16}
        footer={footer('Review')}
      >
        <TrustedSection value={form} onChange={set} ownPhone={me?.phone} />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-06
  const n = keyholderCount;
  const beneficiaryNames = form.beneficiaries.map((b, i) => `${firstName(b.user.full_name)}${i > 0 ? ' (fallback)' : ''}`);
  const phoneInvites = form.contributors.filter((c) => c.phone).map((c) => c.name || formatE164(c.phone ?? ''));
  return (
    <PtStepScreen
      onBack={back}
      flow={header}
      title="Review the fund"
      subtitle="Check everything. You can edit before you create."
      gap={16}
      footer={footer('Create fund', submit, create.isPending)}
    >
      <PtPanel>
        <PtReviewRow label="Name" value={name.trim()} sub={purposesLabel(form.purposes)} onEdit={() => flow.goTo('purpose')} />
        <PtReviewRow label="Target" value={target > 0 ? formatNaira(target) : 'No target'} sub={months ? `About ${months} month${months === 1 ? '' : 's'}` : null} onEdit={() => flow.goTo('purpose')} />
        <PtReviewRow
          label="Contributors"
          value={`${form.contributors.length + 1} ${form.contributors.length ? 'people' : 'person'} · ${formatNaira(monthly)} a month`}
          sub={phoneInvites.length ? `${joinNames(phoneInvites)} will be invited by SMS` : startWith > 0 ? `${formatNaira(startWith)} to start` : null}
          onEdit={() => flow.goTo('funding')}
        />
        <PtReviewRow
          label="Release"
          value={n > 1 ? `${required} of ${n} keyholders${n === 2 && required === 2 ? ' · dual approval' : ''}` : 'Only you'}
          sub={[keyholderNames.join(', '), form.payDirectly ? 'paid to the hospital' : null].filter(Boolean).join(' · ')}
          onEdit={() => flow.goTo('release')}
        />
        <PtReviewRow
          label="Fast release"
          value={form.fastOn ? `Up to ${formatNaira(form.fastLimit)} with proof` : 'Off'}
          sub={form.fastOn ? `Once every ${form.fastEvery} days` : null}
          onEdit={() => flow.goTo('fast')}
        />
        <PtReviewRow
          label="Open it yourself"
          value={form.manual ? 'With your custom PIN' : 'Off'}
          sub={[form.manual && form.reason ? form.reason : null, form.highBalance ? 'Override over ₦1M' : null].filter(Boolean).join(' · ') || null}
          onEdit={() => flow.goTo('fast')}
        />
        <PtReviewRow
          label="Trusted contacts"
          value={form.trustedContacts.length ? form.trustedContacts.map((c) => c.name).join(', ') : 'None'}
          sub={form.trustedContacts.length ? trustedPowers(form) : null}
          onEdit={() => flow.goTo('trusted')}
        />
        <PtReviewRow
          label="Who receives the money"
          value={beneficiaryNames.length ? beneficiaryNames.join(', ') : 'No beneficiaries'}
          sub={[form.docUnlock ? 'Death emergency unlock on' : null, form.crisis ? 'National-crisis override' : null].filter(Boolean).join(' · ') || null}
          onEdit={() => flow.goTo('trusted')}
          last
        />
      </PtPanel>
      <PtNote tone="warning">
        {n > 1 && required > 1
          ? `Nobody can change the release rules alone. Changes need ${required} of ${n} keyholders too.`
          : 'Only you can change these rules, with your transaction PIN — and every keyholder is told when you do.'}
      </PtNote>
    </PtStepScreen>
  );
}
