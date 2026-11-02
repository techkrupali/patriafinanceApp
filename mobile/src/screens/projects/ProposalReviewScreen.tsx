import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useDeclineProposal, useProposal } from '../../api/proposals';
import { useStartDirect } from '../../api/chats';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { FileRow, LoadingBlock, TextArea } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * VPJ-05 Family: review proposal — from whom, what, the total, phases with
 * when each is released, the quote and drawings — Accept and set up, ask for
 * changes in chat, or decline. The builder sees the same, read only.
 */
export function ProposalReviewScreen({ navigation, route }: RootScreenProps<'ProposalReview'>) {
  const { proposalId } = route.params;
  const q = useProposal(proposalId);
  const decline = useDeclineProposal(proposalId);
  const chat = useStartDirect();
  const [files, setFiles] = useState(false);
  const [saying, setSaying] = useState(false);
  const [note, setNote] = useState('');
  const p = q.data;

  if (!p) {
    return (
      <PtPageScreen title="Proposal" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const business = p.vendor.business ?? p.vendor.name ?? 'The builder';
  const talk = () =>
    chat.mutate(p.mine ? p.family?.id ?? 0 : p.vendor.id, {
      onSuccess: (r) => navigation.navigate('Conversation', { conversationId: r.chat.id }),
      onError: (e) => showAlert('Chat not opened', (e as Error).message),
    });

  return (
    <PtPageScreen
      title={p.status === 'sent' && !p.mine ? 'New proposal' : 'Proposal'}
      subtitle={p.mine ? `To ${p.family?.name ?? p.invite_phone ?? 'the family'}` : `From ${business}`}
      onBack={() => navigation.goBack()}
      footer={
        p.can_answer ? (
          <>
            <PtButton title="Accept and set up" onPress={() => navigation.navigate('ProposalFund', { proposalId })} />
            <PtButton title="Ask for changes in chat" variant="ghost" loading={chat.isPending} onPress={talk} />
          </>
        ) : p.status === 'accepted' && p.project_id ? (
          <PtButton title="Open the project" onPress={() => navigation.navigate('ProjectDetail', { projectId: p.project_id! })} />
        ) : p.family ? (
          <PtButton title={p.mine ? `Chat with ${p.family.first_name}` : `Chat with ${business}`} variant="secondary" loading={chat.isPending} onPress={talk} />
        ) : null
      }
    >
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 6 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{[p.title, p.location].filter(Boolean).join(' · ')}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 32, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(p.total)}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>
          {[`${p.phases.length} phases`, p.upfront ? `${formatNaira(p.upfront)} upfront` : null, Number(p.held_back) > 0 ? `${p.terms.retention_percent}% held back` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {p.status !== 'sent' ? (
        <View style={{ flexDirection: 'row' }}>
          <PtChip label={p.status === 'accepted' ? 'Accepted · project started' : p.status === 'declined' ? 'Declined' : 'Draft'} tone={p.status === 'accepted' ? 'success' : p.status === 'declined' ? 'danger' : 'neutral'} icon={p.status === 'accepted' ? 'check' : 'circle'} />
        </View>
      ) : null}
      {p.status === 'declined' && p.family_note ? <PtNote tone="attention">{`"${p.family_note}"`}</PtNote> : null}
      <PtPanel>
        {p.phases.map((ph, i) => (
          <PtReviewRow
            key={i}
            label={`${i + 1}. ${ph.title} · ${ph.percent}%`}
            value={formatNaira(ph.amount)}
            sub={i === 0 && p.terms.upfront ? 'Released when the family accepts' : i === 0 ? 'Paid when its proof is approved' : `Unlocked after ${p.phases[i - 1].title.toLowerCase()} is approved${ph.proof ? ` · proof: ${ph.proof}` : ''}`}
            last={i === p.phases.length - 1}
          />
        ))}
      </PtPanel>
      <PtPanel>
        <PtReviewRow label="Quote" value={p.lines.map((l) => `${l.label} ${formatNaira(l.amount)}`).join(' · ')} />
        <PtReviewRow
          label="Quote and drawings"
          value={p.documents.length ? `${p.documents.length} file${p.documents.length === 1 ? '' : 's'}` : 'No files'}
          onEdit={p.documents.length ? () => setFiles(true) : undefined}
        />
        <PtReviewRow label="Start" value={`Within ${p.terms.start_within_days} days of funding`} sub={Number(p.held_back) > 0 ? `${formatNaira(p.held_back)} held back until ${p.terms.retention_months} months after handover` : null} last={!p.scope} />
        {p.scope ? <PtReviewRow label="Scope of work" value={p.scope} last /> : null}
      </PtPanel>
      {p.can_answer ? <PtButton title="Decline" variant="ghost" onPress={() => setSaying(true)} /> : null}

      <PtSheet visible={files} title="Quote and drawings" onClose={() => setFiles(false)}>
        <PtPanel>
          {p.documents.map((d, i) => (
            <FileRow key={i} title={d.name} sub={d.kind === 'quote' ? 'Quote' : d.kind === 'drawing' ? 'Drawing' : 'File'} onPress={() => void Linking.openURL(d.url)} last={i === p.documents.length - 1} />
          ))}
        </PtPanel>
      </PtSheet>
      <PtSheet
        visible={saying}
        title="Decline this proposal?"
        subtitle={`${business} will see your note.`}
        onClose={() => setSaying(false)}
        footer={<PtButton title="Decline" loading={decline.isPending} onPress={() => decline.mutate(note.trim() || undefined, { onSuccess: () => { setSaying(false); navigation.goBack(); }, onError: (e) => showAlert('Not declined', (e as Error).message) })} />}
      >
        <TextArea label="A note (optional)" value={note} onChange={setNote} placeholder="Not this year" maxLength={500} />
      </PtSheet>
    </PtPageScreen>
  );
}
