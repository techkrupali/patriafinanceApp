import React, { useState } from 'react';
import { Pressable } from 'react-native-gesture-handler';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtSheet } from '../pt/PtSheet';
import { PtField } from '../pt/PtField';
import { PtButton } from '../pt/PtButton';
import { PtText } from '../pt/PtText';
import { PtDateSheet } from '../pt/PtDateSheet';
import { PtGroupLabel, PtPills } from '../pt/PtForm';
import { formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { whenLabel, type GivingWhen } from '../../lib/giving';
import type { RecipientKey } from './ChooseSavedSheet';

/** One giving date as the setup holds it. */
export interface ScheduleDraft extends GivingWhen {
  key: string;
  label: string;
  /** Naira per date; a group splits it. */
  amount: string;
  payee: RecipientKey;
}

const DAYS = [
  { value: 7, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const KINDS = [
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly_weekday', label: 'Monthly, on a day' },
  { value: 'monthly', label: 'Monthly, on a date' },
  { value: 'once', label: 'Once' },
] as const;

/** GIV-04 "Add a giving date" / edit one: what, how much, to whom, when. */
export function ScheduleSheet({
  initial,
  recipients,
  onSave,
  onRemove,
  onClose,
}: {
  /** null = closed; a draft with an empty key = new. */
  initial: ScheduleDraft | null;
  recipients: { key: RecipientKey; name: string; size: number }[];
  onSave: (s: ScheduleDraft) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<ScheduleDraft | null>(initial);
  const [dateOpen, setDateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<ScheduleDraft | null>(null);
  if (initial !== openedFor) {
    setOpenedFor(initial);
    setS(initial);
    setError(null);
  }
  if (!s) return <PtSheet visible={false} title="" onClose={onClose}>{null}</PtSheet>;

  const set = (patch: Partial<ScheduleDraft>) => setS({ ...s, ...patch });
  const payee = recipients.find((r) => r.key === s.payee);
  const save = () => {
    if (!s.label.trim()) return setError('Give it a name, like "Sunday offering".');
    if (!(Number(s.amount) > 0)) return setError('Enter how much goes out.');
    if (!payee) return setError('Choose who receives it.');
    if (s.frequency === 'monthly' && !(s.dayOfMonth >= 1 && s.dayOfMonth <= 28)) return setError('Pick a date from the 1st to the 28th.');
    if (s.frequency === 'once' && !s.runOn) return setError('Pick the day.');
    onSave({ ...s, label: s.label.trim() });
  };

  return (
    <PtSheet
      visible={Boolean(initial)}
      title={initial?.key ? s.label || 'Giving date' : 'Add a giving date'}
      subtitle={`${whenLabel(s)} at 7:00 am`}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtButton title="Save" onPress={save} />
          {onRemove && initial?.key ? <PtButton title="Remove this giving date" variant="ghost" onPress={onRemove} /> : null}
        </>
      }
    >
      <PtField label="What is it" value={s.label} onChangeText={(t) => set({ label: t })} placeholder="Sunday offering" maxLength={60} />
      <PtField
        label={payee && payee.size > 1 ? `Amount (split between ${payee.size})` : 'Amount'}
        prefix="₦"
        value={groupAmountInput(s.amount)}
        onChangeText={(t) => set({ amount: sanitizeAmountInput(t) })}
        placeholder="2,000"
        keyboardType="decimal-pad"
      />
      <View style={{ gap: 10 }}>
        <PtGroupLabel>Goes to</PtGroupLabel>
        <PtPills options={recipients.map((r) => ({ value: r.key, label: r.name }))} value={s.payee} onChange={(k) => set({ payee: k })} />
      </View>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>When</PtGroupLabel>
        <PtPills options={KINDS.map((k) => ({ value: k.value, label: k.label }))} value={s.frequency} onChange={(f) => set({ frequency: f })} />
        {s.frequency === 'monthly_weekday' ? (
          <PtPills
            options={[1, 2, 3, 4].map((n) => ({ value: n, label: ['', 'First', 'Second', 'Third', 'Fourth'][n] }))}
            value={s.weekOfMonth}
            onChange={(n) => set({ weekOfMonth: n })}
          />
        ) : null}
        {s.frequency === 'weekly' || s.frequency === 'monthly_weekday' ? <PtPills options={DAYS} value={s.dayOfWeek} onChange={(d) => set({ dayOfWeek: d })} /> : null}
        {s.frequency === 'monthly' ? (
          <PtField
            label="Day of the month (1–28)"
            value={s.dayOfMonth ? String(s.dayOfMonth) : ''}
            onChangeText={(t) => set({ dayOfMonth: Number(t.replace(/\D/g, '').slice(0, 2)) || 0 })}
            placeholder="15"
            keyboardType="number-pad"
            maxLength={2}
          />
        ) : null}
        {s.frequency === 'once' ? (
          <Pressable
            onPress={() => setDateOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Pick the day"
            style={{ height: 56, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}
          >
            <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 16, color: s.runOn ? pt.ink : pt.inkSubtle }}>{s.runOn ? formatYmd(s.runOn) : 'Pick the day'}</Text>
            <Feather name="calendar" size={18} color={pt.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      <PtDateSheet
        visible={dateOpen}
        title="Pay on"
        value={s.runOn ?? ymdMonthsFromNow(0)}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 3}
        doneLabel="Done"
        onDone={(ymd) => {
          set({ runOn: ymd });
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />
    </PtSheet>
  );
}
