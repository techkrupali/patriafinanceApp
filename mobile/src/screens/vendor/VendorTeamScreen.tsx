import React, { useState } from 'react';

import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt } from '../../theme';
import { useInviteTeamMember, useRemoveTeamMember, useVendorHome, useVendorTeam } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { LoadingBlock, PersonRow, TickRow } from '../../components/project/ProjectUi';
import { agoLabel, initials } from '../../lib/format';
import { TEAM_ROLES } from '../../lib/projects';
import { DEFAULT_COUNTRY, isValidE164, toE164, type Country } from '../../lib/phone';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { TeamRole } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/** VDM-10 the business's team: who does what, on which projects, and who's still invited. */
export function VendorTeamScreen({ navigation }: RootScreenProps<'VendorTeam'>) {
  const query = useVendorTeam();
  const home = useVendorHome();
  const remove = useRemoveTeamMember();
  const data = query.data;

  return (
    <PtPageScreen
      title="Team"
      subtitle={home.data?.business?.name}
      onBack={() => navigation.goBack()}
      right={
        <Pressable onPress={() => { selection(); navigation.navigate('InviteTeam'); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Invite">
          <Feather name="plus" size={24} color={pt.ink} />
        </Pressable>
      }
      footer={<PtButton title="Invite a team member" onPress={() => navigation.navigate('InviteTeam')} />}
    >
      {!data ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <PtPanel>
            <PersonRow initials={initials(data.owner.name)} tone="gold" name={data.owner.name} sub="Owner · everything" chip={{ label: 'Owner', tone: 'neutral', icon: 'circle' }} last={data.members.length === 0} />
            {data.members.map((m, i) => {
              const role = TEAM_ROLES.find((r) => r.value === m.role);
              const pending = m.status === 'pending';
              const where = m.projects.length === 1 ? m.projects[0].title : `${m.projects.length} project${m.projects.length === 1 ? '' : 's'}`;
              return (
                <PersonRow
                  key={m.id}
                  initials={m.name ? initials(m.name) : '+'}
                  tone={pending ? 'dashed' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                  name={m.name ?? m.phone ?? 'Invited'}
                  sub={pending ? `Invited ${agoLabel(m.invited_at)} · ${m.role_label.toLowerCase()}` : `${m.role_label}${m.role === 'accounts' ? '' : ` · ${where}`}`}
                  chip={pending ? { label: 'Pending', tone: 'warning', icon: 'clock' } : { label: role?.chip ?? m.role_label, tone: m.role === 'site_manager' ? 'brand' : 'neutral', icon: 'circle' }}
                  onPress={() =>
                    showAlert(m.name ?? m.phone ?? 'Team member', pending ? 'Cancel this invite?' : `Remove ${m.name} from the team? They'll stop seeing your projects.`, [
                      { text: 'Keep', style: 'cancel' },
                      { text: pending ? 'Cancel invite' : 'Remove', style: 'destructive', onPress: () => remove.mutate(m.id, { onError: (e) => showAlert('Could not remove', (e as Error).message) }) },
                    ])
                  }
                  last={i === data.members.length - 1}
                />
              );
            })}
          </PtPanel>
          <PtNote icon="lock">Families see who submitted each milestone. Only you and site managers can submit for payment.</PtNote>
        </>
      )}
    </PtPageScreen>
  );
}

/** VDM-11 "Invite to your team": phone, role, and the projects they'll see. */
export function InviteTeamScreen({ navigation }: RootScreenProps<'InviteTeam'>) {
  const query = useVendorTeam();
  const home = useVendorHome();
  const invite = useInviteTeamMember();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<TeamRole>('site_manager');
  const [projects, setProjects] = useState<number[]>([]);
  const e164 = toE164(country.dial, phone);
  const ok = isValidE164(e164) && (role === 'accounts' || projects.length > 0);

  const send = () =>
    invite.mutate(
      { phone: e164, role, project_ids: projects },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e) => showAlert('Not sent', (e as Error).message),
      },
    );

  return (
    <PtPageScreen title="Invite to your team" subtitle={home.data?.business?.name} onBack={() => navigation.goBack()} footer={<PtButton title="Send invite" onPress={send} disabled={!ok} loading={invite.isPending} />}>
      <PtPhoneField label="Phone number" country={country} onChangeCountry={setCountry} value={phone} onChange={setPhone} layout="inline" />
      <PtGroupLabel>Role</PtGroupLabel>
      {TEAM_ROLES.map((r) => (
        <PtChoiceCard key={r.value} title={r.label} subtitle={r.hint} selected={role === r.value} onPress={() => setRole(r.value)} />
      ))}
      <PtGroupLabel>Projects</PtGroupLabel>
      {!query.data ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} />
      ) : query.data.projects.length === 0 ? (
        <PtNote>You'll be able to give them projects once a family invites you to one.</PtNote>
      ) : (
        <PtPanel>
          {query.data.projects.map((p, i) => (
            <TickRow
              key={p.id}
              title={p.title}
              sub={p.location ?? undefined}
              checked={projects.includes(p.id)}
              onToggle={() => setProjects((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
              last={i === query.data!.projects.length - 1}
            />
          ))}
        </PtPanel>
      )}
    </PtPageScreen>
  );
}
