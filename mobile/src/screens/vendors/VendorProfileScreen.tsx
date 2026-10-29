import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProjects } from '../../api/hooks';
import { useInviteVendor, useVendorProfile } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote } from '../../components/pt/PtForm';
import { PtSectionTitle, PtRow } from '../../components/pt/PtList';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadingBlock, PhotoGrid, Stars } from '../../components/project/ProjectUi';
import { tradeLabel } from '../../lib/projects';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

function Stat({ n, label }: { n: number | undefined; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 12, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: pt.ink }}>{n ?? 0}</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{label}</Text>
    </View>
  );
}

/** VND-02 a vendor's profile: badge, stars, record, services, past work, the latest review — "Add to a project". */
export function VendorProfileScreen({ navigation, route }: RootScreenProps<'VendorProfile'>) {
  const { profileId, projectId } = route.params;
  const query = useVendorProfile(profileId);
  const projects = useProjects();
  const invite = useInviteVendor();
  const [pickOpen, setPickOpen] = useState(false);
  const v = query.data?.vendor;

  if (!v) {
    return (
      <PtPageScreen title="Vendor" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  // Projects this family owns that still need a builder (or haven't got one to agree yet).
  const open = (projects.data ?? []).filter((p) => p.my_role === 'owner' && p.status === 'active' && (!p.vendor || p.vendor_status !== 'accepted') && p.vendor?.id !== v.user_id);

  const addTo = (id: number, title: string) => {
    showAlert(`Invite ${v.business_name}?`, `They'll see the milestones for ${title} and accept, ask for a change, or decline.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Invite',
        onPress: () =>
          invite.mutate(
            { projectId: id, vendorProfileId: v.id },
            {
              onSuccess: () => {
                setPickOpen(false);
                navigation.navigate('ProjectDetail', { projectId: id });
              },
              onError: (e) => showAlert('Could not invite', (e as Error).message),
            },
          ),
      },
    ]);
  };

  const onAdd = () => {
    const target = projectId ? (projects.data ?? []).find((p) => p.id === projectId) : undefined;
    if (target) addTo(target.id, target.title);
    else if (open.length) setPickOpen(true);
    else navigation.navigate('ProjectWalletSetup');
  };

  const since = v.since_year ? ` · since ${v.since_year}` : '';
  return (
    <PtPageScreen
      title={v.business_name}
      subtitle={`${tradeLabel(v.category)}${since}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Add to a project" onPress={onAdd} loading={invite.isPending} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PtAvatar initials={v.initials} uri={v.logo_url} tone="gold" size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          {v.verified ? <PtChip label="Verified business" tone="success" icon="check" /> : <PtChip label="Not verified yet" tone="warning" icon="clock" />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Stars value={v.rating ?? 0} />
            <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.ink }}>{v.rating ? v.rating.toFixed(1) : 'New'}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>· {v.reviews} review{v.reviews === 1 ? '' : 's'}</Text>
          </View>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
            {[v.rc_number, v.areas || v.location].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat n={v.stats?.projects} label="projects" />
        <Stat n={v.stats?.milestones_paid} label="milestones paid" />
        <Stat n={v.stats?.open_disputes} label="open disputes" />
      </View>
      {!v.verified ? <PtNote tone="attention">Patriai hasn't finished checking this business, so families can't pay it yet. You can still invite them.</PtNote> : null}
      {v.bio ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{v.bio}</Text> : null}
      {v.services.length ? (
        <>
          <PtSectionTitle title="Services" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {v.services.map((s) => (
              <View key={s} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, justifyContent: 'center' }}>
                <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.ink }}>{s}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {v.past_work.length ? (
        <>
          <PtSectionTitle title="Past work" />
          <PhotoGrid photos={v.past_work.map((w, i) => ({ key: i, url: w.url, caption: w.caption }))} />
        </>
      ) : null}
      {v.latest_review ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Stars value={v.latest_review.rating} />
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.ink }}>{v.latest_review.by}</Text>
          </View>
          {v.latest_review.body ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>"{v.latest_review.body}"</Text> : null}
        </View>
      ) : null}

      <PtSheet visible={pickOpen} title="Add to which project?" subtitle={`${v.business_name} will be asked to accept the milestones.`} onClose={() => setPickOpen(false)}
        footer={<PtButton title="Start a new project" variant="ghost" onPress={() => { setPickOpen(false); navigation.navigate('ProjectWalletSetup'); }} />}
      >
        <View>
          {open.map((p, i) => (
            <PtRow key={p.id} title={p.title} subtitle={p.vendor ? `${p.vendor.name} hasn't accepted yet` : 'No builder yet'} chevron onPress={() => addTo(p.id, p.title)} last={i === open.length - 1} />
          ))}
        </View>
      </PtSheet>
    </PtPageScreen>
  );
}
