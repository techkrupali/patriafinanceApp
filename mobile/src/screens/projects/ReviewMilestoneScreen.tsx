import React, { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAddEvidence, useMilestoneViewed, useSendBack } from '../../api/projectFlow';
import { pickFile } from '../../lib/upload';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { FileRow, LoadingBlock, PhotoGrid, TextArea, TickRow } from '../../components/project/ProjectUi';
import { formatNaira, initials } from '../../lib/format';
import { namesList, relativeDay } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * PRJ-06 Review submission: the photos, the builder's note, receipts, what they
 * ticked, who approves and what's paid now — then "Approve and release" or
 * "Something isn't right" (ask for changes, or open a dispute).
 */
export function ReviewMilestoneScreen({ navigation, route }: RootScreenProps<'ReviewMilestone'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const me = useAuth((s) => s.user);
  const sendBack = useSendBack();
  const viewed = useMilestoneViewed();
  const addPhoto = useAddEvidence();
  const [problemOpen, setProblemOpen] = useState(false);
  const [note, setNote] = useState('');
  const m = query.data?.milestones.find((x) => x.id === milestoneId);
  const p = query.data?.project;
  const amApprover = Boolean(m?.approval?.approvers.some((a) => a.id === me?.id));

  // MLS-02 "viewed 11:15 am".
  useEffect(() => {
    if (amApprover && m && (m.status === 'submitted' || m.status === 'approved')) viewed.mutate(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amApprover, m?.id, m?.status]);

  if (!query.data || !m || !p) {
    return (
      <PtPageScreen title="Review" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : query.data ? 'This milestone is no longer here.' : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const photos = m.evidence.filter((e) => e.kind !== 'receipt');
  const sitePhoto = async () => {
    // A photo taken on site; on the web, picked from the computer.
    const asset = await pickFile(Platform.OS === 'web' ? 'library' : 'camera');
    if (!asset) return;
    addPhoto.mutate({ milestoneId: m.id, asset, siteVisit: true, caption: 'Site visit' }, { onError: (e) => showAlert('Not added', (e as Error).message) });
  };
  const receipts = m.evidence.filter((e) => e.kind === 'receipt');
  const videos = photos.filter((e) => e.kind === 'video').length;
  const approvers = m.approval?.approvers ?? p.approvers.map((a) => ({ ...a, said_yes: false, asked_at: null }));
  const iSaidYes = Boolean(m.approval?.approvers.find((a) => a.id === me?.id)?.said_yes);
  const onHold = m.dispute && !['fixing', 'agreed'].includes(m.dispute.status);
  const reviewable = (m.status === 'submitted' || m.status === 'approved') && query.data.can.approve;
  const required = m.approval?.required ?? (approvers.length > 1 && p.setup?.release?.approvers !== 'owner' ? approvers.length : 1);
  const counts = [receipts.length ? `${receipts.length} receipt${receipts.length === 1 ? '' : 's'}` : null, videos ? `${videos} video${videos === 1 ? '' : 's'}` : null, `${photos.length - videos} photo${photos.length - videos === 1 ? '' : 's'}`].filter(Boolean).join(' · ');

  const askForChanges = () => {
    sendBack.mutate(
      { milestoneId: m.id, note: note.trim() },
      {
        onSuccess: () => {
          setProblemOpen(false);
          showAlert('Sent back', `${p.vendor?.name ?? 'The builder'} will fix it and submit again. Nothing was paid.`);
          navigation.goBack();
        },
        onError: (e) => showAlert('Could not send', (e as Error).message),
      },
    );
  };

  return (
    <PtPageScreen
      title={m.title}
      subtitle={`Submitted by ${p.vendor?.name ?? m.submitted_by ?? 'the builder'}${m.submitted_at ? ` · ${relativeDay(m.submitted_at)}` : ''}`}
      onBack={() => navigation.goBack()}
      footer={
        reviewable && !onHold ? (
          <>
            {m.approval?.site_photo_needed && amApprover ? (
              <PtButton title="Add your site visit photo" loading={addPhoto.isPending} onPress={() => void sitePhoto()} />
            ) : (
              <PtButton
                title={iSaidYes ? "See who's approved" : 'Approve and release'}
                variant={iSaidYes ? 'secondary' : 'primary'}
                onPress={() => navigation.navigate(iSaidYes ? 'MilestoneApprovals' : 'ReleasePayment', { projectId, milestoneId })}
              />
            )}
            <Pressable onPress={() => { selection(); setProblemOpen(true); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Something isn't right</Text>
            </Pressable>
          </>
        ) : onHold ? (
          <PtButton title={`See dispute ${m.dispute?.number ?? ''}`} onPress={() => navigation.navigate('DisputeDetail', { disputeId: m.dispute!.id })} />
        ) : null
      }
    >
      {photos.length ? (
        <PhotoGrid photos={photos.map((e) => ({ key: e.id, url: e.url, caption: e.caption, video: e.kind === 'video' }))} onOpen={(index) => navigation.navigate('ProofViewer', { projectId, milestoneId, index })} />
      ) : (
        <PtNote tone="attention">No photos were added to this submission.</PtNote>
      )}

      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PtAvatar initials={initials(m.submitted_by ?? p.vendor?.person ?? '?')} tone="gold" size={32} />
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{m.submitted_by ?? p.vendor?.person}</Text>
        </View>
        {m.proof ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>"{m.proof}"</Text> : null}
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{counts}</Text>
      </View>

      {receipts.length ? (
        <PtPanel>
          {receipts.map((r, i) => (
            <FileRow key={r.id} icon="file-text" title={r.caption || `Receipt ${i + 1}`} sub="Receipt" onPress={() => void Linking.openURL(r.url)} last={i === receipts.length - 1} />
          ))}
        </PtPanel>
      ) : null}

      {m.deliverables.length ? (
        <PtPanel>
          {m.deliverables.map((d, i) => (
            <TickRow key={`${d.text}-${i}`} title={d.text} sub={d.done ? 'Builder ticked' : 'Not ticked'} checked={d.done} last={i === m.deliverables.length - 1} />
          ))}
        </PtPanel>
      ) : null}

      <PtPanel>
        <PtReviewRow
          label="Approvals"
          value={`${m.approval?.yes ?? 0} of ${required} · ${namesList(approvers.map((a) => a.first_name))}`}
          sub={m.approval?.approvers.filter((a) => !a.said_yes).length && m.status === 'approved' ? `Waiting for ${namesList(m.approval.approvers.filter((a) => !a.said_yes).map((a) => a.first_name))}` : null}
          onEdit={() => navigation.navigate('MilestoneApprovals', { projectId, milestoneId })}
        />
        <PtReviewRow
          label={required > 1 ? (required < approvers.length ? `If ${required} of you approve` : required === 2 ? 'If you both approve' : 'If you all approve') : 'When you approve'}
          value={Number(m.hold_back) > 0 ? `${formatNaira(m.release_now)} now, ${formatNaira(m.hold_back)} held back` : `${formatNaira(m.release_now)} now`}
          last
        />
      </PtPanel>
      {onHold ? <PtNote tone="attention">{`This payment is on hold while dispute ${m.dispute?.number ?? ''} is open.`}</PtNote> : null}
      {m.agreed_refund ? <PtNote tone="info">{`You agreed a ${formatNaira(m.agreed_refund)} refund in dispute ${m.dispute?.number ?? ''}. It stays in the project wallet; approving pays the rest.`}</PtNote> : null}
      {m.approval?.site_photo_needed ? <PtNote tone="attention">{`This milestone is over the site-visit limit. An approver adds their own photo from the site before the money goes.`}</PtNote> : null}
      {m.advance ? (
        <PtNote tone="info">
          {`${p.vendor?.name ?? 'The builder'} also asked for ${formatNaira(m.advance.amount)} of ${m.advance.title ?? 'the next phase'} for materials (${m.advance.percent}%). ${query.data.milestones.find((x) => x.id === m.advance!.milestone_id)?.status === 'funded' ? "It's paid with this approval and comes off that phase." : "It's paid once that phase is funded, and comes off it."}`}
        </PtNote>
      ) : null}

      <PtSheet
        visible={problemOpen}
        title="Something isn't right?"
        subtitle="Ask the builder to fix it, or open a dispute if you can't agree."
        onClose={() => setProblemOpen(false)}
        footer={
          <>
            <PtButton title="Ask for changes" onPress={askForChanges} disabled={!note.trim()} loading={sendBack.isPending} />
            <PtButton
              title="Open a dispute"
              variant="ghost"
              onPress={() => {
                setProblemOpen(false);
                navigation.navigate('StartDispute', { milestoneId: m.id });
              }}
            />
          </>
        }
      >
        <TextArea label="What needs fixing?" value={note} onChange={setNote} placeholder="The kitchen floor isn't level near the sink." maxLength={500} />
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Nothing is paid. The builder fixes it and submits new photos.</Text>
      </PtSheet>
    </PtPageScreen>
  );
}
