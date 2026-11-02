import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PinSheet } from '../../components/PinSheet';
import { TwoStepSheet, twoStepAsked } from '../../components/TwoStepSheet';
import { useBudget, useWallets } from '../../api/hooks';
import { useCreateScheduledPayment, type Frequency } from '../../api/scheduled';
import { useSendDraft } from '../../store/sendDraft';
import { canSendFrom } from '../../lib/sendRules';
import { formatMoney, formatNaira, toYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

/** ISO weekday: 1 = Monday … 7 = Sunday. */
const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

const TIMES = [6, 7, 9, 12, 15, 18].map((h) => ({ value: h, label: `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}` }));
const ENDS = [0, 2, 3, 4, 6, 12, 24].map((n) => ({ value: n, label: n ? `After ${n} payments` : 'Never' }));

const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** The next `day` (ISO weekday) at `hour`, from now on. */
function nextWeekday(day: number, hour: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour);
  while (isoDay(d) !== day || d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** "Sat 31 Oct, 7:00 am" */
function startsLabel(d: Date): string {
  const m = d.getMinutes();
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}, ${d.getHours() % 12 || 12}:${String(m).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

/**
 * SND-14 Repeat payment: once later or on repeat (weekly, every 2 weeks,
 * monthly, quarterly, yearly), on which day, when it starts and ends, and the
 * wallet it comes from — authorised now with the PIN; each date then sends
 * through the same checks as a payment by hand. From SND-13, "Try
 * automatically in 1 hour".
 */
export function SendScheduleScreen({ navigation, route }: RootScreenProps<'SendSchedule'>) {
  const retry = Boolean(route.params?.retryInHour);
  const wallets = useWallets();
  const create = useCreateScheduledPayment();
  const { recipient, amount, note, fromWalletId, categoryId } = useSendDraft();
  const from = (wallets.data ?? []).filter(canSendFrom).find((w) => w.id === fromWalletId);
  const budget = useBudget(from?.id ?? 0, from?.type === 'spending');
  const category = budget.data?.categories.find((c) => c.id === categoryId);

  const [frequency, setFrequency] = useState<Frequency>(retry ? 'once' : 'weekly');
  const [starts, setStarts] = useState<Date>(() => {
    if (retry) return new Date(Math.ceil((Date.now() + 3_600_000) / 300_000) * 300_000);
    const t = new Date(Date.now() + 86_400_000);
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 7);
  });
  const [ends, setEnds] = useState(0);
  const [picking, setPicking] = useState<'date' | 'time' | 'ends' | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [twoStep, setTwoStep] = useState<{ asked: ReturnType<typeof twoStepAsked>; pin: string; error: string | null }>({ asked: null, pin: '', error: null });
  const n = parseFloat(amount) || 0;
  const first = recipient?.name.split(' ')[0] ?? '';
  const weekly = frequency === 'weekly' || frequency === 'biweekly';

  const destination = useMemo(() => {
    if (recipient?.kind === 'user') return { kind: 'user' as const, identifier: recipient.identifier };
    if (recipient?.kind === 'group') return { kind: 'group' as const, group_id: recipient.groupId };
    if (recipient?.kind === 'bank') return { kind: 'bank' as const, bank_code: recipient.bankCode, account_number: recipient.accountNumber, account_name: recipient.name, bank_name: recipient.bankName };
    return null;
  }, [recipient]);

  const schedule = (pin: string, twoFactorCode?: string) => {
    if (!from || !destination) return;
    setPinError(null);
    create.mutate(
      {
        from_wallet_id: from.id,
        amount: String(n),
        note: note.trim() || undefined,
        budget_category_id: category?.id,
        skip_if_over: Boolean(category),
        destination,
        to_name: recipient?.name,
        frequency,
        starts_at: starts.toISOString(),
        ends_after: frequency !== 'once' && ends ? ends : undefined,
        pin,
        two_factor_code: twoFactorCode,
      },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          setTwoStep({ asked: null, pin: '', error: null });
          navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'ScheduledPayments' }] });
        },
        onError: (e) => {
          const asked = twoStepAsked(e);
          if (asked) {
            setPinOpen(false);
            setTwoStep({ asked, pin, error: twoFactorCode ? e.message : null });
            return;
          }
          if (twoFactorCode) return setTwoStep((t) => ({ ...t, error: e.message }));
          setPinError(e.message);
        },
      },
    );
  };

  if (!recipient) return null;

  return (
    <PtPageScreen
      title="Repeat payment"
      subtitle={`${formatNaira(String(n))} to ${first}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Schedule" disabled={!from || !destination || !n} onPress={() => setPinOpen(true)} loading={create.isPending} />}
    >
      {!destination ? <PtNote tone="info">Repeat payments go to people, bank accounts and groups. Moves between your own wallets are rules.</PtNote> : null}

      <PtPills
        options={FREQUENCIES}
        value={frequency}
        onChange={(f) => {
          setFrequency(f);
          if (f === 'weekly' || f === 'biweekly') setStarts(nextWeekday(isoDay(starts), starts.getHours()));
        }}
      />

      {weekly ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>On</PtGroupLabel>
          <PtPills options={DAYS} value={isoDay(starts)} onChange={(d) => setStarts(nextWeekday(d, starts.getHours()))} />
        </View>
      ) : null}

      <PtPanel>
        <PtReviewRow label={frequency === 'once' ? 'On' : 'Starts'} value={startsLabel(starts)} onEdit={() => setPicking('date')} />
        {frequency !== 'once' ? <PtReviewRow label="Ends" value={ends ? `After ${ends} payments` : 'Never'} sub={ends ? null : 'Or after a number of payments'} onEdit={() => setPicking('ends')} /> : null}
        <PtReviewRow
          label="From"
          value={from?.name ?? 'Choose a wallet'}
          sub={category ? `Skips if ${category.name} is used up` : null}
          onEdit={() => navigation.navigate('SendFrom')}
          last
        />
      </PtPanel>

      <PtDateSheet
        visible={picking === 'date'}
        title={frequency === 'once' ? 'On' : 'Starts'}
        value={toYmd(starts)}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 2}
        doneLabel="Next: the time"
        onDone={(ymd) => {
          const [y, m, d] = ymd.split('-').map(Number);
          setStarts(new Date(y, m - 1, d, starts.getHours(), starts.getMinutes()));
          setPicking('time');
        }}
        onClose={() => setPicking(null)}
      />
      <PtOptionSheet
        visible={picking === 'time'}
        title="What time?"
        options={TIMES}
        value={TIMES.some((t) => t.value === starts.getHours()) && !starts.getMinutes() ? starts.getHours() : null}
        onPick={(h) => {
          const next = new Date(starts.getFullYear(), starts.getMonth(), starts.getDate(), h);
          // Not in the past: the same time tomorrow instead.
          if (next <= new Date()) next.setDate(next.getDate() + 1);
          setStarts(next);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <PtOptionSheet
        visible={picking === 'ends'}
        title="Ends"
        options={ENDS}
        value={ends}
        onPick={(v) => {
          setEnds(v);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`${formatNaira(String(n))} to ${first}, ${frequency === 'once' ? `on ${startsLabel(starts)}` : FREQUENCIES.find((f) => f.value === frequency)?.label.toLowerCase()}`}
        amount={formatMoney(String(n))}
        loading={create.isPending}
        error={pinError}
        onSubmit={(pin) => schedule(pin)}
        onClose={() => setPinOpen(false)}
      />
      <TwoStepSheet asked={twoStep.asked} busy={create.isPending} error={twoStep.error} onSubmit={(code) => schedule(twoStep.pin, code)} onClose={() => setTwoStep({ asked: null, pin: '', error: null })} />
    </PtPageScreen>
  );
}
