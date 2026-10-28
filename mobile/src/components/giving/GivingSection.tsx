import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../pt/PtButton';
import { PtField } from '../pt/PtField';
import { PtText } from '../pt/PtText';
import { PtSheet } from '../pt/PtSheet';
import { PtAddRow } from '../pt/PtPeople';
import { PtDivider, PtGroupLabel, PtPanel, PtSwitchRow } from '../pt/PtForm';
import { ScheduleSheet, type ScheduleDraft } from './ScheduleSheet';
import type { RecipientKey } from './ChooseSavedSheet';
import { useGiving, useGivingActions } from '../../api/hooks';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { shortDate } from '../../lib/giving';
import type { GivingDetail } from '../../api/types';

type Schedule = GivingDetail['schedules'][number];

/**
 * WAL-18 giving wallet: what's set aside and given this year, payments waiting
 * for the giver's yes, what's coming up (Edit), the pledge, recipients and the
 * yearly statement.
 */
export function GivingSection({ walletId, isOwner }: { walletId: number; isOwner: boolean }) {
  const giving = useGiving(walletId);
  const actions = useGivingActions(walletId);
  const g = giving.data;
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [adding, setAdding] = useState<ScheduleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (giving.isLoading) return <ActivityIndicator color={pt.brand} />;
  if (!g) return null;

  const year = new Date().getFullYear();
  const pledgePct = g.pledge ? Math.min(100, (parseFloat(g.pledge.paid) / parseFloat(g.pledge.total)) * 100) : 0;
  const payees = g.recipients.map((r) => ('group_id' in r ? { key: `g${r.group_id}` as RecipientKey, name: r.name, size: r.accounts.length } : { key: `a${r.saved_account_id}` as RecipientKey, name: r.name, size: 1 }));
  const fail = (e: Error) => setError(e.message);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 14, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.emerald300 }}>Set aside</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: '#FFFFFF' }}>{formatNaira(g.set_aside)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.inkMuted }}>Given in {year}</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{formatNaira(g.given_this_year)}</Text>
        </View>
      </View>
      {error ? (
        <PtText variant="caption" color={pt.danger}>
          {error}
        </PtText>
      ) : null}

      {g.awaiting.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Waiting for your yes</PtGroupLabel>
          {g.awaiting.map((p) => (
            <View key={p.id} style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 10 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>
                {formatNaira(p.amount)} to {p.to}
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                {p.label} · {shortDate(new Date(`${p.date}T00:00:00`))}
              </Text>
              {isOwner ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PtButton title="Send it" size="sm" style={{ flex: 1 }} loading={actions.send.isPending} onPress={() => actions.send.mutate(p.id, { onError: fail })} />
                  <PtButton title="Skip this time" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => actions.skip.mutate(p.id, { onError: fail })} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Coming up</PtGroupLabel>
        <PtPanel>
          {g.coming_up.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 14 }}>Nothing scheduled.</Text>
          ) : null}
          {g.coming_up.map((c, i) => {
            const s = g.schedules.find((x) => x.id === c.schedule_id) ?? null;
            return (
              <React.Fragment key={`${c.schedule_id}-${c.date}`}>
                {i > 0 ? <PtDivider /> : null}
                <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
                      {shortDate(new Date(`${c.date}T00:00:00`))} · {c.label}
                    </Text>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>
                      {formatNaira(c.amount)} to {c.to}
                    </Text>
                  </View>
                  {isOwner && s ? (
                    <Pressable onPress={() => setEditing(s)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${c.label}`}>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
              </React.Fragment>
            );
          })}
        </PtPanel>
        {isOwner && payees.length ? (
          <PtAddRow
            label="Add a giving date"
            onPress={() => setAdding({ key: '', label: '', amount: '', payee: payees[0].key, frequency: 'once', dayOfWeek: 7, dayOfMonth: 15, weekOfMonth: 1, runOn: null })}
          />
        ) : null}
      </View>

      {g.pledge ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Pledge</PtGroupLabel>
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{g.pledge.name}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                {formatNaira(g.pledge.paid)} of {formatNaira(g.pledge.total)}
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.line, overflow: 'hidden' }}>
              <View style={{ width: `${pledgePct}%`, height: 6, backgroundColor: pt.gold500 }} />
            </View>
          </View>
        </View>
      ) : null}

      <PtPanel>
        <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>Recipients</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={2}>
              {g.recipients.map((r) => r.name).join(', ') || 'None yet'}
            </Text>
          </View>
        </View>
        <PtDivider />
        <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{g.statement.year} giving statement</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{g.statement.enabled ? 'Emailed in January' : 'Off — turn it on in settings'}</Text>
          </View>
          <Feather name="file-text" size={18} color={pt.inkSubtle} />
        </View>
      </PtPanel>

      {g.recent.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Recently</PtGroupLabel>
          <PtPanel>
            {g.recent.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 ? <PtDivider /> : null}
                <View style={{ minHeight: 56, paddingVertical: 10, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: p.status === 'failed' ? pt.danger : pt.ink }}>
                    {formatNaira(p.amount)} to {p.to} · {p.status === 'paid' ? 'sent' : p.status === 'skipped' ? 'skipped' : "didn't go"}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={2}>
                    {[p.label, shortDate(new Date(`${p.date}T00:00:00`)), p.receipt_no, p.note].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </PtPanel>
        </View>
      ) : null}

      <EditScheduleSheet
        schedule={editing}
        onSave={(patch) => editing && actions.updateSchedule.mutate({ id: editing.id, ...patch }, { onSuccess: () => setEditing(null), onError: fail })}
        onRemove={() => editing && actions.removeSchedule.mutate(editing.id, { onSuccess: () => setEditing(null), onError: fail })}
        onClose={() => setEditing(null)}
      />
      <ScheduleSheet
        initial={adding}
        recipients={payees}
        onSave={(s) =>
          actions.addSchedule.mutate(
            {
              label: s.label,
              amount: s.amount,
              ...(s.payee.startsWith('g') ? { group_id: Number(s.payee.slice(1)) } : { saved_account_id: Number(s.payee.slice(1)) }),
              frequency: s.frequency,
              day_of_week: s.frequency === 'weekly' || s.frequency === 'monthly_weekday' ? s.dayOfWeek : undefined,
              day_of_month: s.frequency === 'monthly' ? s.dayOfMonth : undefined,
              week_of_month: s.frequency === 'monthly_weekday' ? s.weekOfMonth : undefined,
              run_on: s.frequency === 'once' ? s.runOn ?? undefined : undefined,
            },
            { onSuccess: () => setAdding(null), onError: fail },
          )
        }
        onClose={() => setAdding(null)}
      />
    </View>
  );
}

/** WAL-18 "Edit": the amount, pause it, or remove it. */
function EditScheduleSheet({
  schedule,
  onSave,
  onRemove,
  onClose,
}: {
  schedule: Schedule | null;
  onSave: (patch: { amount?: string; enabled?: boolean; ask_first?: boolean }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [askFirst, setAskFirst] = useState(false);
  const [openedFor, setOpenedFor] = useState<Schedule | null>(null);
  if (schedule !== openedFor) {
    setOpenedFor(schedule);
    setAmount(schedule ? String(parseFloat(schedule.amount)) : '');
    setEnabled(schedule?.enabled ?? true);
    setAskFirst(schedule?.ask_first ?? false);
  }
  return (
    <PtSheet
      visible={Boolean(schedule)}
      title={schedule?.label ?? ''}
      subtitle={schedule ? `${schedule.to} · ${schedule.when}` : undefined}
      onClose={onClose}
      footer={
        <>
          <PtButton title="Save" onPress={() => onSave({ amount, enabled, ask_first: askFirst })} />
          <PtButton title="Remove this giving date" variant="ghost" onPress={onRemove} />
        </>
      }
    >
      <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" />
      <PtPanel>
        <PtSwitchRow title="On" subtitle={enabled ? 'It goes out on the day' : 'Paused'} value={enabled} onChange={setEnabled} />
        <PtDivider />
        <PtSwitchRow title="Ask me first" subtitle={askFirst ? 'We ask before it goes' : 'It goes automatically'} value={askFirst} onChange={setAskFirst} />
      </PtPanel>
    </PtSheet>
  );
}
