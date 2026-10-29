import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { useProposeMilestone, useUpdateProposal } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { LoadingBlock, TickRow } from '../../components/project/ProjectUi';
import { formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { PROPOSE_REASONS } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

type Reason = (typeof PROPOSE_REASONS)[number]['value'];

/** VDM-09 "Add a milestone": the family must approve it before work starts; nothing is paid until then. */
export function ProposeMilestoneScreen({ navigation, route }: RootScreenProps<'ProposeMilestone'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const propose = useProposeMilestone(projectId);
  const update = useUpdateProposal();
  const existing = query.data?.milestones.find((m) => m.id === milestoneId);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [items, setItems] = useState<{ text: string; on: boolean }[]>([]);
  const [newItem, setNewItem] = useState('');
  const [reason, setReason] = useState<Reason>('family_asked');
  const [why, setWhy] = useState('');
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setAmount(String(Math.round(Number(existing.amount))));
    setDue(existing.due_date);
    setItems(existing.deliverables.map((d) => ({ text: d.text, on: true })));
  }, [existing]);

  if (!query.data) {
    return (
      <PtPageScreen title="Add a milestone" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const family = query.data.project.family ? `The ${query.data.project.family}` : 'The family';
  const deliverables = items.filter((i) => i.on).map((i) => i.text);
  const ok = title.trim().length > 1 && Number(amount) > 0;
  // From the submit event too: Enter right after typing may come before the state has caught up.
  const addItem = (typed?: string) => {
    const t = (typed ?? newItem).trim();
    if (!t) return;
    setItems((prev) => [...prev, { text: t, on: true }]);
    setNewItem('');
  };

  const send = () => {
    const done = () => {
      showAlert('Sent to the family', `${family} will approve it before work starts.`);
      navigation.goBack();
    };
    const onError = (e: unknown) => showAlert('Not sent', (e as Error).message);
    if (existing) {
      update.mutate({ milestoneId: existing.id, title: title.trim(), amount, due_date: due ?? undefined, deliverables }, { onSuccess: done, onError });
    } else {
      propose.mutate({ title: title.trim(), amount, due_date: due ?? undefined, deliverables, reason, why: why.trim() || undefined }, { onSuccess: done, onError });
    }
  };

  const year = new Date().getFullYear();
  return (
    <PtPageScreen
      title={existing ? 'Change the milestone' : 'Add a milestone'}
      subtitle={query.data.project.title}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Send to the family" onPress={send} disabled={!ok} loading={propose.isPending || update.isPending} />}
    >
      {existing?.proposal?.family_note ? (
        <PtNote tone="attention">{`The family asked: ${existing.proposal.family_note}`}</PtNote>
      ) : (
        <PtNote>{`${family} must approve new milestones before work starts. Nothing is paid until then.`}</PtNote>
      )}
      <PtField label="Milestone" value={title} onChangeText={setTitle} placeholder="Kitchen cabinets and worktop" maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t).split('.')[0])} keyboardType="number-pad" placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <PtField label="Due" value={due ? formatYmd(due) : ''} placeholder="Pick a date" onPressBox={() => setDateOpen(true)} />
        </View>
      </View>
      <PtGroupLabel>Deliverables</PtGroupLabel>
      <PtPanel>
        {items.map((it, i) => (
          <TickRow key={`${it.text}-${i}`} title={it.text} checked={it.on} onToggle={() => setItems((prev) => prev.map((p, j) => (j === i ? { ...p, on: !p.on } : p)))} />
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }}>
          <TextInput value={newItem} onChangeText={setNewItem} onSubmitEditing={(e) => addItem(e.nativeEvent.text)} placeholder="Add a deliverable" placeholderTextColor={pt.inkSubtle} maxLength={120} accessibilityLabel="Add a deliverable"
            style={{ flex: 1, minWidth: 0, fontFamily: ptFont.regular, fontSize: 15, color: pt.ink, paddingVertical: 8 }}
          />
          <Pressable onPress={() => { selection(); addItem(); }} disabled={!newItem.trim()} accessibilityRole="button" accessibilityLabel="Add" hitSlop={8}>
            <Feather name="plus-circle" size={22} color={newItem.trim() ? pt.brand : pt.lineStrong} />
          </Pressable>
        </View>
      </PtPanel>
      {!existing ? (
        <>
          <PtGroupLabel>Why it's needed</PtGroupLabel>
          <PtPills options={[...PROPOSE_REASONS]} value={reason} onChange={(v) => setReason(v as Reason)} />
          <PtField label="In a few words (optional)" value={why} onChangeText={setWhy} placeholder="You asked for this on site" maxLength={300} />
        </>
      ) : null}
      <PtDateSheet visible={dateOpen} title="Due" value={due ?? ymdMonthsFromNow(1)} minYear={year} maxYear={year + 5} doneLabel="Done" onDone={(ymd) => { setDue(ymd); setDateOpen(false); }} onClose={() => setDateOpen(false)} />
    </PtPageScreen>
  );
}
