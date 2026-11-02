import React, { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useAwayActions, useAwayMode, useFamily } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput, toYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import { useAuth } from '../../store/auth';
import type { RootScreenProps } from '../../navigation/types';

const short = (ymd: string) => formatYmd(ymd).replace(/ \d{4}$/, '');
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toYmd(d);
};

/**
 * APR-09 Away mode: someone you trust approves for you on shared wallets
 * between two dates, up to an amount a payment. Emergency fund releases stay
 * with the keyholders. They see "Approving for Ngozi" on each request.
 */
export function AwayModeScreen({ navigation }: RootScreenProps<'AwayMode'>) {
  const q = useAwayMode();
  const me = useAuth((s) => s.user?.first_name) || 'you';
  const family = useFamily({ adults: true });
  const actions = useAwayActions();
  const [on, setOn] = useState(false);
  const [delegateId, setDelegateId] = useState<number | null>(null);
  const [from, setFrom] = useState(toYmd(new Date()));
  const [to, setTo] = useState(plusDays(7));
  const [max, setMax] = useState('200000');
  const [sheet, setSheet] = useState<null | 'who' | 'from' | 'to' | 'max'>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const away = q.data;

  useEffect(() => {
    if (!away) return;
    setOn(true);
    setDelegateId(away.delegate?.id ?? null);
    setFrom(away.from);
    setTo(away.to);
    setMax(away.max_amount ? String(Math.round(Number(away.max_amount))) : '');
  }, [away]);

  if (q.isLoading) {
    return (
      <PtPageScreen title="Away mode" onBack={() => navigation.goBack()}>
        <LoadingBlock />
      </PtPageScreen>
    );
  }
  const people = (family.data?.members ?? []).filter((m) => !m.is_child);
  const delegate = people.find((m) => m.id === delegateId) ?? (away?.delegate ? { id: away.delegate.id, name: away.delegate.name } : null);
  const first = (delegate?.name ?? 'Someone').split(' ')[0];

  const turnOff = () =>
    actions.clear.mutate(undefined, {
      onSuccess: () => {
        setOn(false);
        notifySuccess();
        showAlert('Away mode off', 'Approvals come to you again.');
      },
      onError: (e) => showAlert('Not changed', (e as Error).message),
    });

  return (
    <PtPageScreen
      title="Away mode"
      subtitle="Hand over approvals while you're away"
      onBack={() => navigation.goBack()}
      footer={
        on && !away ? (
          <PtButton title="Turn on away mode" disabled={!delegate || to < from} onPress={() => setPinOpen(true)} />
        ) : away ? (
          <PtButton title="Save changes" variant="secondary" disabled={!delegate || to < from} onPress={() => setPinOpen(true)} />
        ) : null
      }
    >
      <PtPanel>
        <PtSwitchRow
          title="Away mode"
          subtitle={on ? `On from ${short(from)} to ${short(to)}` : 'Off'}
          value={on}
          onChange={(v) => (v ? setOn(true) : away ? turnOff() : setOn(false))}
        />
      </PtPanel>
      {on ? (
        <>
          <PtGroupLabel>While you're away</PtGroupLabel>
          <PtPanel>
            <PtReviewRow label={delegate ? `${first} approves for you` : 'Who approves for you'} value={delegate ? 'On all shared wallets' : 'Choose someone'} onEdit={() => setSheet('who')} />
            <PtReviewRow label="From" value={formatYmd(from)} onEdit={() => setSheet('from')} />
            <PtReviewRow label="To" value={formatYmd(to)} onEdit={() => setSheet('to')} />
            <PtReviewRow label="Up to" value={max ? `${formatNaira(max)} a payment` : 'Any amount'} sub="Above that, it waits for you" onEdit={() => setSheet('max')} last />
          </PtPanel>
          <PtPanel>
            <PtReviewRow label="Not included" value="Emergency fund releases" sub="Keyholders always decide themselves" />
            <PtReviewRow label="Your phone" value="Still notified, no need to answer" last />
          </PtPanel>
          <PtNote>{`${first} will see "Approving for ${me}" on each request. Everything is in the audit log.`}</PtNote>
        </>
      ) : null}

      <PtOptionSheet
        visible={sheet === 'who'}
        title="Who approves for you"
        options={people.map((m) => ({ value: m.id, label: m.name }))}
        value={delegateId}
        onPick={(id) => { setDelegateId(id); setSheet(null); }}
        onClose={() => setSheet(null)}
      />
      <PtDateSheet visible={sheet === 'from'} title="From" value={from} minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 1} doneLabel="Done" onDone={(v) => { setFrom(v); if (to < v) setTo(v); setSheet(null); }} onClose={() => setSheet(null)} />
      <PtDateSheet visible={sheet === 'to'} title="To" value={to} minYear={new Date().getFullYear()} maxYear={new Date().getFullYear() + 1} doneLabel="Done" onDone={(v) => { setTo(v); setSheet(null); }} onClose={() => setSheet(null)} />
      {sheet === 'max' ? (
        <PtOptionSheet
          visible
          title="Up to, a payment"
          options={[50_000, 100_000, 200_000, 500_000, 0].map((v) => ({ value: v, label: v ? formatNaira(v) : 'Any amount' }))}
          value={Number(max || 0)}
          onPick={(v) => { setMax(v ? String(v) : ''); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`To let ${first} approve for you`}
        loading={actions.set.isPending}
        error={pinError}
        onSubmit={(pin) => {
          if (!delegate) return;
          setPinError(null);
          actions.set.mutate(
            { delegate_id: delegate.id, from, to, max_amount: max ? sanitizeAmountInput(groupAmountInput(max)) : undefined, pin },
            {
              onSuccess: () => {
                notifySuccess();
                setPinOpen(false);
                showAlert('Away mode on', `${first} approves for you from ${short(from)} to ${short(to)}.`);
              },
              onError: (e) => {
                const err = e as ApiError;
                if (err.errors?.pin) setPinError(err.errors.pin[0]);
                else {
                  setPinOpen(false);
                  showAlert('Not turned on', err.message);
                }
              },
            },
          );
        }}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
