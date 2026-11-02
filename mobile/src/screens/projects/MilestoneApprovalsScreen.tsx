import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useRemindApproval } from '../../api/payments';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { LoadingBlock, PersonRow } from '../../components/project/ProjectUi';
import { formatNaira, initials } from '../../lib/format';
import { clockTime, namesList, projectRoleLabel } from '../../lib/projects';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * MLS-02 Multi-approval progress: what's released and held back, each
 * approver with when they said yes and what they said (or when they looked),
 * who can only see, and "Remind Chidi" / "Discuss in the project chat".
 */
export function MilestoneApprovalsScreen({ navigation, route }: RootScreenProps<'MilestoneApprovals'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const me = useAuth((s) => s.user);
  const m = query.data?.milestones.find((x) => x.id === milestoneId);
  const p = query.data?.project;
  const remind = useRemindApproval(m?.approval?.request_id ?? 0);

  if (!query.data || !m || !p) {
    return (
      <PtPageScreen title="Approvals" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const a = m.approval;
  const approvers = a?.approvers ?? [];
  const waiting = approvers.filter((x) => !x.said_yes);
  const mine = approvers.find((x) => x.id === me?.id);
  const iStarted = Boolean(a?.request_id) && approvers.find((x) => x.said_yes && x.id === me?.id) !== undefined;
  const vendorName = p.vendor?.name ?? 'the builder';
  const done = m.status === 'released';
  const left = Math.max(0, (a?.required ?? 1) - (a?.yes ?? 0));

  return (
    <PtPageScreen
      title={m.title}
      subtitle={done ? 'Paid' : `${a?.required ?? 1} approval${(a?.required ?? 1) === 1 ? '' : 's'} needed`}
      onBack={() => navigation.goBack()}
      footer={
        <>
          {mine && !mine.said_yes && query.data.can.approve && !done ? (
            <PtButton title="Approve" onPress={() => navigation.navigate('ReleasePayment', { projectId, milestoneId })} />
          ) : iStarted && waiting.length && a?.request_id ? (
            <PtButton
              title={waiting.length === 1 ? `Remind ${waiting[0].first_name}` : 'Remind them'}
              loading={remind.isPending}
              onPress={() =>
                remind.mutate(undefined, {
                  onSuccess: () => {
                    notifySuccess();
                    showAlert('Reminder sent', `We nudged ${namesList(waiting.map((w) => w.first_name))}.`);
                  },
                  onError: (e) => showAlert('Not sent', (e as Error).message),
                })
              }
            />
          ) : null}
          {query.data.can.chat ? <PtButton title="Discuss in the project chat" variant="ghost" onPress={() => navigation.navigate('ProjectChat', { projectId })} /> : null}
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 14, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.onDarkMuted }}>{done ? 'Released' : 'Releases'}</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: '#FFFFFF' }}>{formatNaira(done ? m.paid_now ?? m.release_now : m.release_now)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Held back</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{formatNaira(done ? m.retention ?? m.hold_back : m.hold_back)}</Text>
        </View>
      </View>

      {a ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>{`Approvers · ${a.yes} of ${a.required}`}</PtGroupLabel>
          <PtPanel>
            {approvers.map((x, i) => {
              const isMe = x.id === me?.id;
              const role = x.role === 'owner' ? 'Owner' : x.role === 'contributor' ? 'Contributor and approver' : x.role === 'co_owner' ? 'Co-owner' : 'Approver';
              const sub = x.said_yes
                ? `Approved ${clockTime(x.approved_at)}${x.note ? ` · "${x.note}"` : ''}`
                : [role, x.viewed_at ? `viewed ${clockTime(x.viewed_at)}` : 'not opened yet'].join(' · ');
              return (
                <PersonRow
                  key={x.id}
                  initials={initials(x.name)}
                  tone={i === 0 ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                  name={isMe ? `${x.first_name} (you)` : x.name}
                  sub={sub}
                  chip={x.said_yes ? { label: 'Approved', tone: 'success', icon: 'check' } : { label: 'Waiting', tone: 'warning', icon: 'clock' }}
                  last={i === approvers.length - 1 && !(a.viewers ?? []).length}
                />
              );
            })}
            {(a.viewers ?? []).map((v, i) => (
              <PersonRow
                key={v.id}
                initials={initials(v.name)}
                tone="mint"
                name={v.id === me?.id ? `${v.first_name} (you)` : v.first_name}
                sub={`${projectRoleLabel(v.role) || 'Family'} · can see, not an approver here`}
                chip={{ label: 'Viewer', tone: 'neutral', icon: 'circle' }}
                last={i === (a.viewers ?? []).length - 1}
              />
            ))}
          </PtPanel>
        </View>
      ) : null}

      {done ? (
        <PtNote tone="success">{`Paid to ${vendorName}${m.approved_by?.length ? ` · approved by ${namesList(m.approved_by.map((x) => (x.id === me?.id ? 'you' : x.first_name)))}` : ''}.`}</PtNote>
      ) : left > 0 ? (
        <PtNote tone="info" icon="unlock">
          {`When ${left === waiting.length ? namesList(waiting.map((w) => w.first_name)) : left === 1 ? `one of ${namesList(waiting.map((w) => w.first_name)).replace(' and ', ' or ')}` : `${left} more`} approve${left === 1 ? 's' : ''}, ${formatNaira(m.release_now)} goes to ${vendorName}${m.advance && !m.advance.paid ? `, with ${formatNaira(m.advance.amount)} for ${m.advance.title ?? 'the next phase'}${query.data.milestones.find((x) => x.id === m.advance!.milestone_id)?.status === 'funded' ? '' : " once it's funded"}` : ''}.`}
        </PtNote>
      ) : null}
      {a?.site_photo_needed ? <PtNote tone="attention">An approver's site visit photo is needed before this can be approved.</PtNote> : null}
    </PtPageScreen>
  );
}
