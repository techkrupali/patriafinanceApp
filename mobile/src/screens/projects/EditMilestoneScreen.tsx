import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAddProjectMilestone, useEditMilestone } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadingBlock, TickRow } from '../../components/project/ProjectUi';
import { formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { namesList } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * PRJ-05 Edit milestone: the name, amount, due date, what must be done and the
 * proof needed. Names, lists and proof change at once; a new amount or date
 * goes to the builder to accept. With no milestone it adds one.
 */
export function EditMilestoneScreen({ navigation, route }: RootScreenProps<'EditMilestone'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const edit = useEditMilestone();
  const add = useAddProjectMilestone(projectId);
  const milestone = query.data?.milestones.find((m) => m.id === milestoneId);
  const project = query.data?.project;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [items, setItems] = useState<{ text: string; on: boolean }[]>([]);
  const [newItem, setNewItem] = useState('');
  const [proof, setProof] = useState('');
  const [proofDraft, setProofDraft] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || !query.data) return;
    if (milestone) {
      setTitle(milestone.title);
      setAmount(String(Math.round(Number(milestone.change_request?.amount ?? milestone.amount))));
      setDue(milestone.change_request?.due_date ?? milestone.due_date);
      setItems(milestone.deliverables.map((d) => ({ text: d.text, on: true })));
      setProof(milestone.proof_needed ?? '');
    } else {
      const r = query.data.project.setup?.release;
      setProof(r ? [r.photos ? 'Photos' : null, r.video ? 'a video' : null, r.receipts ? 'receipts' : null].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') : '');
    }
    setLoaded(true);
  }, [query.data, milestone, loaded]);

  if (!query.data || !project) {
    return (
      <PtPageScreen title={milestoneId ? 'Edit milestone' : 'Add a milestone'} onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const builderAgreed = project.vendor && project.vendor_status === 'accepted';
  const amountOk = Number(amount) > 0;
  const valid = title.trim().length > 0 && amountOk;
  const deliverables = items.filter((i) => i.on).map((i) => i.text);
  const busy = edit.isPending || add.isPending;

  // From the submit event too: Enter right after typing may come before the state has caught up.
  const addItem = (typed?: string) => {
    const t = (typed ?? newItem).trim();
    if (!t) return;
    setItems((prev) => [...prev, { text: t, on: true }]);
    setNewItem('');
  };

  const save = () => {
    const onError = (e: unknown) => showAlert('Could not save', (e as Error).message);
    if (milestone) {
      edit.mutate(
        { milestoneId: milestone.id, title: title.trim(), amount, due_date: due, deliverables, proof_needed: proof.trim() || null },
        {
          onSuccess: (r) => {
            if (r.milestone.change_request?.by === 'family') showAlert('Sent to the builder', `${project.vendor?.name ?? 'The builder'} will accept the new amount or date before it applies.`);
            navigation.goBack();
          },
          onError,
        },
      );
      return;
    }
    add.mutate({ title: title.trim(), amount, due_date: due ?? undefined, deliverables }, { onSuccess: () => navigation.goBack(), onError });
  };

  const year = new Date().getFullYear();
  return (
    <PtPageScreen
      title={milestone ? 'Edit milestone' : 'Add a milestone'}
      subtitle={milestone ? milestone.title : project.title}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={milestone ? (builderAgreed ? 'Save and send to builder' : 'Save') : 'Add milestone'} onPress={save} disabled={!valid} loading={busy} />}
    >
      <PtField label="Milestone" value={title} onChangeText={setTitle} placeholder="Painting and fittings" maxLength={120} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1.2 }}>
          <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t).split('.')[0])} keyboardType="number-pad" placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <PtField label="Due" value={due ? formatYmd(due) : ''} placeholder="Pick a date" onPressBox={() => setDateOpen(true)} />
        </View>
      </View>

      <PtGroupLabel>What must be done</PtGroupLabel>
      <PtPanel>
        {items.map((it, i) => (
          <TickRow key={`${it.text}-${i}`} title={it.text} checked={it.on} onToggle={() => setItems((prev) => prev.map((p, j) => (j === i ? { ...p, on: !p.on } : p)))} />
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }}>
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={(e) => addItem(e.nativeEvent.text)}
            placeholder="Add something that must be done"
            placeholderTextColor={pt.inkSubtle}
            maxLength={120}
            accessibilityLabel="Add something that must be done"
            style={{ flex: 1, minWidth: 0, fontFamily: ptFont.regular, fontSize: 15, color: pt.ink, paddingVertical: 8 }}
          />
          <Pressable onPress={() => { selection(); addItem(); }} disabled={!newItem.trim()} accessibilityRole="button" accessibilityLabel="Add" hitSlop={8}>
            <Feather name="plus-circle" size={22} color={newItem.trim() ? pt.brand : pt.lineStrong} />
          </Pressable>
        </View>
      </PtPanel>

      <PtPanel>
        <PtReviewRow label="Approvers" value={namesList(project.approvers.map((a) => a.first_name)) || 'You'} onEdit={() => navigation.navigate('WalletSettings', { walletId: project.wallet_id })} />
        <PtReviewRow label="Proof needed" value={proof || 'Photos'} onEdit={() => { setProofDraft(proof); setProofOpen(true); }} last />
      </PtPanel>
      {builderAgreed && milestone ? <PtNote>The builder must accept changes to amount or dates before they apply.</PtNote> : null}

      <PtDateSheet
        visible={dateOpen}
        title="Due"
        value={due ?? ymdMonthsFromNow(1)}
        minYear={year}
        maxYear={year + 5}
        doneLabel="Done"
        onDone={(ymd) => { setDue(ymd); setDateOpen(false); }}
        onClose={() => setDateOpen(false)}
      />
      <PtSheet
        visible={proofOpen}
        title="Proof needed"
        subtitle="What the builder sends before you release the money."
        onClose={() => setProofOpen(false)}
        footer={<PtButton title="Done" onPress={() => { setProof(proofDraft.trim()); setProofOpen(false); }} />}
      >
        <View style={{ borderRadius: ptRadius.sm, borderWidth: 1.5, borderColor: pt.lineStrong, paddingHorizontal: 14 }}>
          <TextInput value={proofDraft} onChangeText={setProofDraft} placeholder="Photos of every room and a video" placeholderTextColor={pt.inkSubtle} maxLength={200} accessibilityLabel="Proof needed" style={{ height: 52, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }} />
        </View>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
          The project's release rules still apply to every milestone:{' '}
          {[project.setup?.release?.photos !== false ? 'photos' : null, project.setup?.release?.video ? 'a video' : null, project.setup?.release?.receipts ? 'receipts' : null].filter(Boolean).join(', ')} before any payment.
        </Text>
      </PtSheet>
    </PtPageScreen>
  );
}
