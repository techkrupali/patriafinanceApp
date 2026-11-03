import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useCircleMember, useRemoveMember, useRemovePreview, type ActivityItem } from '../../api/circles';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** "Today, 9:12 am", "Yesterday", "20 Oct". */
export function activityWhen(iso: string, withTime = true): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', ' ');
  if (days === 0) return withTime ? `Today, ${time}` : 'Today';
  if (days === 1) return withTime ? `Yesterday, ${time}` : 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A line of activity with the round arrow tile (FAM-07 "Recent"). */
export function ActivityLine({ item, last }: { item: ActivityItem; last: boolean }) {
  const credit = item.direction === 'credit';
  const icon = item.kind === 'money' ? (credit ? 'arrow-down-left' : 'arrow-up-right') : item.kind === 'approvals' ? 'check-circle' : item.kind === 'people' ? 'user' : 'sliders';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: credit ? pt.brandSoft : pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={18} color={credit ? pt.brand : pt.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 15, lineHeight: 21, color: pt.ink }}>{item.text}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{activityWhen(item.at)}</Text>
      </View>
      {item.amount ? <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: credit ? pt.brand : pt.ink }}>{item.amount}</Text> : null}
    </View>
  );
}

/**
 * FAM-07 "Emeka Okafor · Co-owner · joined 12 Mar 2026": verified tier and
 * phone, each wallet with their role and what they put in, what they did
 * lately; "Edit role and permissions" (FAM-08) and "Remove from circle" (FAM-09).
 */
export function CircleMemberScreen({ navigation, route }: RootScreenProps<'CircleMember'>) {
  const { circleId, userId } = route.params;
  const q = useCircleMember(circleId, userId);
  const [removing, setRemoving] = useState(false);
  const preview = useRemovePreview(circleId, userId, removing);
  const remove = useRemoveMember(circleId, userId);
  const d = q.data;

  if (!d) {
    return (
      <PtPageScreen title="Member" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const p = preview.data;
  const first = d.person.first_name;

  return (
    <PtPageScreen
      title={d.person.name}
      subtitle={`${d.role_label} · joined ${d.joined}`}
      onBack={() => navigation.goBack()}
      right={
        d.can_edit_role ? (
          <Pressable onPress={() => { selection(); navigation.navigate('EditCircleRole', { circleId, userId }); }} accessibilityRole="button" accessibilityLabel="Edit role" hitSlop={8} style={{ padding: 6 }}>
            <Feather name="edit-2" size={22} color={pt.ink} />
          </Pressable>
        ) : undefined
      }
      footer={
        d.can_edit_role || d.can_manage ? (
          <>
            {d.can_edit_role ? <PtButton title="Edit role and permissions" onPress={() => navigation.navigate('EditCircleRole', { circleId, userId })} /> : null}
            {d.can_manage ? <PtButton title="Remove from circle" variant="ghost" onPress={() => setRemoving(true)} /> : null}
          </>
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <PtAvatar initials={d.person.initials} uri={d.person.avatar_url} size={64} tone="mint" />
        <View style={{ flex: 1, gap: 6, alignItems: 'flex-start' }}>
          <PtChip label={d.role_label} tone="brand" icon="circle" />
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{d.identity}</Text>
        </View>
      </View>

      <PtGroupLabel>Wallets and roles</PtGroupLabel>
      {d.wallets.length ? (
        <PtPanel>
          {d.wallets.map((w, i) => (
            <PtReviewRow
              key={w.wallet_id}
              label={w.wallet_name}
              value={w.line}
              sub={w.put_in}
              last={i === d.wallets.length - 1}
            />
          ))}
        </PtPanel>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{`You don't share a wallet with ${first} here.`}</Text>
      )}

      {d.recent.length ? (
        <>
          <PtGroupLabel>Recent</PtGroupLabel>
          <PtPanel>
            {d.recent.slice(0, 6).map((item, i, all) => (
              <ActivityLine key={item.id} item={item} last={i === all.length - 1} />
            ))}
          </PtPanel>
        </>
      ) : null}

      {/* FAM-09 "Remove Aunty Ada?" */}
      <PtSheet
        visible={removing}
        title={`Remove ${first}?`}
        subtitle={`${first} stops seeing the ${p?.circle ?? 'family'} wallets. We'll let ${first} know.`}
        onClose={() => setRemoving(false)}
        footer={
          <>
            <PtButton
              title={`Remove ${first}`}
              variant="danger"
              disabled={!p}
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(undefined, {
                  onSuccess: (r) => {
                    notifySuccess();
                    setRemoving(false);
                    showAlert(`${first} was removed`, r.kept.length ? r.kept.map((k) => `${k.wallet}: ${k.reason}`).join('\n') : `What ${first} put in stays in the wallets.`);
                    navigation.goBack();
                  },
                  onError: (e) => showAlert('Not removed', e.message),
                })
              }
            />
            <PtButton title="Cancel" variant="ghost" onPress={() => setRemoving(false)} />
          </>
        }
      >
        {p ? (
          <View style={{ gap: 12 }}>
            <PtPanel>
              {p.contributions ? <PtReviewRow label={`${first}'s contributions`} value={p.contributions.total} sub={p.contributions.detail} /> : null}
              <PtReviewRow label="Wallets affected" value={p.wallets.length ? p.wallets.join(', ') : 'None you own'} last={!p.keyholder} />
              {p.keyholder ? <PtReviewRow label="Emergency fund" value="Needs a new keyholder" sub={`You have ${p.keyholder.days} days to pick someone`} last /> : null}
            </PtPanel>
            {p.kept.length ? <PtNote tone="info">{`${first} stays in ${p.kept.map((k) => k.wallet).join(', ')}. ${p.kept[0].reason}`}</PtNote> : null}
          </View>
        ) : (
          <LoadingBlock error={preview.error ? (preview.error as Error).message : null} onRetry={() => void preview.refetch()} />
        )}
      </PtSheet>
    </PtPageScreen>
  );
}
