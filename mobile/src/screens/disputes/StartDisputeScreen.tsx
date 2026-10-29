import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import { pt, ptFont } from '../../theme';
import { api } from '../../api/client';
import { keys, useActivity, useProjects } from '../../api/hooks';
import { useOpenDispute } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPills } from '../../components/pt/PtForm';
import { PtRow } from '../../components/pt/PtList';
import { PtSheet } from '../../components/pt/PtSheet';
import { FileRow, PhotoGrid, TextArea } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { DISPUTE_REASONS, DISPUTE_REMEDIES, dayMonth } from '../../lib/projects';
import { pickFile, type PickedFile } from '../../lib/upload';
import type { DisputeReason, DisputeRemedy, Milestone, ProjectDetailData, Transaction } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

type Kind = 'milestone' | 'payment_made' | 'payment_received';

/** Milestones a family can dispute: with a builder, not paid yet, no dispute open. */
function disputable(m: Milestone): boolean {
  return ['funded', 'planned', 'submitted', 'approved', 'rejected'].includes(m.status) && !m.dispute;
}

/**
 * DSP-02…04 Start a dispute: what it's about (a milestone, a payment made or
 * received), what's wrong and what would make it right, then photos.
 */
export function StartDisputeScreen({ navigation, route }: RootScreenProps<'StartDispute'>) {
  const preset = route.params?.milestoneId;
  const projects = useProjects();
  const activity = useActivity();
  const open = useOpenDispute();

  // Projects where this person speaks for the family and a builder is on board.
  const familyProjects = (projects.data ?? []).filter((p) => (p.my_role === 'owner' || p.my_role === 'co_owner') && p.vendor && p.status === 'active');
  const details = useQueries({
    queries: familyProjects.map((p) => ({ queryKey: keys.project(p.id), queryFn: () => api<ProjectDetailData>(`/projects/${p.id}`) })),
  });
  const milestones = useMemo(
    () => details.flatMap((q) => (q.data ? q.data.milestones.filter(disputable).map((m) => ({ m, project: q.data.project })) : [])),
    [details],
  );

  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind>('milestone');
  const [milestoneId, setMilestoneId] = useState<number | null>(preset ?? null);
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [remedy, setRemedy] = useState<DisputeRemedy | null>(null);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [picker, setPicker] = useState<'milestone' | 'txn' | null>(null);

  const chosen = milestones.find((x) => x.m.id === (milestoneId ?? milestones[0]?.m.id));
  const txns = (activity.transactions ?? []).filter((t) => (kind === 'payment_received' ? t.direction === 'credit' : t.direction === 'debit')).slice(0, 40);

  const step1Ok = kind === 'milestone' ? Boolean(chosen) : Boolean(txn);
  const step2Ok = Boolean(reason) && description.trim().length > 0 && (kind !== 'milestone' || Boolean(remedy));

  const addPhoto = async (source: 'camera' | 'library') => {
    const f = await pickFile(source, 'media');
    if (f) setFiles((prev) => [...prev, f].slice(0, 6));
  };

  const submit = () => {
    open.mutate(
      {
        kind,
        milestone_id: kind === 'milestone' ? chosen?.m.id : undefined,
        reference: kind !== 'milestone' ? txn?.reference : undefined,
        reason: reason!,
        remedy: kind === 'milestone' ? remedy ?? undefined : undefined,
        description: description.trim(),
        files,
      },
      {
        onSuccess: (d) => navigation.replace('DisputeDetail', { disputeId: d.id }),
        onError: (e) => showAlert('Could not open the dispute', (e as Error).message),
      },
    );
  };

  const back = () => (step > 1 ? setStep(step - 1) : navigation.goBack());
  const footer =
    step < 3 ? (
      <PtButton title="Continue" disabled={step === 1 ? !step1Ok : !step2Ok} onPress={() => setStep(step + 1)} />
    ) : (
      <PtButton title="Open dispute" onPress={submit} loading={open.isPending} />
    );

  return (
    <PtPageScreen title="Start a dispute" subtitle={`Step ${step} of 3`} onBack={back} footer={footer}>
      {step === 1 ? (
        <>
          <PtText variant="headline">What is it about?</PtText>
          <PtChoiceCard
            icon="home"
            title="A project milestone"
            subtitle={chosen ? `${chosen.m.title} · ${formatNaira(chosen.m.amount)}` : details.some((d) => d.isLoading) ? 'Loading your milestones…' : 'No milestone can be disputed now'}
            selected={kind === 'milestone'}
            onPress={() => {
              setKind('milestone');
              if (milestones.length > 1) setPicker('milestone');
            }}
          />
          <PtChoiceCard
            icon="list"
            title="A payment I made"
            subtitle={kind === 'payment_made' && txn ? `${txn.description ?? 'Payment'} · ${formatNaira(txn.amount)} · ${dayMonth(txn.created_at)}` : 'Pick from your transactions'}
            selected={kind === 'payment_made'}
            onPress={() => { setKind('payment_made'); setTxn(null); setPicker('txn'); }}
          />
          <PtChoiceCard
            icon="arrow-down"
            title="A payment I received"
            subtitle={kind === 'payment_received' && txn ? `${txn.description ?? 'Money in'} · ${formatNaira(txn.amount)} · ${dayMonth(txn.created_at)}` : 'Something wrong with money in'}
            selected={kind === 'payment_received'}
            onPress={() => { setKind('payment_received'); setTxn(null); setPicker('txn'); }}
          />
          <PtNote icon="lock">{kind === 'milestone' ? 'Opening a dispute puts the milestone payment on hold until it is sorted.' : 'Patriai looks into payment disputes and replies within 5 working days.'}</PtNote>
        </>
      ) : step === 2 ? (
        <>
          <PtText variant="headline">What's wrong?</PtText>
          <PtPills options={DISPUTE_REASONS} value={reason} onChange={setReason} />
          <TextArea label="Tell us what happened" value={description} onChange={setDescription} placeholder="Kitchen floor tiles are uneven and two are cracked near the sink." maxLength={2000} />
          {kind === 'milestone' ? (
            <>
              <PtGroupLabel>What would make it right?</PtGroupLabel>
              <PtPills options={DISPUTE_REMEDIES} value={remedy} onChange={setRemedy} />
            </>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <PtText variant="headline">Add evidence</PtText>
            <PtText color={pt.inkMuted}>Clear photos help us decide quickly.</PtText>
          </View>
          <PhotoGrid
            photos={files.map((f, i) => ({ key: i, url: f.uri, video: f.mimeType?.startsWith('video') }))}
            onAdd={files.length < 6 ? () => void addPhoto('library') : undefined}
            onRemove={(k) => setFiles((prev) => prev.filter((_, i) => i !== k))}
          />
          <View style={{ backgroundColor: pt.raised, borderRadius: 18, paddingHorizontal: 16 }}>
            <FileRow title="Take a photo" sub="Use the camera now" icon="camera" onPress={() => void addPhoto('camera')} />
            <FileRow title="Add a document" sub="A photo of the contract, receipt or quote" icon="file" onPress={() => void addPhoto('library')} last />
          </View>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
            {files.length ? `${files.length} file${files.length === 1 ? '' : 's'} added.` : 'You can also add evidence after opening it.'}
          </Text>
        </>
      )}

      <PtSheet visible={picker === 'milestone'} title="Which milestone?" onClose={() => setPicker(null)}>
        <View>
          {milestones.map(({ m, project }, i) => (
            <PtRow key={m.id} title={m.title} subtitle={`${project.title} · ${formatNaira(m.amount)}`} chevron onPress={() => { setMilestoneId(m.id); setPicker(null); }} last={i === milestones.length - 1} />
          ))}
        </View>
      </PtSheet>
      <PtSheet visible={picker === 'txn'} title={kind === 'payment_received' ? 'Which money in?' : 'Which payment?'} onClose={() => setPicker(null)}>
        <View>
          {txns.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 12 }}>{activity.isLoading ? 'Loading…' : 'No transactions to pick from.'}</Text>
          ) : (
            txns.map((t, i) => (
              <PtRow key={t.id} title={t.description ?? 'Transaction'} subtitle={`${dayMonth(t.created_at)} · ${t.reference}`} right={formatNaira(t.amount)} onPress={() => { setTxn(t); setPicker(null); }} last={i === txns.length - 1} />
            ))
          )}
        </View>
      </PtSheet>
    </PtPageScreen>
  );
}
