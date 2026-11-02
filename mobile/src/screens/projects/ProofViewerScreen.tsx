import React, { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtButton } from '../../components/pt/PtButton';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { dayTime, townOf } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/**
 * MLS-01 Proof viewer: one photo or video at a time with its caption, where
 * and when, and who uploaded it — then "Next: approve this phase".
 */
export function ProofViewerScreen({ navigation, route }: RootScreenProps<'ProofViewer'>) {
  const { projectId, milestoneId, index = 0 } = route.params;
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const query = useProject(projectId);
  const [at, setAt] = useState(index);
  const m = query.data?.milestones.find((x) => x.id === milestoneId);
  const p = query.data?.project;
  const items = (m?.evidence ?? []).filter((e) => e.kind !== 'receipt');
  const e = items[Math.min(at, items.length - 1)];

  if (!query.data || !m || !p || !e) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0E1A17', paddingTop: insets.top + 40 }}>
        <LoadingBlock error={query.error ? (query.error as Error).message : m ? 'No photos on this milestone.' : null} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const approver = m.approval?.approvers.find((x) => x.id === me?.id);
  const canApprove = query.data.can.approve && (m.status === 'submitted' || m.status === 'approved') && approver && !approver.said_yes;
  const kind = e.kind === 'video' ? 'Video' : e.kind === 'site_visit' ? 'Site visit photo' : 'Photo';
  const by = (query.data.people.vendor.find((v) => v.name === e.uploaded_by)?.role ?? null) as string | null;
  const role = by === 'site_manager' ? ', site manager' : by === 'foreman' ? ', foreman' : by === 'vendor' ? ', the builder' : '';
  const town = townOf(p.setup?.location);
  const step = (d: number) => {
    selection();
    setAt((i) => Math.max(0, Math.min(items.length - 1, i + d)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0E1A17', paddingTop: insets.top + 4 }}>
      <StatusBar style="light" />
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 }}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="x" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 18, color: '#FFFFFF' }} numberOfLines={1} accessibilityRole="header">
            {e.caption || kind}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.onDarkMuted }}>{`${kind} ${at + 1} of ${items.length} · ${m.title}`}</Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, gap: 14 }}>
        <View style={{ flex: 1, borderRadius: ptRadius.md, overflow: 'hidden', backgroundColor: '#2A2F2C', alignItems: 'center', justifyContent: 'center' }}>
          {e.kind === 'video' ? (
            <Pressable onPress={() => void Linking.openURL(e.url)} accessibilityRole="button" accessibilityLabel="Play video" style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="play" size={28} color="#FFFFFF" />
            </Pressable>
          ) : (
            <Image source={{ uri: e.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel={e.caption ?? kind} />
          )}
          {items.length > 1 ? (
            <>
              <Pressable onPress={() => step(-1)} disabled={at === 0} accessibilityRole="button" accessibilityLabel="Previous" style={{ position: 'absolute', left: 8, top: '45%', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', opacity: at === 0 ? 0.3 : 1 }}>
                <Feather name="chevron-left" size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={() => step(1)} disabled={at === items.length - 1} accessibilityRole="button" accessibilityLabel="Next" style={{ position: 'absolute', right: 8, top: '45%', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', opacity: at === items.length - 1 ? 0.3 : 1 }}>
                <Feather name="chevron-right" size={22} color="#FFFFFF" />
              </Pressable>
            </>
          ) : null}
        </View>
        <View style={{ backgroundColor: '#222A27', borderRadius: ptRadius.md, padding: 14, gap: 8 }}>
          {e.location ? (
            <Line icon="map-pin" text={`Taken at ${e.location.lat.toFixed(4)}, ${e.location.lng.toFixed(4)}${town ? ` · the site is in ${town}` : ''}`} />
          ) : town ? (
            <Line icon="map-pin" text={`For the site in ${town}`} />
          ) : null}
          {e.taken_at ? <Line icon="camera" text={`Taken ${dayTime(e.taken_at)}`} /> : null}
          <Line icon="clock" text={`Uploaded ${dayTime(e.created_at)}`} />
          <Line icon="camera" text={`By ${e.uploaded_by ?? 'the builder'}${role}`} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
        {canApprove ? (
          <PtButton title="Next: approve this phase" onPress={() => navigation.navigate('ReleasePayment', { projectId, milestoneId })} />
        ) : (
          <PtButton title="Done" variant="secondary" onPress={() => navigation.goBack()} />
        )}
      </View>
    </View>
  );
}

function Line({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Feather name={icon} size={16} color="#FFFFFF" />
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 14, color: '#FFFFFF' }}>{text}</Text>
    </View>
  );
}
