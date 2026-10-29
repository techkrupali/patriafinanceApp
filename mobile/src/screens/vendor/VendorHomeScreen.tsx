import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useMyVendorProfile } from '../../api/hooks';
import { useTeamInvites, useVendorHome } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtButton } from '../../components/pt/PtButton';
import { PtSectionTitle } from '../../components/pt/PtList';
import { AttentionCard, LoadingBlock, MoneyTiles } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { VendorNeed } from '../../api/types';
import type { VendorTabScreenProps } from '../../navigation/types';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Back to the family app (Home, Family, Steward…). */
export function SwitchToFamily({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button" accessibilityLabel="Switch to family" hitSlop={8}
      style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: pt.brandSoft, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Feather name="repeat" size={14} color={pt.brand} />
      <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.brand }}>Family</Text>
    </Pressable>
  );
}

/**
 * VDM-03 Vendor home: paid this month and waiting for approval, what needs the
 * builder now (invites, due milestones, the family's changes, disputes), and
 * their projects. A team member sees only the projects they were given.
 */
export function VendorHomeScreen({ navigation }: VendorTabScreenProps<'VendorHome'>) {
  const me = useAuth((s) => s.user);
  const setMode = useAuth((s) => s.setMode);
  const home = useVendorHome();
  const profile = useMyVendorProfile();
  const invites = useTeamInvites();
  const data = home.data;
  const status = profile.data?.profile?.status;

  const toFamily = () => {
    void setMode('family');
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const openNeed = (n: VendorNeed) => {
    if (n.kind === 'invite') navigation.navigate('ProjectInvite', { projectId: n.project_id });
    else if (n.kind === 'dispute' && n.dispute_id) navigation.navigate('DisputeDetail', { disputeId: n.dispute_id });
    else if ((n.kind === 'due' || n.kind === 'redo') && n.milestone_id) navigation.navigate('SubmitWork', { projectId: n.project_id, milestoneId: n.milestone_id });
    else navigation.navigate('VendorProject', { projectId: n.project_id });
  };

  return (
    <PtTabScreen refreshing={home.isRefetching} onRefresh={() => { void home.refetch(); void invites.refetch(); void profile.refetch(); }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PtAvatar initials={data?.business?.initials ?? '?'} uri={data?.business?.logo_url} tone="gold" size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>{data?.business?.name ?? 'Business'}</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 21, lineHeight: 26, color: pt.ink }} numberOfLines={2}>
            {greeting()}, {me?.first_name}
          </Text>
        </View>
        <SwitchToFamily onPress={toFamily} />
      </View>

      {!data ? (
        <LoadingBlock error={home.error ? (home.error as Error).message : null} onRetry={() => void home.refetch()} />
      ) : !data.business ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 18, gap: 10 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>Get paid by families through milestones</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>Set up your business account. It takes about 10 minutes, and families can pay you once Patriai has checked it.</Text>
          <PtButton title="Set up a business account" onPress={() => navigation.navigate('BusinessSetup', {})} />
        </View>
      ) : (
        <>
          {data.team_role === 'owner' || data.team_role === 'accounts' ? (
            <MoneyTiles left={{ label: 'Paid this month', value: formatNaira(data.paid_this_month) }} right={{ label: 'Waiting for approval', value: formatNaira(data.waiting) }} />
          ) : null}

          {data.team_role === 'owner' && status && status !== 'verified' ? (
            <AttentionCard
              tone={status === 'needs_changes' ? 'danger' : 'info'}
              title={status === 'draft' ? 'Finish your business account' : status === 'needs_changes' ? 'Patriai asked you to fix something' : "We're checking your business"}
              sub={status === 'submitted' ? "Usually done in 1 working day. Families can't pay you until then." : 'Families can only pay verified businesses.'}
              onPress={() => navigation.navigate('BusinessVerification')}
            />
          ) : null}

          {(invites.data ?? []).map((inv) => (
            <AttentionCard key={`team-${inv.id}`} tone="mint" title={`${inv.business?.owner ?? 'A business'} added you to the ${inv.business?.name ?? ''} team`} sub={`You: ${inv.role_label} · tap to join`} onPress={() => navigation.navigate('TeamInvite', { memberId: inv.id })} />
          ))}

          {data.needs.length ? (
            <>
              <PtSectionTitle title="Needs you" />
              {data.needs.map((n, i) => (
                <AttentionCard key={`${n.kind}-${n.project_id}-${n.milestone_id ?? n.dispute_id ?? i}`} tone={n.kind === 'dispute' ? 'danger' : 'gold'} title={n.title} sub={n.sub} onPress={() => openNeed(n)} />
              ))}
            </>
          ) : null}

          <PtSectionTitle title="Projects" />
          {data.projects.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
              No projects yet. When a family invites {data.business.name} to a project, it shows here. Share your profile so families can find you.
            </Text>
          ) : (
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              {data.projects.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => { selection(); navigation.navigate(p.vendor_status === 'invited' || p.vendor_status === 'changes_proposed' ? 'ProjectInvite' : 'VendorProject', { projectId: p.id }); }}
                  accessibilityRole="button"
                  accessibilityLabel={p.title}
                >
                  <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === data.projects.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="home" size={18} color={pt.brand} />
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{p.title}</Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>{p.sub}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={pt.inkSubtle} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
    </PtTabScreen>
  );
}
