import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useAuth } from '../../store/auth';
import { PtRing } from '../pt/PtRing';
import { PtChip, type PtChipTone } from '../pt/PtChip';
import { PtPanel } from '../pt/PtForm';
import { PtSheet } from '../pt/PtSheet';
import { PtButton } from '../pt/PtButton';
import { PtGroupLabel } from '../pt/PtForm';
import { Stat, Tile } from '../savings/CoSaverView';
import { AttentionCard } from './ProjectUi';
import { formatNaira, initials } from '../../lib/format';
import { dayMonth, namesList } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { Milestone, ProjectDetailData } from '../../api/types';

type Go = (screen: string, params?: object) => void;

/** PJH-04 "₦1.6m", "₦700k". */
export function shortNaira(value: string | number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `₦${(Math.round(n / 100_000) / 10).toString()}m`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return formatNaira(n);
}

/** "You're viewing as Chidi · Contributor and approver · What can I do?" */
export function ViewingAs({ role, tone = 'mint', onWhat }: { role: string; tone?: 'mint' | 'gold'; onWhat: () => void }) {
  const me = useAuth((s) => s.user);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tone === 'gold' ? pt.gold500 : pt.emerald300, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.emerald900 }}>{initials(`${me?.first_name ?? ''} ${me?.last_name ?? ''}`)}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, lineHeight: 20, color: pt.ink }}>
        {"You're viewing as "}
        <Text style={{ fontFamily: ptFont.bold }}>{me?.first_name}</Text>
        {` · ${role}`}
      </Text>
      <Pressable onPress={() => { selection(); onWhat(); }} accessibilityRole="button" hitSlop={8}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>What can I do?</Text>
      </Pressable>
    </View>
  );
}

/** WPV-09 for a project: what this role can and can't do. */
export function ProjectRoleSheet({ visible, title, can, cannot, owner, onClose }: { visible: boolean; title: string; can: string[]; cannot: string[]; owner: string; onClose: () => void }) {
  const line = (text: string, ok: boolean, last: boolean) => (
    <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <Feather name={ok ? 'check' : 'x'} size={20} color={ok ? pt.brand : pt.inkMuted} />
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 16, color: ok ? pt.ink : pt.inkMuted }}>{text}</Text>
    </View>
  );
  return (
    <PtSheet visible={visible} title={title} subtitle={`${owner} set this when inviting you.`} onClose={onClose} footer={<PtButton title="Got it" variant="secondary" onPress={onClose} />}>
      <View style={{ gap: 6 }}>
        <PtGroupLabel>You can</PtGroupLabel>
        <View style={{ paddingHorizontal: 12 }}>{can.map((t, i) => line(t, true, i === can.length - 1))}</View>
        <PtGroupLabel>Not you</PtGroupLabel>
        <View style={{ paddingHorizontal: 12 }}>{cannot.map((t, i) => line(t, false, i === cannot.length - 1))}</View>
      </View>
    </PtSheet>
  );
}

/** One milestone line: "Roof repair · Approved by you and Ngozi · Paid". */
export function MilestoneLines({ data, myId, onOpen, short = false }: { data: ProjectDetailData; myId?: number; onOpen: (m: Milestone) => void; short?: boolean }) {
  const ms = data.milestones.filter((m) => !['cancelled', 'proposed'].includes(m.status));
  // "Next" is the first phase not paid or waiting; the rest are "Later".
  const firstOpen = ms.find((m) => !['released', 'submitted', 'approved'].includes(m.status));
  const prevOf = (m: Milestone) => ms[ms.indexOf(m) - 1];
  const line = (m: Milestone): { sub: string; chip: { label: string; tone: PtChipTone; icon: 'check' | 'clock' | 'circle' } } => {
    const a = m.approval;
    if (m.status === 'released') {
      const by = (m.approved_by ?? []).map((x) => (x.id === myId ? 'you' : x.first_name));
      return { sub: short || !by.length ? `Paid ${dayMonth(m.released_at)}` : `Approved by ${namesList(by)}`, chip: { label: 'Paid', tone: 'success', icon: 'check' } };
    }
    if (m.status === 'submitted' || m.status === 'approved') {
      const mine = a?.approvers.find((x) => x.id === myId);
      const yes = (a?.approvers ?? []).filter((x) => x.said_yes).map((x) => x.first_name);
      if (mine && !mine.said_yes && !short) {
        return { sub: yes.length ? `${namesList(yes)} approved · you're next` : 'Submitted · check the proof', chip: { label: 'Your turn', tone: 'warning', icon: 'clock' } };
      }
      return { sub: a ? `${a.yes} of ${a.required} approval${a.required === 1 ? '' : 's'}` : 'Submitted', chip: { label: 'Waiting', tone: 'warning', icon: 'clock' } };
    }
    const next = m === firstOpen;
    if (m.status === 'funded') return { sub: next ? 'Funded · the builder is on it' : `Funded · starts after ${prevOf(m)?.title.toLowerCase() ?? 'the last phase'}`, chip: { label: next ? 'Next' : 'Later', tone: 'neutral', icon: 'circle' } };
    return { sub: 'Not funded yet', chip: { label: next ? 'Next' : 'Later', tone: 'neutral', icon: 'circle' } };
  };
  return (
    <PtPanel>
      {ms.map((m, i) => {
        const l = line(m);
        return (
          <Pressable key={m.id} onPress={() => { selection(); onOpen(m); }} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === ms.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{short ? `${m.title} · ${shortNaira(m.amount)}` : m.title}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{l.sub}</Text>
              </View>
              <PtChip label={l.chip.label} tone={l.chip.tone} icon={l.chip.icon} />
            </View>
          </Pressable>
        );
      })}
    </PtPanel>
  );
}

/**
 * PJH-02 a funder who approves (or only puts money in), and PJH-04 a viewer:
 * what's waiting for you, the project wallet, what you put in and your share,
 * the milestones, and the tiles your role allows.
 */
export function FunderProjectView({ data, go }: { data: ProjectDetailData; go: Go }) {
  const me = useAuth((s) => s.user);
  const [what, setWhat] = useState(false);
  const p = data.project;
  const viewer = data.my_role === 'viewer';
  const approver = data.can.approve;
  const meRow = data.people.family.find((f) => f.id === me?.id);
  const total = Number(data.people.put_in_total ?? 0);
  const mine = Number(meRow?.put_in ?? 0);
  const plan = Number(p.plan_total) || Number(p.budget);
  const owner = p.owner?.name.split(' ')[0] ?? 'The owner';
  const myTurn = data.milestones.find((m) => (m.status === 'submitted' || m.status === 'approved') && m.approval?.approvers.some((a) => a.id === me?.id && !a.said_yes));
  const proof = [...data.milestones].reverse().find((m) => m.evidence.some((e) => e.kind !== 'receipt'));
  const rules = data.approval_rules;
  const roleText = viewer ? 'Viewer · read only' : approver ? 'Contributor and approver' : 'Contributor';
  const pct = viewer ? (plan ? (Number(p.done_amount) * 100) / plan : 0) : plan ? (total * 100) / plan : 0;
  // "₦1,900,000 still to raise": phases not funded yet, less what's free in the wallet.
  const toRaise = Math.max(0, data.milestones.filter((m) => m.status === 'planned').reduce((t, m) => t + Number(m.amount), 0) - Math.max(0, Number(p.available)));
  const openMilestone = (m: Milestone) =>
    m.status === 'submitted' || m.status === 'approved' ? go(approver ? 'ReviewMilestone' : 'MilestoneApprovals', { projectId: p.id, milestoneId: m.id }) : go('MoneyByMilestone', { projectId: p.id });

  return (
    <View style={{ gap: 16 }}>
      <ViewingAs role={roleText} onWhat={() => setWhat(true)} />
      {myTurn ? (
        <AttentionCard title={`Waiting for you: ${myTurn.title}`} sub={`Approve to release ${formatNaira(myTurn.release_now)}`} onPress={() => go('ReviewMilestone', { projectId: p.id, milestoneId: myTurn.id })} />
      ) : null}

      <Pressable onPress={() => { selection(); go('ProjectWallet', { projectId: p.id }); }} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 18 }}>
          <PtRing percent={Math.min(100, pct)} size={76} stroke={8} track="rgba(255,255,255,0.85)" labelColor="#FFFFFF" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Project wallet</Text>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 30, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(p.in_wallet)}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.onDarkMuted }}>
              {viewer
                ? `${Math.round(pct)}% of the work paid for${toRaise > 0 ? ` · ${formatNaira(toRaise)} still to raise` : ''}`
                : `${formatNaira(total)} put in so far, of ${formatNaira(plan)}`}
            </Text>
          </View>
        </View>
      </Pressable>

      {!viewer ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat label="You put in" value={formatNaira(mine)} />
          <Stat label="Your share" value={total ? `${Math.round((mine * 100) / total)}%` : '—'} />
          <Stat label="Approvals" value={rules ? (rules.mode === 'any' ? `Any 1 of ${rules.approvers.length}` : `${rules.needed} of ${rules.approvers.length}`) : '—'} />
        </View>
      ) : null}

      <MilestoneLines data={data} myId={me?.id} onOpen={openMilestone} short={viewer} />

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {viewer ? (
            <>
              <Tile icon="camera" label="See proof" disabled={!proof} why="No photos from the builder yet." onPress={() => proof && go('ProofViewer', { projectId: p.id, milestoneId: proof.id })} />
              <Tile icon="file" label="Documents" onPress={() => go('ProjectDocuments', { projectId: p.id })} />
              <Tile icon="message-square" label="Project chat" disabled={!data.can.chat} why={`${owner} didn't add you to the chat.`} onPress={() => go('ProjectChat', { projectId: p.id })} />
            </>
          ) : (
            <>
              <Tile icon="check" label="Approve" disabled={!approver || !myTurn} why={!approver ? `${owner} didn't make you an approver here.` : 'Nothing is waiting for your yes.'} onPress={() => myTurn && go('ReviewMilestone', { projectId: p.id, milestoneId: myTurn.id })} />
              <Tile icon="arrow-down" label="Add money" onPress={() => go('ProjectWallet', { projectId: p.id })} />
              <Tile icon="message-square" label="Project chat" disabled={!data.can.chat} why={`${owner} didn't add you to the chat.`} onPress={() => go('ProjectChat', { projectId: p.id })} />
            </>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {viewer ? (
            <>
              <Tile icon="lock" label="Add money" disabled why={`You can see this project, not put money in. Ask ${owner}.`} />
              <Tile icon="lock" label="Approve" disabled why="Viewers don't approve payments." />
              <Tile icon="download" label="Statement" onPress={() => go('WalletStatement', { walletId: p.wallet_id })} />
            </>
          ) : (
            <>
              <Tile icon="camera" label="See proof" disabled={!proof} why="No photos from the builder yet." onPress={() => proof && go('ProofViewer', { projectId: p.id, milestoneId: proof.id })} />
              <Tile icon="file" label="Documents" onPress={() => go('ProjectDocuments', { projectId: p.id })} />
              <Tile icon="lock" label="Pay vendor" disabled why="The builder is paid by milestone, once the approvers say yes." />
            </>
          )}
        </View>
      </View>

      <ProjectRoleSheet
        visible={what}
        title={viewer ? "You're a viewer" : approver ? "You're a contributor and approver" : "You're a contributor"}
        owner={owner}
        can={
          viewer
            ? ['See progress, proof and documents', ...(data.can.chat ? ['Chat with the family and the builder'] : []), 'Download the statement']
            : ['Put money in', ...(approver ? [`Approve milestones (${rules?.mode === 'any' ? 'any one' : `${rules?.needed ?? 1} of ${rules?.approvers.length ?? 1}`})`] : []), ...(data.can.chat ? ['Chat with the builder'] : []), 'See proof and documents']
        }
        cannot={[...(viewer ? ['Put money in', 'Approve payments'] : approver ? [] : ['Approve payments']), 'Pay the builder outside a milestone', 'Change who approves or invite people']}
        onClose={() => setWhat(false)}
      />
    </View>
  );
}
