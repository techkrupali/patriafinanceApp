import React, { useState } from 'react';
import { useFamily, useWallets } from '../../api/hooks';
import { useAcceptProposal, useProposal } from '../../api/proposals';
import { ApiError } from '../../api/client';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * VPJ-06 Set up the project: who approves each phase (just me, me and someone
 * both, or choose per phase), which wallet covers the first phase now, and a
 * monthly amount after that — "Fund ₦960,000 and start".
 */
export function ProposalFundScreen({ navigation, route }: RootScreenProps<'ProposalFund'>) {
  const { proposalId } = route.params;
  const q = useProposal(proposalId);
  const wallets = useWallets();
  const family = useFamily({ adults: true });
  const accept = useAcceptProposal(proposalId);
  const [who, setWho] = useState<'me' | 'both' | 'per_phase'>('me');
  const [coId, setCoId] = useState<number | null>(null);
  const [fromId, setFromId] = useState<number | null>(null);
  const [monthly, setMonthly] = useState('');
  const [sheet, setSheet] = useState<null | 'from' | 'monthly' | 'co'>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const p = q.data;

  if (!p) {
    return (
      <PtPageScreen title="Set up the project" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const first = p.phases[0];
  const need = Number(first?.amount ?? 0);
  const mine = (wallets.data ?? []).filter((w) => (w.my_role ?? 'owner') === 'owner' && w.status === 'active' && !['child', 'emergency', 'project'].includes(w.type));
  const enough = mine.filter((w) => Number(w.balance) >= need);
  const from = mine.find((w) => w.id === fromId) ?? enough.find((w) => w.type !== 'main') ?? enough[0] ?? mine[0];
  const people = (family.data?.members ?? []).filter((m) => !m.is_child);
  const co = people.find((m) => m.id === coId) ?? people[0];
  const coFirst = co?.name.split(' ')[0];

  const submit = (pin: string) => {
    if (!from) return;
    setPinError(null);
    accept.mutate(
      { pin, approvers: who, co_approver_id: who === 'both' ? co?.id : undefined, source_wallet_id: from.id, monthly: monthly || undefined },
      {
        onSuccess: (r) => {
          notifySuccess();
          setPinOpen(false);
          showAlert('Project started', p.terms.upfront ? `${formatNaira(need)} moved in. ${first.title} is paid to ${p.vendor.business ?? 'the builder'}, ${p.terms.retention_percent}% held back.` : `${formatNaira(need)} moved in for ${first.title}.`);
          navigation.popToTop();
          navigation.navigate(who === 'per_phase' ? 'ProjectApprovalSettings' : 'ProjectDetail', { projectId: r.project.id });
        },
        onError: (e) => {
          const err = e as ApiError;
          if (err.errors?.pin) setPinError(err.errors.pin[0]);
          else {
            setPinOpen(false);
            showAlert('Not started', err.message);
          }
        },
      },
    );
  };

  return (
    <PtPageScreen
      title="Set up the project"
      subtitle={p.title}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={`Fund ${formatNaira(need)} and start`} disabled={!from || Number(from.balance) < need || (who === 'both' && !co)} onPress={() => setPinOpen(true)} />}
    >
      <PtGroupLabel>Who approves each phase</PtGroupLabel>
      <PtChoiceCard title="Just me" subtitle="One approval releases the money" selected={who === 'me'} onPress={() => setWho('me')} />
      <PtChoiceCard
        title={co ? `Me and ${coFirst}, both` : 'Me and someone else, both'}
        subtitle={co ? 'Two approvals needed · tap to choose who' : 'Add a family member first'}
        selected={who === 'both'}
        onPress={() => {
          setWho('both');
          if (people.length > 1) setSheet('co');
        }}
      />
      <PtChoiceCard title="Choose for each phase" subtitle="Different approvers per milestone" selected={who === 'per_phase'} onPress={() => setWho('per_phase')} />

      <PtGroupLabel>Pay for it from</PtGroupLabel>
      <PtPanel>
        <PtReviewRow
          label={from?.name ?? 'No wallet'}
          value={from ? formatNaira(from.balance) : '—'}
          sub={from && Number(from.balance) >= need ? `Covers ${first.title} now` : `Needs ${formatNaira(need)} for ${first.title}`}
          onEdit={mine.length > 1 ? () => setSheet('from') : undefined}
        />
        <PtReviewRow
          label="Then"
          value={monthly ? `${formatNaira(monthly)} a month${who === 'both' && co ? ` from you and ${coFirst}` : ''}` : 'Add money as you go'}
          sub={monthly ? 'On the 25th, into the project wallet' : 'Or save a set amount each month'}
          onEdit={() => setSheet('monthly')}
          last
        />
      </PtPanel>
      {who === 'both' && co ? <PtNote>{`We'll ask ${coFirst} to join as a co-owner. Once ${coFirst} accepts, both of you approve each phase.`}</PtNote> : null}
      {from && Number(from.balance) < need ? <PtNote tone="attention">{`${from.name} has ${formatNaira(from.balance)}. Add money or choose another wallet.`}</PtNote> : null}

      <PtOptionSheet
        visible={sheet === 'from'}
        title="Pay for it from"
        options={mine.map((w) => ({ value: w.id, label: `${w.name} · ${formatNaira(w.balance)}` }))}
        value={from?.id ?? null}
        onPick={(id) => { setFromId(id); setSheet(null); }}
        onClose={() => setSheet(null)}
      />
      <PtOptionSheet
        visible={sheet === 'co'}
        title="Who approves with you"
        options={people.map((m) => ({ value: m.id, label: m.name }))}
        value={co?.id ?? null}
        onPick={(id) => { setCoId(id); setSheet(null); }}
        onClose={() => setSheet(null)}
      />
      <PtSheet visible={sheet === 'monthly'} title="Then each month" subtitle="From your Main wallet on the 25th" onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => setSheet(null)} />}>
        <PtField label="Amount" prefix="₦" value={groupAmountInput(monthly)} onChangeText={(t) => setMonthly(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
      </PtSheet>
      <PinSheet visible={pinOpen} title="Fund and start" subtitle={`${first.title} · ${p.title}`} amount={formatNaira(need)} recipient={p.vendor.business ?? undefined} loading={accept.isPending} error={pinError} onSubmit={submit} onClose={() => setPinOpen(false)} />
    </PtPageScreen>
  );
}
