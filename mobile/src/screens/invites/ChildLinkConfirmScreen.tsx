import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useChildLinkRequest, useDecideChildLink } from '../../api/invites';
import { agoLabel, initials } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * INV-CH3 on the parent's phone: "Link this phone to Kamsi?" — which phone and
 * when, what Kamsi will see, and "Only say yes if Kamsi is with you right now."
 */
/** "just now", "4 min ago": the child is waiting, so minutes matter here. */
function whenLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  return agoLabel(iso);
}

export function ChildLinkConfirmScreen({ navigation, route }: RootScreenProps<'ChildLinkConfirm'>) {
  const { requestId } = route.params;
  const q = useChildLinkRequest(requestId);
  const decide = useDecideChildLink(requestId);
  const r = q.data;

  if (!r) {
    return (
      <PtPageScreen title="Link a phone" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  const open = r.status === 'pending';
  const answer = (approve: boolean) =>
    decide.mutate(approve, {
      onSuccess: () => {
        notifySuccess();
        showAlert(approve ? `${r.child} can set their PIN now` : 'Stopped', approve ? `Once ${r.child} makes a PIN, the phone is linked.` : `That phone can't link. Show ${r.child} a new code when they're with you.`);
        navigation.goBack();
      },
      onError: (e) => showAlert('Not answered', e.message),
    });

  return (
    <PtPageScreen
      title="Link a phone"
      onBack={() => navigation.goBack()}
      footer={
        open ? (
          <>
            <PtButton title={`Yes, link ${r.child}'s phone`} loading={decide.isPending} onPress={() => answer(true)} />
            <PtButton title={`This isn't ${r.child}`} variant="ghost" onPress={() => answer(false)} />
          </>
        ) : (
          <PtButton title="Close" variant="secondary" onPress={() => navigation.goBack()} />
        )
      }
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <PtAvatar initials={initials(r.child_name)} tone="gold" size={72} />
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">{`Link this phone to ${r.child}?`}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center' }}>{`A phone typed ${r.child}'s code and is waiting for you.`}</Text>
      </View>
      <PtPanel>
        <PtReviewRow label="Phone" value={r.device ?? 'A phone'} />
        <PtReviewRow label="When" value={whenLabel(r.asked_at)} />
        <PtReviewRow label={`${r.child} will see`} value={r.will_see} last />
      </PtPanel>
      {open ? (
        <PtNote tone="attention">{`Only say yes if ${r.child} is with you right now.`}</PtNote>
      ) : (
        <PtNote>{r.status === 'expired' ? 'This request has expired. Ask them to type the code again.' : 'This was already answered.'}</PtNote>
      )}
    </PtPageScreen>
  );
}
