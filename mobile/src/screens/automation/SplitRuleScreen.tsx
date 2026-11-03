import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtSwitch } from '../../components/pt/PtTabScreen';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtChoiceCard, PtGroupLabel, PtPanel, PtPills, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { useFamily, useSaveAccountGroup, useSavedAccounts, useWallets } from '../../api/hooks';
import { api } from '../../api/client';
import { useCreateScheduledPayment, type Frequency } from '../../api/scheduled';
import { useAuth } from '../../store/auth';
import { formatYmd, initials, toYmd } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

type Who = 'one' | 'group' | 'several';
type Split = 'even' | 'percent' | 'fixed';
type OnDay = 'topup_main' | 'pay_what_there' | 'skip' | 'cancel';
const FREQS: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];
const WHICH = ['First', 'Second', 'Third', 'Fourth', 'Last'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-12-06T07:00:00+01:00": the day picked, at the hour picked, in Lagos. */
const lagosIso = (d: Date, hour: number) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00+01:00`;

/** The first date that matches "first Sunday of the month" from today. */
function firstWeekday(which: number, weekday: number, hour: number): Date {
  const pick = (y: number, m: number) => {
    if (which === 5) {
      const d = new Date(y, m + 1, 0, hour);
      while (((d.getDay() + 6) % 7) + 1 !== weekday) d.setDate(d.getDate() - 1);
      return d;
    }
    const d = new Date(y, m, 1, hour);
    while (((d.getDay() + 6) % 7) + 1 !== weekday) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + 7 * (which - 1));
    return d;
  };
  const now = new Date();
  const d = pick(now.getFullYear(), now.getMonth());
  return d > now ? d : pick(now.getFullYear(), now.getMonth() + 1);
}

/**
 * RUL-02 "Who gets paid?" (one account, a group, or several; evenly, by % or
 * fixed), RUL-03 "When should it go?" (a date or "first Sunday"), RUL-04
 * "Automatic, or ask first?", RUL-05 "If there isn't enough money", RUL-06
 * "Check your rule" → Turn on rule with the PIN.
 */
export function SplitRuleScreen({ navigation }: RootScreenProps<'SplitRule'>) {
  const me = useAuth((s) => s.user);
  const saved = useSavedAccounts();
  const wallets = useWallets();
  const family = useFamily();
  const create = useCreateScheduledPayment();
  const makeGroup = useSaveAccountGroup();
  const [step, setStep] = useState(1);
  const [who, setWho] = useState<Who>('group');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [amount, setAmount] = useState('45000');
  const [split, setSplit] = useState<Split>('even');
  const [shares, setShares] = useState<Record<number, string>>({});
  const [freq, setFreq] = useState<Frequency>('monthly');
  const [onWhat, setOnWhat] = useState<'date' | 'weekday'>('weekday');
  const [which, setWhich] = useState(1);
  const [weekday, setWeekday] = useState(7);
  const [date, setDate] = useState(toYmd(new Date(Date.now() + 86400000)));
  const [hour, setHour] = useState(7);
  const [ends, setEnds] = useState<'never' | 'date' | 'count'>('never');
  const [endsOn, setEndsOn] = useState(toYmd(new Date(new Date().getFullYear() + 1, 11, 31)));
  const [endsAfter, setEndsAfter] = useState(12);
  const [fromId, setFromId] = useState<number | null>(null);
  const [mode, setMode] = useState<'auto' | 'ask'>('ask');
  const [confirmers, setConfirmers] = useState<number[]>(me ? [me.id] : []);
  const [confirmMode, setConfirmMode] = useState<'any' | 'all'>('any');
  const [checkDays, setCheckDays] = useState(3);
  const [remindAgain, setRemindAgain] = useState(true);
  const [onDay, setOnDay] = useState<OnDay>('cancel');
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<null | 'account' | 'group' | 'from' | 'which' | 'day' | 'hour' | 'date' | 'ends' | 'endsOn' | 'check'>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accounts = saved.data?.accounts ?? [];
  const groups = saved.data?.groups ?? [];
  const group = groups.find((g) => g.id === groupId) ?? (who === 'group' ? groups[0] : undefined);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const spendable = (wallets.data ?? []).filter((w) => w.status === 'active' && (w.my_role === 'owner' || w.my_role === 'co_owner') && !['ajo', 'emergency'].includes(w.type));
  const from = spendable.find((w) => w.id === fromId) ?? spendable.find((w) => w.type === 'giving') ?? spendable.find((w) => w.type === 'main');
  const total = Number(amount || 0);

  // Who receives, as one list: the one account, the group's accounts, or the ones picked.
  const payees = useMemo(() => {
    if (who === 'one') return account ? [{ id: account.id, name: account.nickname }] : [];
    if (who === 'group') return (group?.accounts ?? []).map((a) => ({ id: a.id, name: a.nickname }));
    return accounts.filter((a) => picked.includes(a.id)).map((a) => ({ id: a.id, name: a.nickname }));
  }, [who, account, group, accounts, picked]);

  const partOf = (id: number) => {
    if (payees.length <= 1 || split === 'even') return total / Math.max(1, payees.length);
    if (split === 'percent') return (total * Number(shares[id] ?? Math.round(100 / payees.length))) / 100;
    return Number(shares[id] ?? 0);
  };
  const pctOf = (id: number) => (total ? Math.round((partOf(id) * 100) / total) : 0);

  // People who share the wallet it pays from can be asked to confirm.
  const sharers = useMemo(() => {
    const others = (family.data?.members ?? []).filter((m) => !m.is_child && from && m.memberships.some((ms) => ms.wallet_id === from.id && ['owner', 'co_owner', 'admin'].includes(ms.role)));
    return [{ id: me?.id ?? 0, name: `${me?.first_name ?? 'You'} (you)`, initials: initials(me?.full_name) }, ...others.map((m) => ({ id: m.id, name: m.name.split(' ')[0], initials: m.avatar }))];
  }, [family.data, from, me]);

  const startsAt = (): Date => {
    if (freq !== 'once' && onWhat === 'weekday' && ['monthly', 'quarterly', 'yearly'].includes(freq)) return firstWeekday(which, weekday, hour);
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d, hour);
  };
  const whenText = () => {
    const t = `${hour % 12 || 12}:00 ${hour < 12 ? 'am' : 'pm'}`;
    if (freq !== 'once' && onWhat === 'weekday' && ['monthly', 'quarterly', 'yearly'].includes(freq)) return `${WHICH[which - 1]} ${DAYS[weekday - 1]} of the ${freq === 'monthly' ? 'month' : freq === 'quarterly' ? 'quarter' : 'year'}, ${t}`;
    return `${FREQS.find((f) => f.value === freq)?.label}, from ${formatYmd(date)}, ${t}`;
  };
  const defaultName = who === 'group' && group ? `${group.name}: ${naira(total)}` : payees.length === 1 ? `${naira(total)} to ${payees[0].name}` : 'Split payment';

  const next = async () => {
    setError(null);
    if (step === 1) {
      if (!payees.length) return setError(who === 'several' ? 'Pick at least two saved accounts.' : 'Save an account to pay first.');
      if (who === 'several' && payees.length < 2) return setError('Pick at least two accounts, or choose one saved account.');
      if (total <= 0) return setError('How much each time?');
      if (split === 'percent' && payees.length > 1 && payees.reduce((a, p) => a + Number(shares[p.id] ?? Math.round(100 / payees.length)), 0) !== 100) return setError('The shares must add up to 100%.');
      if (split === 'fixed' && payees.length > 1 && payees.reduce((a, p) => a + Number(shares[p.id] ?? 0), 0) !== total) return setError(`The amounts must add up to ${naira(total)}.`);
      return setStep(2);
    }
    if (step === 2) return setStep(3);
    if (step === 3) {
      if (mode === 'ask' && !confirmers.length) return setError('Pick who confirms.');
      return setStep(4);
    }
    if (step === 4) {
      if (!name.trim()) setName(defaultName);
      return setStep(5);
    }
    if (!from) return setError('Pick a wallet to pay from.');
    setPinError(null);
    setPinOpen(true);
  };

  const turnOn = async (pin: string) => {
    if (!from) return;
    // Several accounts become a group so the split is kept (BEN-04).
    let destination: { kind: 'group'; group_id: number } | { kind: 'bank'; bank_code: string; account_number: string; account_name: string; bank_name: string } | { kind: 'user'; identifier: string };
    try {
      if (who === 'one' && account) {
        destination = account.kind === 'patriai' && account.payee?.username
          ? { kind: 'user', identifier: `@${account.payee.username}` }
          : { kind: 'bank', bank_code: account.bank_code ?? '', account_number: account.account_number ?? '', account_name: account.account_name, bank_name: account.bank_name ?? '' };
      } else {
        let gid = group?.id ?? 0;
        if (who === 'several') {
          const g = await makeGroup.mutateAsync({ name: name.trim() || defaultName, saved_account_ids: picked });
          gid = g.group.id;
        }
        if (payees.length > 1 && split !== 'even') {
          const sh: Record<number, number> = {};
          payees.forEach((p) => { sh[p.id] = split === 'percent' ? Number(shares[p.id] ?? Math.round(100 / payees.length)) : Number(shares[p.id] ?? 0); });
          await api(`/saved-account-groups/${gid}`, { method: 'PATCH', body: { split, shares: sh } });
        }
        destination = { kind: 'group', group_id: gid };
      }
    } catch (e) {
      setPinOpen(false);
      return setError((e as Error).message);
    }
    create.mutate(
      {
        from_wallet_id: from.id,
        amount: String(total),
        destination,
        name: name.trim() || defaultName,
        frequency: freq,
        // Payments run on Lagos time, whatever the phone's clock says.
        starts_at: lagosIso(startsAt(), hour),
        ...(freq !== 'once' && onWhat === 'weekday' && ['monthly', 'quarterly', 'yearly'].includes(freq) ? { week_of_month: which, weekday } : {}),
        ...(ends === 'date' ? { ends_on: endsOn } : ends === 'count' ? { ends_after: endsAfter } : {}),
        ...(mode === 'ask' ? { confirm: { user_ids: confirmers, mode: confirmMode } } : {}),
        short_policy: { check_days: checkDays, remind_day_before: remindAgain, on_day: onDay },
        pin,
      },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          showAlert('Rule is on', mode === 'ask' ? "We'll ask the evening before each payment." : 'It goes out on the day. You get a receipt.');
          navigation.navigate('ScheduledPayments');
        },
        onError: (e) => (/pin/i.test(e.message) ? setPinError(e.message) : (setPinOpen(false), setError(e.message))),
      },
    );
  };

  const title = name.trim() || (step > 1 ? defaultName : 'Split between accounts');
  const onDayText: Record<OnDay, string> = { topup_main: 'top up from Main', pay_what_there: "pay what's there", skip: 'skip this time', cancel: 'cancel on the day' };

  return (
    <PtStepScreen
      onBack={() => (step === 1 ? navigation.goBack() : setStep(step - 1))}
      flow={{ title, step, total: 5 }}
      title={['Who gets paid?', 'When should it go?', 'Automatic, or ask first?', "If there isn't enough money", 'Check your rule'][step - 1]}
      gap={18}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton title={step < 5 ? 'Continue' : 'Turn on rule'} loading={create.isPending || makeGroup.isPending} onPress={() => void next()} />
        </>
      }
    >
      {step === 1 ? (
        <>
          <View style={{ gap: 10 }}>
            <PtChoiceCard icon="user" title="One saved account" subtitle={who === 'one' && account ? account.nickname : undefined} selected={who === 'one'} onPress={() => { setWho('one'); if (accounts.length > 1) setSheet('account'); }} />
            <PtChoiceCard icon="users" title={group ? `A group: ${group.name}` : 'A group'} subtitle={group ? group.accounts.map((a) => a.nickname).join(', ') : 'No groups saved yet'} selected={who === 'group'} onPress={() => { setWho('group'); if (groups.length > 1) setSheet('group'); }} />
            <PtChoiceCard icon="plus" title="Pick several accounts" subtitle={who === 'several' && picked.length ? `${picked.length} picked` : undefined} selected={who === 'several'} onPress={() => setWho('several')} />
          </View>
          {who === 'several' ? (
            <PtPanel>
              {accounts.map((a, i) => (
                <Pressable key={a.id} onPress={() => { selection(); setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id])); }} accessibilityRole="button" accessibilityState={{ selected: picked.includes(a.id) }}>
                  <PtSwitchRow title={a.nickname} subtitle={a.bank_name ?? 'Patriai'} right={<PtCheckbox checked={picked.includes(a.id)} />} />
                  {i < accounts.length - 1 ? <View style={{ height: 1, backgroundColor: pt.line }} /> : null}
                </Pressable>
              ))}
            </PtPanel>
          ) : null}
          <PtField label="Amount each time" prefix="₦" value={amount ? Number(amount).toLocaleString('en-NG') : ''} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          {payees.length > 1 ? (
            <>
              <PtGroupLabel>Split</PtGroupLabel>
              <PtSegmented options={[{ value: 'even' as Split, label: 'Evenly' }, { value: 'percent' as Split, label: 'By %' }, { value: 'fixed' as Split, label: 'Fixed' }]} value={split} onChange={setSplit} />
              <PtPanel>
                {payees.map((p, i) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <PtReviewRow label={p.name} value={`${naira(partOf(p.id))} · ${pctOf(p.id)}%`} last={i === payees.length - 1} />
                    </View>
                    {split !== 'even' ? (
                      <View style={{ width: 96 }}>
                        <PtField label={split === 'percent' ? '%' : '₦'} value={shares[p.id] ?? (split === 'percent' ? String(Math.round(100 / payees.length)) : '')} onChangeText={(t) => setShares((s) => ({ ...s, [p.id]: t.replace(/\D/g, '') }))} keyboardType="number-pad" />
                      </View>
                    ) : null}
                  </View>
                ))}
              </PtPanel>
            </>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <PtPills options={FREQS} value={freq} onChange={setFreq} />
          {['monthly', 'quarterly', 'yearly'].includes(freq) ? (
            <>
              <PtGroupLabel>On</PtGroupLabel>
              <PtSegmented options={[{ value: 'date' as const, label: 'A date' }, { value: 'weekday' as const, label: 'A weekday' }]} value={onWhat} onChange={setOnWhat} />
            </>
          ) : null}
          {['monthly', 'quarterly', 'yearly'].includes(freq) && onWhat === 'weekday' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><PtField label="Which" value={WHICH[which - 1]} onPressBox={() => setSheet('which')} /></View>
              <View style={{ flex: 1 }}><PtField label="Day" value={DAYS[weekday - 1]} onPressBox={() => setSheet('day')} /></View>
            </View>
          ) : null}
          <PtPanel>
            <PtReviewRow label="Time" value={`${hour % 12 || 12}:00 ${hour < 12 ? 'am' : 'pm'}`} onEdit={() => setSheet('hour')} />
            {!(['monthly', 'quarterly', 'yearly'].includes(freq) && onWhat === 'weekday') ? <PtReviewRow label={freq === 'once' ? 'On' : 'Starts'} value={formatYmd(date)} onEdit={() => setSheet('date')} /> : <PtReviewRow label="Starts" value={startsAt().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} />}
            {freq !== 'once' ? (
              <PtReviewRow label="Ends" value={ends === 'never' ? 'Never' : ends === 'date' ? `On ${formatYmd(endsOn)}` : `After ${endsAfter} payments`} sub="Or on a date, or after a number of payments" onEdit={() => setSheet('ends')} last />
            ) : null}
          </PtPanel>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <PtChoiceCard title="Automatic" subtitle="Goes out on the day. You get a receipt." selected={mode === 'auto'} onPress={() => setMode('auto')} />
          <PtChoiceCard title="Ask before each payment" subtitle="It waits until the people below confirm" selected={mode === 'ask'} onPress={() => setMode('ask')} />
          {mode === 'ask' ? (
            <View style={{ gap: 8, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 14, marginTop: -6 }}>
              {sharers.map((s) => (
                <Pressable key={s.id} onPress={() => setConfirmers((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id]))} accessibilityRole="button" accessibilityState={{ selected: confirmers.includes(s.id) }} accessibilityLabel={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <PtAvatar initials={s.initials} size={32} tone={s.id === me?.id ? 'brand' : 'mint'} />
                  <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{s.name}</Text>
                  <PtCheckbox checked={confirmers.includes(s.id)} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {mode === 'ask' ? (
            <PtPanel>
              <PtReviewRow label="Who must confirm" value={confirmMode === 'any' ? 'Any one of them' : 'All of them'} onEdit={() => setConfirmMode(confirmMode === 'any' ? 'all' : 'any')} />
              <PtReviewRow label="Ask" value="The evening before, at 7:00 pm" />
              <PtReviewRow label="If nobody confirms" value="Wait until noon, then skip this time" last />
            </PtPanel>
          ) : null}
        </>
      ) : null}

      {step === 4 ? (
        <>
          <PtPanel>
            <PtReviewRow label="Check the balance" value={`${checkDays} day${checkDays === 1 ? '' : 's'} before`} onEdit={() => setSheet('check')} />
            <PtReviewRow label="Tell me" value="Push and in-app" />
            <View style={{ paddingVertical: 4 }}>
              <PtSwitchRow title="Remind me again" subtitle="The day before" right={<PtSwitch label="Remind me again the day before" value={remindAgain} onChange={setRemindAgain} />} />
            </View>
          </PtPanel>
          <PtGroupLabel>On the day, if still short</PtGroupLabel>
          <View style={{ gap: 10 }}>
            <PtChoiceCard title="Top up from Main automatically" subtitle="Only the amount missing" selected={onDay === 'topup_main'} onPress={() => setOnDay('topup_main')} />
            <PtChoiceCard title="Pay what's there, split the same way" selected={onDay === 'pay_what_there'} onPress={() => setOnDay('pay_what_there')} />
            <PtChoiceCard title="Skip this time" subtitle="Try again next time" selected={onDay === 'skip'} onPress={() => setOnDay('skip')} />
            <PtChoiceCard title="Cancel this payment" subtitle="And tell me" selected={onDay === 'cancel'} onPress={() => setOnDay('cancel')} />
          </View>
        </>
      ) : null}

      {step === 5 ? (
        <>
          <PtField label="Rule name" value={name} onChangeText={setName} maxLength={80} placeholder={defaultName} />
          <PtPanel>
            <PtReviewRow label="Pays" value={`${who === 'group' && group ? group.name : payees.map((p) => p.name).join(', ')} · ${payees.length > 1 && split === 'even' ? `${naira(total / payees.length)} each` : naira(total)}`} sub={who === 'group' ? payees.map((p) => p.name).join(', ') : null} onEdit={() => setStep(1)} />
            <PtReviewRow label="From" value={from?.name ?? '—'} onEdit={() => setSheet('from')} />
            <PtReviewRow label="When" value={whenText()} sub={freq === 'once' ? null : `${ends === 'never' ? 'no end date' : ends === 'date' ? `until ${formatYmd(endsOn)}` : `${endsAfter} payments`}`} onEdit={() => setStep(2)} />
            <PtReviewRow label="Runs" value={mode === 'ask' ? `After ${confirmers.length === 1 && confirmers[0] === me?.id ? 'you confirm' : `${confirmMode === 'all' ? 'all' : 'one'} of ${confirmers.length} confirm${confirmers.length === 1 ? 's' : ''}`}, the evening before` : 'Automatically on the day'} onEdit={() => setStep(3)} />
            <PtReviewRow label="If short" value={`Warn ${checkDays} day${checkDays === 1 ? '' : 's'} before, ${onDayText[onDay]}`} onEdit={() => setStep(4)} last />
          </PtPanel>
        </>
      ) : null}

      <PtOptionSheet visible={sheet === 'account'} title="Which account?" options={accounts.map((a) => ({ value: a.id, label: a.nickname }))} value={account?.id ?? null} onPick={(v) => { setAccountId(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'group'} title="Which group?" options={groups.map((g) => ({ value: g.id, label: g.name }))} value={group?.id ?? null} onPick={(v) => { setGroupId(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'from'} title="Pay from" options={spendable.map((w) => ({ value: w.id, label: w.name }))} value={from?.id ?? null} onPick={(v) => { setFromId(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'which'} title="Which" options={WHICH.map((w, i) => ({ value: i + 1, label: w }))} value={which} onPick={(v) => { setWhich(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'day'} title="Day" options={DAYS.map((d, i) => ({ value: i + 1, label: d }))} value={weekday} onPick={(v) => { setWeekday(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'hour'} title="Time" options={[6, 7, 8, 9, 10, 12, 15, 18].map((h) => ({ value: h, label: `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}` }))} value={hour} onPick={(v) => { setHour(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'check'} title="Check the balance" options={[1, 2, 3, 5, 7].map((d) => ({ value: d, label: `${d} day${d === 1 ? '' : 's'} before` }))} value={checkDays} onPick={(v) => { setCheckDays(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtOptionSheet visible={sheet === 'ends'} title="Ends" options={[{ value: 'never' as const, label: 'Never' }, { value: 'date' as const, label: 'On a date' }, { value: 'count' as const, label: 'After 12 payments' }]} value={ends} onPick={(v) => { setEnds(v); setSheet(v === 'date' ? 'endsOn' : null); }} onClose={() => setSheet(null)} />
      <PtDateSheet visible={sheet === 'date'} title={freq === 'once' ? 'On' : 'Starts'} value={date} minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 2} doneLabel="Done" onDone={(v) => { setDate(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtDateSheet visible={sheet === 'endsOn'} title="Ends on" value={endsOn} minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 5} doneLabel="Done" onDone={(v) => { setEndsOn(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PinSheet visible={pinOpen} title="Enter your PIN" subtitle={`Turn on ${name.trim() || defaultName}`} loading={create.isPending || makeGroup.isPending} error={pinError} onSubmit={(pin) => void turnOn(pin)} onClose={() => setPinOpen(false)} />
      {step === 1 && !accounts.length && !saved.isLoading ? (
        <Pressable onPress={() => navigation.navigate('SavedAccountAdd')} accessibilityRole="button" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: ptRadius.md, backgroundColor: pt.raised }}>
          <Feather name="plus" size={18} color={pt.brand} />
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Save an account to pay</Text>
        </Pressable>
      ) : null}
    </PtStepScreen>
  );
}
