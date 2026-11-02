import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAnswerFamilyChange } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { Stat, Tile } from '../../components/savings/CoSaverView';
import { AttentionCard, LoadingBlock, TickRow } from '../../components/project/ProjectUi';
import { ProjectRoleSheet, ViewingAs, shortNaira } from '../../components/project/ProjectRoleViews';
import { formatNaira, formatYmd } from '../../lib/format';
import { dayMonth, namesList, projectRoleLabel, townOf } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { Milestone } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/** "Tiling and plaster · ₦1.9m — Submitted · 1 of 2 approvals · Waiting". */
function lineFor(m: Milestone, first: Milestone | undefined): { sub: string; chip: { label: string; tone: 'warning' | 'neutral' | 'success' | 'danger'; icon: 'clock' | 'circle' | 'check' | 'alert-triangle' } } {
  // VDM-04 "Roof repair · ₦1,440,000 paid · 2 Aug".
  if (m.status === 'released') {
    const paid = Number(m.paid_now ?? m.release_now) + Number(m.advance_paid ?? 0);
    return { sub: `${formatNaira(paid)} paid${m.released_at ? ` · ${dayMonth(m.released_at)}` : ''}`, chip: { label: 'Paid', tone: 'success', icon: 'check' } };
  }
  if (m.dispute && m.dispute.status === 'agreed' && (m.status === 'submitted' || m.status === 'approved')) return { sub: `${formatNaira(m.agreed_refund ?? 0)} refund agreed · waiting for approval`, chip: { label: 'Waiting', tone: 'warning', icon: 'clock' } };
  if (m.dispute) return { sub: m.dispute.status === 'fixing' ? 'Fix agreed · submit new photos' : m.dispute.status === 'agreed' ? 'Refund agreed · submit the work' : `Dispute ${m.dispute.number ?? ''} · on hold`, chip: { label: m.dispute.status === 'fixing' || m.dispute.status === 'agreed' ? 'Agreed' : 'On hold', tone: m.dispute.status === 'fixing' || m.dispute.status === 'agreed' ? 'warning' : 'danger', icon: 'alert-triangle' } };
  if (m.status === 'submitted' || m.status === 'approved') {
    // "Submitted yesterday · Ngozi and Chidi are reviewing".
    const still = (m.approval?.approvers ?? []).filter((a) => !a.said_yes).map((a) => a.first_name);
    const who = still.length ? `${namesList(still)} ${still.length === 1 ? 'is' : 'are'} reviewing` : 'with the family';
    return { sub: `Submitted${m.submitted_at ? ` ${dayMonth(m.submitted_at)}` : ''} · ${m.approval ? `${m.approval.yes} of ${m.approval.required} approvals · ` : ''}${who}`, chip: { label: 'Waiting', tone: 'warning', icon: 'clock' } };
  }
  if (m.status === 'proposed') return { sub: m.proposal?.family_note ? `Changes asked: ${m.proposal.family_note}` : 'Waiting for the family to approve it', chip: { label: 'Proposed', tone: 'neutral', icon: 'circle' } };
  if (m.rejection) return { sub: `Sent back: ${m.rejection}`, chip: { label: 'Fix', tone: 'warning', icon: 'clock' } };
  const next = m === first;
  if (m.status === 'funded') return { sub: `Funded${m.due_date ? ` · due ${dayMonth(m.due_date)}` : ''}${next ? ' · ready to start' : ''}`, chip: { label: next ? 'Next' : 'Later', tone: 'neutral', icon: 'circle' } };
  return { sub: m.starts_on ? `Family funds it by ${dayMonth(m.starts_on)}` : 'Not funded yet', chip: { label: next ? 'Next' : 'Later', tone: 'neutral', icon: 'circle' } };
}

/**
 * PJH-01 the builder's project home (VDM-04): the project wallet and what's
 * set aside, paid / waiting / not funded yet, what's left to do, the family's
 * changes, and Upload proof · Request funds · Add milestone · Invite team ·
 * Project chat · Documents. PJH-03 for someone on the builder's team.
 */
export function VendorProjectScreen({ navigation, route }: RootScreenProps<'VendorProject'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const answer = useAnswerFamilyChange();
  const me = useAuth((s) => s.user);
  const [what, setWhat] = useState(false);
  const d = query.data;

  if (!d) {
    return (
      <PtPageScreen title="Project" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }
  const p = d.project;
  const owner = d.my_role === 'vendor';
  const list = d.milestones.filter((m) => m.status !== 'cancelled');
  const open = list.filter((m) => m.status !== 'released');
  const changes = list.filter((m) => m.change_request?.by === 'family');
  const next = list.find((m) => ['funded', 'planned', 'rejected'].includes(m.status) && (!m.dispute || ['fixing', 'agreed'].includes(m.dispute.status)));
  // "Next" is the first phase not paid or waiting on the family.
  const firstOpen = list.find((m) => !['released', 'submitted', 'approved', 'proposed'].includes(m.status));
  const months = p.setup?.release?.retention_months ?? 3;
  const business = d.people.vendor[0]?.business ?? p.vendor?.name ?? 'the business';
  const manager = d.people.vendor.find((v) => v.role === 'site_manager');
  const waiting = list.filter((m) => m.status === 'submitted' || m.status === 'approved').reduce((t, m) => t + Number(m.release_now) + (m.advance && !m.advance.paid ? Number(m.advance.amount) : 0), 0);
  const notFunded = list.filter((m) => m.status === 'planned').reduce((t, m) => t + Number(m.amount), 0);
  const setAside = list.find((m) => ['funded', 'submitted', 'approved'].includes(m.status));
  const go = (fn: () => void) => () => { selection(); fn(); };
  const reply = (m: Milestone, agree: boolean) => answer.mutate({ milestoneId: m.id, agree }, { onError: (e) => showAlert('Could not save', (e as Error).message) });
  const role = owner ? 'Vendor owner' : `${projectRoleLabel(d.my_role)} · ${business}`;

  return (
    <PtPageScreen
      title={p.title}
      subtitle={owner ? `For the ${p.family ?? 'family'}${p.setup?.location ? ` · ${townOf(p.setup.location)}` : ''}` : `${business} · your job`}
      onBack={() => navigation.goBack()}
      right={
        <Pressable onPress={go(() => navigation.navigate('ProjectMembers', { projectId }))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Members" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="users" size={22} color={pt.ink} />
        </Pressable>
      }
    >
      <ViewingAs role={role} tone="gold" onWhat={() => setWhat(true)} />

      {changes.map((m) => (
        <View key={m.id} style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>The family changed {m.title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
            {[m.change_request?.amount ? `${formatNaira(m.amount)} → ${formatNaira(m.change_request.amount)}` : null, m.change_request?.due_date ? `due ${formatYmd(m.change_request.due_date)}` : null].filter(Boolean).join(' · ')}
          </Text>
          {d.can.submit ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PtButton title="Keep it" variant="secondary" size="sm" style={{ flex: 1, backgroundColor: pt.raised }} onPress={() => reply(m, false)} disabled={answer.isPending} />
              <PtButton title="Accept" size="sm" style={{ flex: 1 }} onPress={() => reply(m, true)} loading={answer.isPending} />
            </View>
          ) : null}
        </View>
      ))}
      {list
        .filter((m) => m.status === 'proposed' && m.proposal?.family_note)
        .map((m) => (
          <AttentionCard key={m.id} tone="info" title={`The family asked for changes on ${m.title}`} sub={m.proposal?.family_note ?? undefined} onPress={d.can.propose ? () => navigation.navigate('ProposeMilestone', { projectId, milestoneId: m.id }) : undefined} />
        ))}

      {d.can.see_money ? (
        <>
          <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 6 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Project wallet</Text>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 32, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(p.in_wallet)}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.onDarkMuted }}>
              {[setAside ? `${formatNaira(Number(setAside.amount) - Number(setAside.advance_paid ?? 0))} set aside for ${setAside.title}` : 'Nothing set aside yet', Number(p.held_back) > 0 ? `${formatNaira(p.held_back)} held back from earlier phases` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label={owner ? 'Paid to you' : 'Paid to the business'} value={formatNaira(p.paid_so_far)} />
            <Stat label="Waiting" value={formatNaira(waiting)} />
            <Stat label="Not funded yet" value={formatNaira(notFunded)} />
          </View>
        </>
      ) : null}

      {owner || d.my_role === 'site_manager' || d.my_role === 'accounts' ? (
        <>
          <PtPanel>
            {list.map((m, i) => {
              const l = lineFor(m, firstOpen);
              return (
                <Pressable
                  key={m.id}
                  onPress={go(() =>
                    m.status === 'released'
                      ? navigation.navigate('VendorProjectFunds', { projectId })
                      : ['funded', 'planned', 'rejected'].includes(m.status) && (d.can.submit || d.can.upload)
                      ? navigation.navigate('SubmitWork', { projectId, milestoneId: m.id })
                      : m.dispute
                        ? navigation.navigate('DisputeDetail', { disputeId: m.dispute.id })
                        : navigation.navigate('VendorProjectFunds', { projectId }),
                  )}
                  accessibilityRole="button"
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{`${m.title} · ${shortNaira(m.amount)}`}</Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{l.sub}</Text>
                    </View>
                    <PtChip label={l.chip.label} tone={l.chip.tone} icon={l.chip.icon} />
                  </View>
                </Pressable>
              );
            })}
          </PtPanel>
          {list.length && !open.length ? <PtNote tone="success">Every milestone is paid. Well done.</PtNote> : null}
        </>
      ) : (
        // PJH-03 "Assigned to you": the next phase's list, and what was submitted.
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Assigned to you</PtGroupLabel>
          {next ? (
            <PtPanel>
              <View style={{ paddingVertical: 12, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{next.title}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                  {`${next.evidence.filter((e) => e.kind !== 'receipt').length} photos so far${next.status === 'planned' ? ' · not funded yet' : ''}`}
                </Text>
              </View>
              {next.deliverables.map((x, i) => (
                <TickRow key={`${x.text}-${i}`} title={x.text} sub={x.done ? 'Done' : 'To do'} checked={x.done} last={i === next.deliverables.length - 1} />
              ))}
            </PtPanel>
          ) : null}
          {list.filter((m) => m.status === 'submitted' || m.status === 'approved').map((m) => (
            <PtPanel key={m.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{m.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                    {`${m.evidence.filter((e) => e.kind !== 'receipt').length} photos used · waiting for the family`}
                  </Text>
                </View>
                <PtChip label="Submitted" tone="success" icon="check" />
              </View>
            </PtPanel>
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        {owner ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tile icon="camera" label="Upload proof" disabled={!next} why="Every phase is submitted or paid." onPress={() => next && navigation.navigate('SubmitWork', { projectId, milestoneId: next.id })} />
              <Tile icon="unlock" label="Request funds" onPress={() => navigation.navigate('VendorProjectFunds', { projectId })} />
              <Tile icon="plus" label="Add milestone" disabled={!d.can.propose} why="You can add milestones once you've accepted the project." onPress={() => navigation.navigate('ProposeMilestone', { projectId })} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tile icon="users" label="Invite team" onPress={() => navigation.navigate('VendorTeam')} />
              <Tile icon="message-square" label="Project chat" disabled={!d.can.chat} why="The project chat isn't open to you." onPress={() => navigation.navigate('ProjectChat', { projectId })} />
              <Tile icon="file" label="Documents" onPress={() => navigation.navigate('ProjectDocuments', { projectId })} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tile icon="camera" label="Upload photos" disabled={!next || !d.can.upload} why={!d.can.upload ? 'Your role here is view only.' : 'Nothing to photograph right now.'} onPress={() => next && navigation.navigate('SubmitWork', { projectId, milestoneId: next.id })} />
              <Tile icon="message-square" label="Project chat" disabled={!d.can.chat} why="The project chat isn't open to you." onPress={() => navigation.navigate('ProjectChat', { projectId })} />
              <Tile icon="map-pin" label="Site address" disabled={!p.setup?.location} why="The family hasn't added the address." onPress={() => showAlert('Site address', p.setup?.location ?? '')} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Tile icon="lock" label="Money" disabled={!d.can.see_money} why={`Only ${p.vendor?.person?.split(' ')[0] ?? 'the owner'} and accounts see the money.`} onPress={() => navigation.navigate('VendorProjectFunds', { projectId })} />
              <Tile icon="send" label="Submit for payment" disabled={!d.can.submit || !next} why={`${manager ? `${manager.first_name}, your site manager,` : 'Your site manager'} checks your photos and submits for payment.`} onPress={() => next && navigation.navigate('SubmitWork', { projectId, milestoneId: next.id })} />
              <Tile icon="user-plus" label="Invite people" disabled why={`Only ${p.vendor?.person?.split(' ')[0] ?? 'the owner'} adds people to the team.`} />
            </View>
          </>
        )}
      </View>

      <PtNote>
        {owner || d.my_role === 'accounts'
          ? `You're paid within minutes of the family approving.${Number(p.held_back) > 0 || p.setup?.release?.retention_percent ? ` Held-back money is released ${months} month${months === 1 ? '' : 's'} after handover.` : ''}`
          : d.my_role === 'foreman'
            ? `${manager ? `${manager.first_name}, your site manager,` : 'Your site manager'} checks your photos and submits the milestone for payment.`
            : 'You check the team\'s photos and submit each milestone for payment.'}
      </PtNote>

      <ProjectRoleSheet
        visible={what}
        title={owner ? "You're the vendor owner" : `You're the ${projectRoleLabel(d.my_role).toLowerCase()}`}
        owner={owner ? `${p.family ?? 'The family'}` : p.vendor?.person?.split(' ')[0] ?? 'The owner'}
        can={
          owner
            ? ['Upload proof and submit milestones', 'Ask for materials money with a milestone', 'Add milestones for the family to approve', 'Invite your team', 'Chat with the family']
            : d.my_role === 'site_manager'
              ? ['Upload photos', 'Submit milestones for payment', 'Add milestones', 'Chat with the family']
              : d.my_role === 'accounts'
                ? ['See payouts and what\'s waiting', 'See documents']
                : ['Upload photos and tick what\'s done', 'Chat in the project']
        }
        cannot={owner ? ['Approve your own payments', "Add family members — they invite their own people"] : ['Withdraw money', 'Invite people', ...(d.my_role === 'foreman' ? ['Submit for payment'] : [])]}
        onClose={() => setWhat(false)}
      />
    </PtPageScreen>
  );
}
