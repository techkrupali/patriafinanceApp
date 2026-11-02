import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAddEvidence, useRemoveEvidence, useSubmitWork, useTickDeliverables } from '../../api/projectFlow';
import { ApiError } from '../../api/client';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { FileRow, LoadingBlock, PhotoGrid, TextArea, TickRow } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { pickFile } from '../../lib/upload';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/**
 * VDM-05 / VDM-12 "Finish a phase": what approving releases, photos and a
 * video, receipts if the family asked for them, what's done ticked, a note,
 * and "Ask for Painting materials money now" — "Submit and request ₦2,070,000".
 * A foreman adds photos and ticks; a site manager or the owner submits.
 */
export function SubmitWorkScreen({ navigation, route }: RootScreenProps<'SubmitWork'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const add = useAddEvidence();
  const remove = useRemoveEvidence();
  const tick = useTickDeliverables();
  const submit = useSubmitWork();
  const [done, setDone] = useState<boolean[]>([]);
  const [note, setNote] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState<'photo' | 'receipt' | null>(null);
  const [advance, setAdvance] = useState(false);
  const [percent, setPercent] = useState(30);
  const m = query.data?.milestones.find((x) => x.id === milestoneId);

  useEffect(() => {
    if (m) setDone(m.deliverables.map((x) => x.done));
    // Only when the milestone first loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  if (!query.data || !m) {
    return (
      <PtPageScreen title="Submit" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const d = query.data;
  const release = d.project.setup?.release;
  const photos = m.evidence.filter((e) => e.kind !== 'receipt');
  const receipts = m.evidence.filter((e) => e.kind === 'receipt');
  const editable = ['planned', 'funded', 'rejected'].includes(m.status);
  const needs = [release?.photos !== false ? 'photos' : null, release?.video ? 'a short video' : null, release?.receipts ? 'receipts' : null].filter(Boolean) as string[];
  // VDM-12: the next phase, for materials money now.
  const next = d.milestones.filter((x) => x.sequence > m.sequence && (x.status === 'planned' || x.status === 'funded')).sort((a, b) => a.sequence - b.sequence)[0];
  const advanceAmount = next ? Math.floor((Number(next.amount) * percent) / 100) : 0;
  const asking = Number(m.release_now) + (advance ? advanceAmount : 0);
  const missing = (release?.photos !== false && !photos.some((e) => e.kind === 'image')) || (release?.video && !photos.some((e) => e.kind === 'video')) || (release?.receipts && receipts.length === 0);

  const upload = async (receipt: boolean) => {
    const asset = await pickFile('library', receipt ? 'images' : 'media');
    if (!asset) return;
    setAdding(receipt ? 'receipt' : 'photo');
    add.mutate(
      { milestoneId, asset, receipt, caption: label.trim() || undefined },
      {
        onSuccess: () => setLabel(''),
        onError: (e) => showAlert('Could not upload', (e as Error).message),
        onSettled: () => setAdding(null),
      },
    );
  };

  const send = () => {
    submit.mutate(
      { milestoneId, note: note.trim() || undefined, done, advance_percent: advance && next ? percent : undefined },
      {
        onSuccess: () => {
          showAlert('Submitted', `${d.project.family ? `The ${d.project.family}` : 'The family'} will check the photos. You're paid within minutes of their approval.`);
          navigation.goBack();
        },
        onError: (e) => {
          const err = e as ApiError;
          showAlert('Not submitted yet', err.errors ? Object.values(err.errors)[0]?.[0] ?? err.message : err.message);
        },
      },
    );
  };

  return (
    <PtPageScreen
      title={d.can.submit && editable ? 'Finish a phase' : `Submit: ${m.title}`}
      subtitle={d.project.title}
      onBack={() => navigation.goBack()}
      footer={
        !editable ? null : d.can.submit ? (
          <PtButton title={`Submit and request ${formatNaira(asking)}`} onPress={send} loading={submit.isPending} disabled={Boolean(missing)} />
        ) : (
          <PtButton
            title="Save ticks"
            loading={tick.isPending}
            onPress={() => tick.mutate({ milestoneId, done }, { onSuccess: () => navigation.goBack(), onError: (e) => showAlert('Could not save', (e as Error).message) })}
          />
        )
      }
    >
      {d.can.submit && editable ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{`${m.title} · ${formatNaira(m.amount)}`}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
            {`Approving it releases ${formatNaira(m.release_now)}${Number(m.hold_back) > 0 ? ` (${formatNaira(m.hold_back)} held back)` : ''}${next ? ` and lets you start ${next.title} (${formatNaira(next.amount)})` : ''}`}
          </Text>
        </View>
      ) : null}
      {m.rejection ? <PtNote tone="attention">{`The family asked for changes: ${m.rejection}`}</PtNote> : null}
      {m.dispute?.status === 'fixing' ? <PtNote tone="attention">The fix is agreed. Add new photos of the fixed work and submit again.</PtNote> : null}
      {m.agreed_refund ? <PtNote tone="info">{`The family accepted your ${formatNaira(m.agreed_refund)} refund. You're paid the rest once they approve.`}</PtNote> : null}
      {!editable ? <PtNote>{m.status === 'released' ? 'This milestone has been paid.' : 'Submitted. The family is reviewing it.'}</PtNote> : null}
      {needs.length && editable ? <PtNote>{`The family asked for ${needs.join(', ').replace(/, ([^,]*)$/, ' and $1')} before they release the money.`}</PtNote> : null}

      <PtGroupLabel>Photos and video</PtGroupLabel>
      <PhotoGrid
        photos={photos.map((e) => ({ key: e.id, url: e.url, caption: e.caption, video: e.kind === 'video' }))}
        onAdd={editable && d.can.upload ? () => void upload(false) : undefined}
        onRemove={editable && d.can.upload ? (k) => remove.mutate({ milestoneId, evidenceId: Number(k) }) : undefined}
        adding={adding === 'photo'}
      />
      {editable && d.can.upload ? <PtField label="Label for the next photo (optional)" value={label} onChangeText={setLabel} placeholder="Kitchen floor" maxLength={60} /> : null}

      {release?.receipts || receipts.length ? (
        <>
          <PtGroupLabel>Receipts</PtGroupLabel>
          <PtPanel>
            {receipts.map((r, i) => (
              <FileRow key={r.id} title={r.caption || `Receipt ${i + 1}`} sub="Receipt" last={i === receipts.length - 1 && !editable} />
            ))}
            {editable && d.can.upload ? <FileRow title={adding === 'receipt' ? 'Uploading…' : 'Add a receipt'} sub="A photo of the receipt for materials" icon="plus" onPress={() => void upload(true)} last /> : null}
          </PtPanel>
        </>
      ) : null}

      {m.deliverables.length ? (
        <PtPanel>
          {m.deliverables.map((x, i) => (
            <TickRow key={`${x.text}-${i}`} title={x.text} checked={Boolean(done[i])} onToggle={editable ? () => setDone((prev) => prev.map((v, j) => (j === i ? !v : v))) : undefined} last={i === m.deliverables.length - 1} />
          ))}
        </PtPanel>
      ) : null}

      {d.can.submit && editable && next ? (
        <PtPanel>
          <PtSwitchRow
            title={`Ask for ${next.title} materials money now`}
            subtitle={`${percent}% of ${next.title}, ${formatNaira(advanceAmount)}, paid ${next.status === 'funded' ? 'with this approval' : `once the family funds ${next.title}`}`}
            value={advance}
            onChange={setAdvance}
          />
          {advance ? (
            <View style={{ paddingBottom: 12 }}>
              <PtPills options={[10, 20, 30, 40, 50].map((v) => ({ value: v, label: `${v}%` }))} value={percent} onChange={(v) => setPercent(Number(v))} />
            </View>
          ) : null}
        </PtPanel>
      ) : null}

      {d.can.submit && editable ? <TextArea label="Note for the family" value={note} onChange={setNote} placeholder="All floors tiled with the 60x60 ceramic tiles we agreed." maxLength={2000} /> : null}
    </PtPageScreen>
  );
}
