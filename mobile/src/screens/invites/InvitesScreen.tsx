import React, { useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useQueryClient } from '@tanstack/react-query';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtDivider, PtPanel, PtPills } from '../../components/pt/PtForm';
import { useCancelInvitation, useResendInvitation } from '../../api/hooks';
import { useResendAllInvites, useSentInvites, type SentInvite, type SentTab } from '../../api/invites';
import { useAuth } from '../../store/auth';
import { agoLabel, initials } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** FAM-05 Invites: Waiting / Accepted / Expired, where each one is, Resend all. */
export function InvitesScreen({ navigation }: RootScreenProps<'Invites'>) {
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState<SentTab>('waiting');
  const q = useSentInvites(tab);
  const resendAll = useResendAllInvites();
  const resend = useResendInvitation();
  const [open, setOpen] = useState<SentInvite | null>(null);
  const cancel = useCancelInvitation(open?.wallet_id ?? 0);
  const surname = (me?.last_name || me?.full_name?.split(' ').slice(-1)[0] || 'Your').trim();
  const rows = q.data ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['invites-sent'] });

  return (
    <PtPageScreen
      title="Invites"
      subtitle={`${surname} family`}
      onBack={() => navigation.goBack()}
      footer={
        <>
          {tab === 'waiting' && rows.length ? (
            <PtButton
              title="Resend all"
              variant="secondary"
              loading={resendAll.isPending}
              onPress={() => resendAll.mutate(undefined, { onSuccess: (r) => { notifySuccess(); showAlert(r.sent ? 'Sent again' : 'Nothing to resend', r.sent ? `${r.sent} invite${r.sent === 1 ? '' : 's'} with a fresh week each.` : 'They were all sent in the last minute.'); }, onError: (e) => showAlert('Not sent', e.message) })}
            />
          ) : null}
          <PtButton title="Invite someone" onPress={() => navigation.navigate('InviteRole')} />
        </>
      }
    >
      <PtPills
        solid
        compact
        options={[
          { value: 'waiting', label: 'Waiting' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'expired', label: 'Expired' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as SentTab)}
      />
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : rows.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 24 }}>
          {tab === 'waiting' ? 'No invites waiting.' : tab === 'accepted' ? 'Nobody has joined from an invite yet.' : 'No expired or declined invites.'}
        </Text>
      ) : (
        <PtPanel>
          {rows.map((r, i) => (
            <React.Fragment key={r.id}>
              {i > 0 ? <PtDivider /> : null}
              <Pressable
                onPress={() => { selection(); setOpen(r); }}
                accessibilityRole="button"
                accessibilityLabel={`${r.name}, ${r.chip.label}`}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
              >
                {/* A number we haven't matched to a person yet has no initials. */}
                <PtAvatar initials={/[A-Za-z]/.test(r.name) ? initials(r.name) : '#'} tone={r.status === 'accepted' ? 'mint' : 'dashed'} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={2}>
                    {[r.role_label, r.wallet_name, r.decline_reason ? `"${r.decline_reason}"` : `sent ${agoLabel(r.sent_at)}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={{ justifyContent: 'center' }}>
                  <PtChip label={r.chip.label} tone={r.chip.tone} />
                </View>
              </Pressable>
            </React.Fragment>
          ))}
        </PtPanel>
      )}

      <PtSheet visible={Boolean(open)} title={open?.name ?? ''} subtitle={open ? `${open.role_label} · ${open.wallet_name ?? ''}` : undefined} onClose={() => setOpen(null)}>
        {open ? (
          <View style={{ gap: 10 }}>
            {open.link && open.status === 'pending' ? (
              <PtButton title="Share the invite link" variant="secondary" onPress={() => void Share.share({ message: `Join ${open.wallet_name} on Patriai: ${open.link}` })} />
            ) : null}
            {open.status === 'pending' || open.status === 'expired' ? (
              <PtButton
                title="Resend"
                variant="secondary"
                loading={resend.isPending}
                onPress={() =>
                  resend.mutate({ walletId: open.wallet_id, invitationId: open.id }, {
                    onSuccess: () => { notifySuccess(); setOpen(null); refresh(); showAlert('Sent again', `${open.name} has another 7 days to join.`); },
                    onError: (e) => showAlert('Not sent', e.message),
                  })
                }
              />
            ) : null}
            {open.status === 'pending' ? (
              <PtButton
                title="Cancel this invite"
                variant="ghost"
                onPress={() =>
                  showAlert('Cancel this invite?', `${open.name} won't be able to join ${open.wallet_name ?? 'the wallet'}.`, [
                    { text: 'Keep it', style: 'cancel' },
                    { text: 'Cancel invite', onPress: () => cancel.mutate(open.id, { onSuccess: () => { setOpen(null); refresh(); }, onError: (e) => showAlert('Not cancelled', e.message) }) },
                  ])
                }
              />
            ) : null}
          </View>
        ) : null}
      </PtSheet>
    </PtPageScreen>
  );
}
