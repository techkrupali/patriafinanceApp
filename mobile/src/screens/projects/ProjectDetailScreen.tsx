import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useCancelProject, useProject } from '../../api/hooks';
import { useAnswerVendorChanges, useRemindReinvite } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChoiceCard, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtSectionTitle } from '../../components/pt/PtList';
import { ActionTiles, AttentionCard, LoadingBlock, MoneyTiles, ProgressLine } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, initials } from '../../lib/format';
import { DECLINE_REASONS, isVendorSide, milestoneChip, monthName, namesList, townOf } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Milestone, ProjectDetailData } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/**
 * PRJ-03 Project detail: what's in the wallet and what's been paid, what needs
 * the family now, the milestones, and Money · Chat · Budget · Documents. With
 * no builder (they declined) it's PRJ-12.
 */
export function ProjectDetailScreen({ navigation, route }: RootScreenProps<'ProjectDetail'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const data = query.data;
  const vendorSide = isVendorSide(data?.my_role);

  // The builder and their team have their own view of a project (VDM-04, INV-V1).
  useEffect(() => {
    if (!data || !vendorSide) return;
    const invited = data.project.vendor_status === 'invited' || data.project.vendor_status === 'changes_proposed';
    navigation.replace(invited ? 'ProjectInvite' : 'VendorProject', { projectId });
  }, [data, vendorSide, navigation, projectId]);

  if (!data || vendorSide) {
    return (
      <PtPageScreen title="Project" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }
  if (!data.project.vendor && data.project.vendor_declined) {
    return <BuilderDeclined data={data} navigation={navigation} />;
  }
  return <Detail data={data} navigation={navigation} refreshing={query.isRefetching} />;
}

type Nav = RootScreenProps<'ProjectDetail'>['navigation'];

function Detail({ data, navigation }: { data: ProjectDetailData; navigation: Nav; refreshing: boolean }) {
  const { project: p, milestones } = data;
  const answer = useAnswerVendorChanges(p.id);
  const cancel = useCancelProject(p.id);
  const cancellable = data.can.invite_vendor && p.status === 'active' && !milestones.some((m) => ['submitted', 'approved', 'released'].includes(m.status));
  const planned = milestones.filter((m) => m.status !== 'proposed' && m.status !== 'cancelled');
  const proposed = milestones.filter((m) => m.status === 'proposed' && !m.proposal?.family_note);
  const vendorChanges = milestones.filter((m) => m.change_request?.by === 'vendor');
  const disputed = milestones.find((m) => m.dispute && m.status !== 'released');
  const vendorName = p.vendor?.name ?? 'The builder';
  const total = Number(p.plan_total) || Number(p.budget);
  // The latest paid milestone not rated yet (VND-04 "After: Tiling and plaster").
  const toRate = [...milestones].reverse().find((m) => m.status === 'released' && !data.reviewed_milestones.includes(m.id));

  const openMilestone = (m: Milestone) => {
    if (m.status === 'submitted' || m.status === 'approved') navigation.navigate('ReviewMilestone', { projectId: p.id, milestoneId: m.id });
    else if (m.status === 'proposed') navigation.navigate('ApproveProposal', { projectId: p.id, milestoneId: m.id });
    else navigation.navigate('Milestones', { projectId: p.id });
  };

  const answerChanges = (agree: boolean) => {
    answer.mutate(agree, {
      onError: (e) => showAlert('Could not save', (e as Error).message),
    });
  };

  return (
    <PtPageScreen
      title={p.title}
      subtitle={`Project${p.setup?.location ? ` · ${townOf(p.setup.location)}` : ''}`}
      onBack={() => navigation.goBack()}
      right={
        <Pressable onPress={() => { selection(); navigation.navigate('WalletSettings', { walletId: p.wallet_id }); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Approval settings">
          <Feather name="settings" size={22} color={pt.ink} />
        </Pressable>
      }
      gap={14}
    >
      <MoneyTiles
        left={{ label: 'In the wallet', value: formatNaira(p.in_wallet) }}
        right={{ label: 'Paid so far', value: formatNaira(p.paid_so_far) }}
        onPress={() => navigation.navigate('WalletDetail', { walletId: p.wallet_id })}
      />
      <View style={{ gap: 6 }}>
        <ProgressLine value={Number(p.done_amount)} max={total} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
            {formatNaira(p.done_amount)} of {formatNaira(total)} done
          </Text>
          {Number(p.held_back) > 0 ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{formatNaira(p.held_back)} held back</Text> : null}
        </View>
      </View>

      {p.attention ? (
        <AttentionCard
          title={`${vendorName} finished ${p.attention.title.toLowerCase()}`}
          sub={p.attention.status === 'approved' ? 'Waiting for the other approvers' : `Check the photos and release ${formatNaira(p.attention.release_now)}`}
          onPress={() => navigation.navigate('ReviewMilestone', { projectId: p.id, milestoneId: p.attention!.milestone_id })}
        />
      ) : null}

      {proposed.map((m) => (
        <AttentionCard
          key={m.id}
          tone="info"
          title={`New milestone from the builder: ${m.title}`}
          sub={`${formatNaira(m.amount)} · approve it before work starts`}
          onPress={() => navigation.navigate('ApproveProposal', { projectId: p.id, milestoneId: m.id })}
        />
      ))}

      {disputed ? (
        <AttentionCard
          tone="danger"
          title={`Dispute ${disputed.dispute?.number ?? ''} · ${disputed.title}`}
          sub="The payment is on hold until it's sorted"
          onPress={() => navigation.navigate('DisputeDetail', { disputeId: disputed.dispute!.id })}
        />
      ) : null}

      {p.vendor_status === 'changes_proposed' && data.can.edit ? (
        <View style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>
            {vendorName} asked for {vendorChanges.length === 1 ? 'a change' : `${vendorChanges.length} changes`}
          </Text>
          {vendorChanges.map((m) => (
            <Text key={m.id} style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
              {m.title}: {m.change_request?.amount ? `${formatNaira(m.amount)} → ${formatNaira(m.change_request.amount)}` : 'new dates'}
              {m.change_request?.why ? ` · "${m.change_request.why}"` : ''}
            </Text>
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PtButton title="Keep original" variant="secondary" size="sm" onPress={() => answerChanges(false)} disabled={answer.isPending} style={{ flex: 1 }} />
            <PtButton title="Agree" size="sm" onPress={() => answerChanges(true)} loading={answer.isPending} style={{ flex: 1 }} />
          </View>
        </View>
      ) : p.vendor_status === 'invited' && p.vendor ? (
        <PtNote>{`Waiting for ${vendorName} to accept the milestones. Nothing is paid until they do.`}</PtNote>
      ) : !p.vendor ? (
        <AttentionCard
          tone="mint"
          title={p.setup?.vendor_invite ? 'Your builder hasn\'t joined yet' : 'No builder yet'}
          sub={p.setup?.vendor_invite ? `We texted ${p.setup.vendor_invite}. Or find a verified builder.` : 'Find a verified builder for this project'}
          onPress={() => navigation.navigate('VendorDirectory', { projectId: p.id, near: townOf(p.setup?.location) })}
        />
      ) : null}

      <PtSectionTitle title="Milestones" action={data.can.edit ? 'Add' : undefined} onAction={() => navigation.navigate('EditMilestone', { projectId: p.id })} />
      <PtPanel>
        {planned.length === 0 ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 14 }}>No milestones yet.</Text>
        ) : (
          planned.map((m, i) => {
            const chip = milestoneChip(m);
            return (
              <Pressable key={m.id} onPress={() => { selection(); openMilestone(m); }} accessibilityRole="button" accessibilityLabel={`${m.title}, ${chip.label}`}>
                <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === planned.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <Text style={{ width: 16, fontFamily: ptFont.semibold, fontSize: 15, color: pt.inkMuted }}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                      {m.title}
                    </Text>
                    <PtChip label={chip.label} tone={chip.tone} icon={chip.icon} />
                  </View>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(m.amount)}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </PtPanel>

      <ActionTiles
        items={[
          { label: 'Money', icon: 'lock', onPress: () => navigation.navigate('WalletDetail', { walletId: p.wallet_id }) },
          { label: 'Chat', icon: 'message-square', onPress: () => navigation.navigate('ProjectChat', { projectId: p.id }) },
          { label: 'Budget', icon: 'trending-up', onPress: () => navigation.navigate('ProjectBudget', { projectId: p.id }) },
          { label: 'Documents', icon: 'file', onPress: () => navigation.navigate('ProjectDocuments', { projectId: p.id }) },
        ]}
      />

      {p.vendor && toRate && p.vendor.profile_id && data.can.edit ? (
        <Pressable
          onPress={() => {
            selection();
            navigation.navigate('RateVendor', { profileId: p.vendor!.profile_id!, name: p.vendor!.name, milestoneId: toRate.id, milestoneTitle: toRate.title, projectId: p.id, town: townOf(p.setup?.location) });
          }}
          accessibilityRole="button"
          style={{ alignItems: 'center', paddingVertical: 6 }}
        >
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Rate {p.vendor.name}</Text>
        </Pressable>
      ) : null}
      {p.approvers.length > 1 ? <PtNote>{`Payments need ${namesList(p.approvers.map((a) => a.first_name))} to approve.`}</PtNote> : null}
      {cancellable ? (
        <Pressable
          onPress={() => {
            selection();
            showAlert('Cancel this project?', 'Nothing has been paid. The money stays in the project wallet, and the builder is told.', [
              { text: 'Keep it', style: 'cancel' },
              {
                text: 'Cancel project',
                style: 'destructive',
                onPress: () => cancel.mutate(undefined, { onSuccess: () => navigation.navigate('Projects'), onError: (e) => showAlert('Could not cancel', (e as Error).message) }),
              },
            ]);
          }}
          accessibilityRole="button"
          style={{ alignItems: 'center', paddingVertical: 6 }}
        >
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.danger }}>Cancel project</Text>
        </Pressable>
      ) : null}
    </PtPageScreen>
  );
}

/** PRJ-12 "Builder needed": who declined and why, the money is safe, find another or re-invite. */
function BuilderDeclined({ data, navigation }: { data: ProjectDetailData; navigation: Nav }) {
  const p = data.project;
  const d = p.vendor_declined!;
  const remind = useRemindReinvite(p.id);
  const [choice, setChoice] = useState<'find' | 'remind'>('find');
  const reason = DECLINE_REASONS.find((r) => r.value === d.reason)?.label ?? 'Declined';
  const month = monthName(d.start_month) || 'a month';
  const town = data.suggestions?.near || townOf(p.setup?.location);
  const firstWord = d.name.split(' ')[0];
  const paid = Number(p.released);

  const go = () => {
    if (choice === 'find') {
      navigation.navigate('VendorDirectory', { projectId: p.id, near: town });
      return;
    }
    remind.mutate(undefined, {
      onSuccess: (r) => showAlert('Reminder set', `We'll remind you on ${formatYmd(r.remind_on)}.`),
      onError: (e) => showAlert('Could not set the reminder', (e as Error).message),
    });
  };

  return (
    <PtPageScreen
      title={p.title}
      subtitle="Builder needed"
      onBack={() => navigation.goBack()}
      footer={<PtButton title={choice === 'find' ? 'Find a builder' : `Remind me in ${month}`} onPress={go} loading={remind.isPending} />}
      gap={14}
    >
      <View style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PtAvatar initials={initials(d.name.split(/\s+/).slice(0, 2).join(' '))} tone="gold" size={36} />
          <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{d.name} declined</Text>
          <PtChip label={reason} tone="warning" icon="clock" />
        </View>
        {d.message ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>"{d.message}"</Text> : null}
      </View>
      <PtPanel>
        <PtReviewRow label="Your money" value={`${formatNaira(p.in_wallet)} stays in the project wallet`} sub={paid > 0 ? `${formatNaira(paid)} was paid for finished work` : 'Nothing was paid'} />
        <PtReviewRow label="Milestones" value="Kept, ready for a new builder" last />
      </PtPanel>
      <PtChoiceCard
        icon="search"
        title="Find another verified builder"
        subtitle={
          data.suggestions?.count
            ? `${data.suggestions.count} in ${town || 'your area'} with 4.5 stars or more`
            : `Search the directory for verified builders${town ? ` near ${town}` : ''}`
        }
        selected={choice === 'find'}
        onPress={() => setChoice('find')}
      />
      {d.start_month ? (
        <PtChoiceCard
          icon="clock"
          title={p.reinvite_on ? `We'll remind you to re-invite ${firstWord}` : `Remind me to re-invite ${firstWord} in ${month}`}
          selected={choice === 'remind'}
          onPress={() => setChoice('remind')}
        />
      ) : null}
    </PtPageScreen>
  );
}
