import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { useAnswerTeamInvite, useTeamInvites } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtChoiceCard, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** INV-VT1 "Tunde Adeyemi added you to the Adeyemi Builders team": the role, the projects, what you can and can't do. */
export function TeamInviteScreen({ navigation, route }: RootScreenProps<'TeamInvite'>) {
  const { memberId } = route.params;
  const insets = useSafeAreaInsets();
  const invites = useTeamInvites();
  const answer = useAnswerTeamInvite();
  const setMode = useAuth((s) => s.setMode);
  const inv = invites.data?.find((i) => i.id === memberId);
  const owner = inv?.business?.owner ?? 'The owner';
  const ownerFirst = owner.split(' ')[0];
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const reasons = [`I don't work with ${inv?.business?.name ?? 'this business'}`, 'Wrong person', 'Not available right now'];

  const reply = (join: boolean) =>
    answer.mutate(
      { memberId, join, reason: join ? undefined : reason ?? undefined },
      {
        onSuccess: () => {
          if (join) {
            void setMode('business');
            // One project given: open it straight away.
            const only = inv?.projects.length === 1 ? inv.projects[0] : null;
            navigation.reset({ index: only ? 1 : 0, routes: only ? [{ name: 'VendorTabs' }, { name: 'VendorProject', params: { projectId: only.id } }] : [{ name: 'VendorTabs' }] });
          } else {
            setDeclining(false);
            navigation.goBack();
          }
        },
        onError: (e) => showAlert('Could not answer', (e as Error).message),
      },
    );

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 12 }}>
        <PtBackButton onPress={() => navigation.goBack()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        <PtLogo height={26} />
        {!inv ? (
          <LoadingBlock error={invites.isLoading ? null : invites.error ? (invites.error as Error).message : 'This invite is no longer open.'} onRetry={() => void invites.refetch()} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <PtAvatar initials={initials(owner)} tone="gold" size={48} />
              <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.ink }}>
                <Text style={{ fontFamily: ptFont.bold }}>{owner}</Text> added you to the <Text style={{ fontFamily: ptFont.bold }}>{inv.business?.name}</Text> team.
              </Text>
            </View>
            <PtChip label={`You: ${inv.role_label}`} tone="brand" icon="circle" />
            <PtPanel>
              {inv.projects.length ? (
                <PtReviewRow label={inv.projects.length === 1 ? 'Project' : 'Projects'} value={inv.projects.map((p) => p.title).join(', ')} sub={inv.projects.map((p) => p.location).filter(Boolean).join(', ') || null} />
              ) : null}
              <PtReviewRow label="You can" value={inv.can} />
              <PtReviewRow label="You can't" value={inv.cannot} last />
            </PtPanel>
            <PtNote>{`You only see the projects ${owner.split(' ')[0]} gave you. Families see your name on the photos you upload.`}</PtNote>
          </>
        )}
      </ScrollView>
      {inv ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
          <PtButton title="Join the team" onPress={() => reply(true)} loading={answer.isPending} />
          <Pressable onPress={() => { selection(); setDeclining(true); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Decline</Text>
          </Pressable>
        </View>
      ) : null}
      <PtSheet
        visible={declining}
        title="Decline the invite?"
        subtitle={`${ownerFirst} will see that you declined. They can invite you again later.`}
        onClose={() => setDeclining(false)}
        footer={<PtButton title="Decline invite" loading={answer.isPending} onPress={() => reply(false)} style={{ backgroundColor: pt.danger }} />}
      >
        {reasons.map((r) => (
          <PtChoiceCard key={r} title={r} selected={reason === r} onPress={() => setReason(reason === r ? null : r)} />
        ))}
      </PtSheet>
    </View>
  );
}
