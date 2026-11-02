import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { LoadingBlock, PersonRow } from '../../components/project/ProjectUi';
import { formatNaira, initials } from '../../lib/format';
import { isVendorSide, projectRoleLabel } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

const VENDOR_SUB: Record<string, string> = { vendor: 'vendor owner', site_manager: 'Site manager · submits milestones', foreman: 'Foreman · photos only', accounts: 'Accounts · payouts, view only' };

/**
 * PJH-05 Project members: the family side (owner, approvers, viewers and what
 * each put in) and the builder's side, each inviting its own people.
 */
export function ProjectMembersScreen({ navigation, route }: RootScreenProps<'ProjectMembers'>) {
  const { projectId } = route.params;
  const me = useAuth((s) => s.user);
  const query = useProject(projectId);

  if (!query.data) {
    return (
      <PtPageScreen title="Members" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const { family, vendor } = query.data.people;
  const p = query.data.project;
  const vendorSide = isVendorSide(query.data.my_role);
  const canInviteFamily = query.data.can.invite_vendor || query.data.my_role === 'co_owner';
  const canInviteTeam = query.data.my_role === 'vendor';

  const invite = (label: string, onPress: () => void) => (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
      <Feather name="plus" size={20} color={pt.brand} />
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{label}</Text>
    </Pressable>
  );

  return (
    <PtPageScreen title="Members" subtitle={p.title} onBack={() => navigation.goBack()}>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>{`Family side · ${family.length}`}</PtGroupLabel>
        <PtPanel>
          {family.map((f, i) => {
            const role = f.role === 'owner' ? 'Owner' : f.approver ? 'Approver' : projectRoleLabel(f.role) || 'Family';
            const sub = [f.role === 'owner' ? `Owner${f.approver ? ' · approver' : ''}` : f.approver ? 'Approver' : role, f.put_in !== null && Number(f.put_in) > 0 ? `put in ${formatNaira(f.put_in)}` : null].filter(Boolean).join(' · ');
            return (
              <PersonRow
                key={f.id}
                initials={initials(f.name)}
                tone={i === 0 ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                name={f.id === me?.id ? `${f.first_name} (you)` : f.name}
                sub={sub}
                chip={{ label: role, tone: f.role === 'owner' ? 'neutral' : f.approver ? 'brand' : 'neutral', icon: 'circle' }}
                last={i === family.length - 1}
              />
            );
          })}
        </PtPanel>
        {canInviteFamily ? invite('Invite family or funders', () => navigation.navigate('InviteFunder', { projectId })) : null}
      </View>

      <View style={{ gap: 10 }}>
        <PtGroupLabel>{`Vendor side · ${vendor.length}`}</PtGroupLabel>
        {vendor.length ? (
          <PtPanel>
            {vendor.map((v, i) => (
              <PersonRow
                key={v.id}
                initials={initials(v.name)}
                tone={i === 0 ? 'gold' : 'mint'}
                name={v.id === me?.id ? `${v.first_name} (you)` : v.name}
                sub={v.role === 'vendor' ? `${v.business ?? 'The business'} · vendor owner` : VENDOR_SUB[v.role ?? ''] ?? ''}
                chip={v.role === 'vendor' ? { label: 'Vendor', tone: 'success', icon: 'check' } : null}
                last={i === vendor.length - 1}
              />
            ))}
          </PtPanel>
        ) : (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>No builder yet.</Text>
        )}
        {canInviteTeam ? invite('Invite your team', () => navigation.navigate('VendorTeam')) : null}
      </View>

      <PtNote tone="info" icon="lock">
        {vendorSide
          ? "Each side invites its own people. You can't add family, and the family can't add to your team."
          : "Each side invites its own people. The vendor can't add family, and the family can't add to the vendor's team."}
      </PtNote>
    </PtPageScreen>
  );
}
