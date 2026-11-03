import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtSwitch } from '../../components/pt/PtTabScreen';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtDivider, PtNote, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { useFamily, useWallets } from '../../api/hooks';
import { useBuildRule, useRuleDetail, useRulePreview, type RuleDraft, type RulePreview } from '../../api/rules';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type When = 'balance' | 'salary' | 'schedule' | 'event';
type Then = 'move' | 'send' | 'notify';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const num = (v: string) => (v ? Number(v) : 0);
/** 1st, 2nd, 3rd, 20th. */
export const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** A big radio card with an icon, as AUT-03 and AUT-05 draw them; the chosen one opens up. */
function Choice({ icon, title, sub, on, onPress, children }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; sub: string; on: boolean; onPress: () => void; children?: React.ReactNode }) {
  // The inputs sit beside the tappable header, not inside it (no button inside a button).
  return (
    <View style={{ borderRadius: ptRadius.md, borderWidth: 2, borderColor: on ? pt.brand : 'transparent', backgroundColor: on ? pt.brandSoft : pt.raised, padding: 16, gap: 12 }}>
      <Pressable
        onPress={() => {
          selection();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${title}. ${sub}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? pt.brand : pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={20} color={on ? '#fff' : pt.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: on ? pt.brand : pt.ink }}>{title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{sub}</Text>
        </View>
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? pt.brand : pt.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
          {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: pt.brand }} /> : null}
        </View>
      </Pressable>
      {on && children ? <View style={{ gap: 10, paddingLeft: 58 }}>{children}</View> : null}
    </View>
  );
}

/** "Household ▾" — a wallet name you can tap to change. */
function WalletPick({ wallet, placeholder, onPress }: { wallet: Wallet | undefined; placeholder: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Wallet: ${wallet?.name ?? placeholder}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{wallet?.name ?? placeholder}</Text>
      <Feather name="chevron-down" size={16} color={pt.inkMuted} />
    </Pressable>
  );
}

/** WHEN / IF / THEN card (AUT-06, AUT-07, AUT-08). */
export function RuleWordCard({ tag, text }: { tag: 'WHEN' | 'IF' | 'THEN'; text: string }) {
  const tone = tag === 'WHEN' ? { bg: pt.brandSoft, fg: pt.brand } : tag === 'IF' ? { bg: pt.infoSoft, fg: pt.info } : { bg: '#FDEBC8', fg: '#8F5400' };
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
      <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 1 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 12, letterSpacing: 1, color: tone.fg }}>{tag}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, lineHeight: 23, color: pt.ink }}>{text}</Text>
    </View>
  );
}

/**
 * AUT-03 "When should it run?", AUT-04 "Only if…", AUT-05 "Then do this",
 * AUT-06 "Rule name · WHEN · IF · THEN · Turn on (and ask Emeka)". Also edits
 * a rule (AUT-09) and starts from a template (AUT-02) or a sentence (AUT-07).
 */
export function RuleBuilderScreen({ navigation, route }: RootScreenProps<'RuleBuilder'>) {
  const preset = route.params?.preset;
  const ruleId = route.params?.ruleId;
  const existing = useRuleDetail(ruleId ?? 0);
  const wallets = useWallets();
  const family = useFamily();
  const preview = useRulePreview();
  const build = useBuildRule(ruleId);
  const [step, setStep] = useState(route.params?.step ?? 1);
  const [when, setWhen] = useState<When>('balance');
  const [watch, setWatch] = useState<number | null>(null);
  const [threshold, setThreshold] = useState('30000');
  const [event, setEvent] = useState<'goal_reached' | 'request_made'>('goal_reached');
  const [percent, setPercent] = useState('10');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'daily'>('weekly');
  const [dow, setDow] = useState(1);
  const [dom, setDom] = useState(25);
  const [useMin, setUseMin] = useState(true);
  const [minBal, setMinBal] = useState('100000');
  const [useBefore, setUseBefore] = useState(true);
  const [beforeDay, setBeforeDay] = useState(20);
  const [oncePer, setOncePer] = useState(true);
  const [then, setThen] = useState<Then>('move');
  const [amount, setAmount] = useState('50000');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [tell, setTell] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [picking, setPicking] = useState<null | 'watch' | 'from' | 'to' | 'dow' | 'dom' | 'before'>(null);
  const [review, setReview] = useState<RulePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  const all = useMemo(() => (wallets.data ?? []).filter((w) => w.status === 'active' && w.type !== 'ajo'), [wallets.data]);
  const mine = useMemo(() => all.filter((w) => w.my_role === 'owner'), [all]);
  const main = mine.find((w) => w.type === 'main');
  const byId = (id: number | null) => all.find((w) => w.id === id);

  // Start from a template, a sentence, or the rule being edited.
  useEffect(() => {
    if (seeded || !wallets.data) return;
    const d: RuleDraft | undefined = ruleId ? undefined : preset;
    const r = existing.data?.automation;
    if (ruleId && !r) return;
    const src: Partial<RuleDraft> = d ?? (r
      ? {
          trigger: (r.trigger === 'deposit' || r.trigger === 'roundup' ? 'schedule' : r.trigger) as RuleDraft['trigger'],
          event: r.event ?? undefined,
          watch_wallet_id: r.watch_wallet_id ?? r.to_wallet.id,
          threshold: r.threshold ? Number(r.threshold) : undefined,
          frequency: r.frequency as RuleDraft['frequency'],
          day_of_week: r.day_of_week ?? undefined,
          day_of_month: r.day_of_month ?? undefined,
          percent: r.percent ?? undefined,
          from_wallet_id: r.from_wallet.id,
          to_wallet_id: r.to_wallet.id,
          amount: Number(r.amount),
          action: r.action,
          min_balance: r.min_balance ? Number(r.min_balance) : null,
          before_day: r.before_day ?? null,
          max_per: r.frequency === 'daily' ? 'day' : r.frequency === 'monthly' ? 'month' : 'week',
          notify_user_ids: r.notify_user_ids ?? [],
          name: r.name,
        }
      : {});
    const spending = mine.find((w) => w.type === 'spending');
    if (src.trigger) setWhen(src.trigger === 'roundup' ? 'schedule' : (src.trigger as When));
    setWatch(src.watch_wallet_id ?? spending?.id ?? mine.find((w) => w.type !== 'main')?.id ?? null);
    if (src.threshold) setThreshold(String(src.threshold));
    if (src.event) setEvent(src.event);
    if (src.percent) setPercent(String(src.percent));
    if (src.frequency) setFrequency(src.frequency);
    if (src.day_of_week) setDow(src.day_of_week);
    if (src.day_of_month) setDom(src.day_of_month);
    if (src.min_balance !== undefined) { setUseMin(Boolean(src.min_balance)); if (src.min_balance) setMinBal(String(src.min_balance)); }
    if (src.before_day !== undefined) { setUseBefore(Boolean(src.before_day)); if (src.before_day) setBeforeDay(src.before_day); }
    if (src.max_per) setOncePer(true);
    if (src.action === 'notify') setThen('notify');
    if (src.amount) setAmount(String(src.amount));
    setFrom(src.from_wallet_id ?? main?.id ?? null);
    setTo(src.to_wallet_id ?? spending?.id ?? null);
    if (src.notify_user_ids) setTell(src.notify_user_ids);
    if (src.name) setName(src.name);
    if (d && (src.trigger === 'salary' || src.trigger === 'schedule')) { setUseMin(false); setUseBefore(false); }
    // From a sentence (AUT-07): only the conditions that were said.
    if (d && route.params?.step) { setUseMin(Boolean(src.min_balance)); setUseBefore(Boolean(src.before_day)); }
    setSeeded(true);
  }, [seeded, wallets.data, existing.data, preset, ruleId, mine, main, route.params?.step]);

  // People who share the wallets this rule touches ("Also tell Emeka").
  const sharers = useMemo(() => {
    const ids = [watch, from, to].filter((x): x is number => Boolean(x));
    return (family.data?.members ?? []).filter((m) => !m.is_child && m.memberships.some((ms) => ids.includes(ms.wallet_id)));
  }, [family.data, watch, from, to]);

  const draft = (): RuleDraft => {
    const conditional = when === 'balance' || when === 'event';
    return {
      name: name.trim() || undefined,
      trigger: when,
      event: when === 'event' ? event : undefined,
      watch_wallet_id: conditional ? watch : undefined,
      threshold: when === 'balance' ? num(threshold) : undefined,
      frequency: when === 'schedule' ? frequency : undefined,
      day_of_week: when === 'schedule' && frequency === 'weekly' ? dow : undefined,
      day_of_month: when === 'schedule' && frequency === 'monthly' ? dom : undefined,
      percent: when === 'salary' ? num(percent) : undefined,
      from_wallet_id: then === 'notify' ? undefined : when === 'salary' ? main?.id : from,
      to_wallet_id: then === 'notify' ? undefined : to,
      amount: then === 'move' && when !== 'salary' ? num(amount) : undefined,
      action: then === 'notify' ? 'notify' : 'move',
      min_balance: conditional && useMin ? num(minBal) : null,
      before_day: conditional && useBefore ? beforeDay : null,
      max_per: conditional ? (oncePer ? 'week' : 'day') : undefined,
      notify_user_ids: tell,
    };
  };

  const next = () => {
    setError(null);
    if (step === 1) {
      if ((when === 'balance' || when === 'event') && !watch) return setError('Pick a wallet to watch.');
      if (when === 'balance' && num(threshold) <= 0) return setError('How low should it get?');
      return setStep(when === 'balance' || when === 'event' ? 2 : 3);
    }
    if (step === 2) return setStep(3);
    if (step === 3) {
      if (then === 'send') {
        // "Send money — to a person or bank account" is a scheduled payment.
        navigation.navigate('SendSchedule');
        return;
      }
      preview.mutate(draft(), {
        onSuccess: (p) => {
          setReview(p);
          if (!name.trim()) setName(p.name);
          setStep(4);
        },
        onError: (e) => setError(e.message),
      });
      return;
    }
    build.mutate(draft(), {
      onSuccess: (r) => {
        notifySuccess();
        const waiting = r.automation.waiting_for ?? [];
        showAlert(waiting.length ? `Waiting for ${waiting.join(' and ')}` : 'Rule is on', waiting.length ? `It runs once ${waiting.join(' and ')} agree${waiting.length === 1 ? 's' : ''}.` : 'It runs on its own and logs everything it does.');
        navigation.navigate('RuleDetail', { ruleId: r.automation.id });
      },
      onError: (e) => setError(e.message),
    });
  };

  const back = () => (step === 1 ? navigation.goBack() : setStep(step === 3 && when !== 'balance' && when !== 'event' ? 1 : step - 1));
  const waitingNames = review?.needs_agreement;
  const title = ruleId ? 'Edit rule' : 'New rule';

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title, step, total: 4 }}
      title={step === 1 ? 'When should it run?' : step === 2 ? 'Only if…' : step === 3 ? 'Then do this' : undefined}
      subtitle={step === 2 ? 'Optional. All must be true.' : undefined}
      gap={20}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton
            title={step < 4 ? 'Continue' : waitingNames ? `Turn on and ask ${waitingNames}` : ruleId ? 'Save rule' : 'Turn on'}
            loading={preview.isPending || build.isPending}
            onPress={next}
          />
        </>
      }
    >
      {step === 1 ? (
        <View style={{ gap: 12 }}>
          <Choice icon="credit-card" title="A wallet balance changes" sub={`Like ${byId(watch)?.name ?? 'Household'} falling below an amount`} on={when === 'balance'} onPress={() => setWhen('balance')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <WalletPick wallet={byId(watch)} placeholder="Pick a wallet" onPress={() => setPicking('watch')} />
              <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>falls below</Text>
              <PtAmountBox value={threshold} onChange={setThreshold} label="Falls below" />
            </View>
          </Choice>
          <Choice icon="arrow-down" title="Money comes in" sub="Salary, a transfer, a gift" on={when === 'salary'} onPress={() => setWhen('salary')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>Salary lands in {main?.name ?? 'Main'}</Text>
            </View>
          </Choice>
          <Choice icon="clock" title="On a date or schedule" sub="Every Monday, the 25th" on={when === 'schedule'} onPress={() => setWhen('schedule')}>
            <PtPills compact options={[{ value: 'weekly' as const, label: 'Every week' }, { value: 'monthly' as const, label: 'Every month' }, { value: 'daily' as const, label: 'Every day' }]} value={frequency} onChange={setFrequency} />
            {frequency === 'weekly' ? <WalletPick wallet={{ name: `On ${DAYS[dow - 1]}` } as Wallet} placeholder="" onPress={() => setPicking('dow')} /> : null}
            {frequency === 'monthly' ? <WalletPick wallet={{ name: `On the ${ord(dom)}` } as Wallet} placeholder="" onPress={() => setPicking('dom')} /> : null}
          </Choice>
          <Choice icon="zap" title="Something happens" sub="A goal is reached, a request is made" on={when === 'event'} onPress={() => setWhen('event')}>
            <PtPills compact options={[{ value: 'goal_reached' as const, label: 'A goal is reached' }, { value: 'request_made' as const, label: 'A request is made' }]} value={event} onChange={setEvent} />
            <WalletPick wallet={byId(watch)} placeholder="Pick a wallet" onPress={() => setPicking('watch')} />
          </Choice>
        </View>
      ) : null}

      {step === 2 ? (
        <PtPanel>
          {[
            { on: useMin, set: setUseMin, title: `${byId(from)?.name ?? 'Main'} has more than ₦${Number(minBal || 0).toLocaleString('en-NG')}`, sub: `So ${byId(from)?.name ?? 'Main'} never runs dry`, edit: <PtAmountBox value={minBal} onChange={setMinBal} label="Source has more than" width={110} /> },
            { on: useBefore, set: setUseBefore, title: `It's before the ${ord(beforeDay)} of the month`, sub: 'Late-month top-ups wait for salary', edit: null },
            { on: oncePer, set: setOncePer, title: "It hasn't run this week", sub: 'At most once a week', edit: null },
          ].map((c, i) => (
            <View key={i}>
              {i > 0 ? <PtDivider /> : null}
              <Pressable onPress={() => { selection(); c.set(!c.on); }} accessibilityRole="button" accessibilityState={{ selected: c.on }} accessibilityLabel={c.title}>
                <PtSwitchRow title={c.title} subtitle={c.sub} right={<PtCheckbox checked={c.on} />} />
              </Pressable>
              {c.on && c.edit ? <View style={{ paddingBottom: 10 }}>{c.edit}</View> : null}
              {c.on && i === 1 ? (
                <Pressable onPress={() => setPicking('before')} accessibilityRole="button" style={{ paddingBottom: 10 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Change the day</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </PtPanel>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 12 }}>
          <Choice icon="repeat" title="Move money" sub="Between your wallets" on={then === 'move'} onPress={() => setThen('move')}>
            {when === 'salary' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }}>Move</Text>
                <View style={{ width: 70 }}><PtField label="Percent" value={percent} onChangeText={(t) => setPercent(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" /></View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }}>% to</Text>
                <WalletPick wallet={byId(to)} placeholder="a wallet" onPress={() => setPicking('to')} />
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }}>Move</Text>
                  <PtAmountBox value={amount} onChange={setAmount} label="Amount to move" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }}>from</Text>
                  <WalletPick wallet={byId(from)} placeholder="Main" onPress={() => setPicking('from')} />
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }}>to</Text>
                  <WalletPick wallet={byId(to)} placeholder="a wallet" onPress={() => setPicking('to')} />
                </View>
              </View>
            )}
          </Choice>
          <Choice icon="send" title="Send money" sub="To a person or bank account" on={then === 'send'} onPress={() => setThen('send')} />
          <Choice icon="bell" title="Only notify" sub="No money moves" on={then === 'notify'} onPress={() => setThen('notify')} />
          {sharers.map((m) => (
            <View key={m.id} style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              <PtSwitchRow
                title={`Also tell ${m.name.split(' ')[0]}`}
                subtitle={`${m.name.split(' ')[0]} shares ${m.memberships.find((ms) => [watch, from, to].includes(ms.wallet_id))?.wallet_name ?? 'a wallet'}`}
                right={<PtSwitch label={`Also tell ${m.name}`} value={tell.includes(m.id)} onChange={(v) => setTell((t) => (v ? [...t, m.id] : t.filter((x) => x !== m.id)))} />}
              />
            </View>
          ))}
        </View>
      ) : null}

      {step === 4 && review ? (
        <View style={{ gap: 14 }}>
          <PtField label="Rule name" value={name} onChangeText={setName} maxLength={80} />
          <RuleWordCard tag="WHEN" text={review.words.when} />
          {review.words.if ? <RuleWordCard tag="IF" text={review.words.if} /> : null}
          <RuleWordCard tag="THEN" text={review.words.then} />
          {review.last_month || review.agreement_line ? (
            <PtNote tone="success">{[review.last_month, review.agreement_line].filter(Boolean).join(' ')}</PtNote>
          ) : null}
        </View>
      ) : null}

      <PtOptionSheet
        visible={picking === 'watch' || picking === 'from' || picking === 'to'}
        title={picking === 'watch' ? 'Which wallet?' : picking === 'from' ? 'Move from' : 'Move to'}
        options={(picking === 'watch' ? all : mine).filter((w) => (picking === 'to' ? w.type !== 'main' : true)).map((w) => ({ value: w.id, label: w.name }))}
        value={picking === 'watch' ? watch : picking === 'from' ? from : to}
        onPick={(id) => {
          if (picking === 'watch') {
            setWatch(id);
            if (when === 'balance' && byId(id)?.my_role === 'owner') setTo(id);
          } else if (picking === 'from') setFrom(id);
          else setTo(id);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <PtOptionSheet
        visible={picking === 'dow'}
        title="Which day?"
        options={DAYS.map((d, i) => ({ value: i + 1, label: d }))}
        value={dow}
        onPick={(v) => { setDow(v); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
      <PtOptionSheet
        visible={picking === 'dom' || picking === 'before'}
        title={picking === 'before' ? 'Only before the…' : 'Which day of the month?'}
        options={Array.from({ length: picking === 'before' ? 27 : 28 }, (_, i) => (picking === 'before' ? i + 2 : i + 1)).map((d) => ({ value: d, label: `The ${ord(d)}` }))}
        value={picking === 'before' ? beforeDay : dom}
        onPick={(v) => { if (picking === 'before') setBeforeDay(v); else setDom(v); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
    </PtStepScreen>
  );
}
