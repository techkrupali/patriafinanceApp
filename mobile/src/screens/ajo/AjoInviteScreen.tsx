import React, { useState } from 'react';
import { ActivityIndicator, Share, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtDivider, PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useAjo, useAjoActions, type AjoInvitee } from '../../api/ajo';
import { useFamily, useUserSearch } from '../../api/hooks';
import { formatNaira, initials } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * Invite people to a forming circle — by name or @tag, from the family, or by
 * sharing the code (TRS-03 "Join an ajo circle · With a code from the
 * organiser"). With replaceMemberId it asks someone to take a member's turn
 * (WPV-06 "Replace member").
 */
export function AjoInviteScreen({ navigation, route }: RootScreenProps<'AjoInvite'>) {
  const { walletId, replaceMemberId } = route.params;
  const q = useAjo(walletId);
  const actions = useAjoActions(walletId);
  const family = useFamily({ adults: true });
  const [search, setSearch] = useState('');
  const results = useUserSearch(search);
  const [busy, setBusy] = useState<string | null>(null);
  const a = q.data;

  if (!a) {
    return (
      <PtPageScreen title="Invite people" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const replacing = replaceMemberId ? a.members.find((m) => m.member_id === replaceMemberId) : null;
  const inCircle = new Set(a.members.map((m) => m.user_id));
  const invitedNames = new Set(a.invited.map((i) => i.name));
  const left = Math.max(0, a.size - a.joined);
  const phone = /^[+\d\s]{10,}$/.test(search.trim()) ? search.trim() : null;

  const send = (key: string, who: AjoInvitee, name: string) => {
    setBusy(key);
    const done = {
      onSuccess: () => {
        setBusy(null);
        notifySuccess();
        setSearch('');
        if (replacing) {
          showAlert('Invitation sent', `${name.split(' ')[0]} takes ${replacing.short}'s turn when they join.`);
          navigation.goBack();
        } else showAlert('Invitation sent', `${name.split(' ')[0]} will see it in Invitations.`);
      },
      onError: (e: Error) => {
        setBusy(null);
        showAlert('Not sent', e.message);
      },
    };
    if (replacing) actions.replace.mutate({ memberId: replacing.member_id, ...who }, done);
    else actions.invite.mutate(who, done);
  };

  const person = (key: string, name: string, sub: string, who: AjoInvitee, last: boolean) => {
    const already = typeof (who as { invitee_user_id?: number }).invitee_user_id === 'number' && inCircle.has((who as { invitee_user_id: number }).invitee_user_id);
    const asked = invitedNames.has(name);
    return (
      <React.Fragment key={key}>
        <Pressable
          onPress={() => { if (!already && !asked) { selection(); send(key, who, name); } }}
          accessibilityRole="button"
          accessibilityLabel={`Invite ${name}`}
          style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
        >
          <PtAvatar initials={initials(name)} tone="mint" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{name}</Text>
            {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>{sub}</Text> : null}
          </View>
          {busy === key ? <ActivityIndicator color={pt.brand} /> : already ? <PtChip label="In the circle" tone="success" icon="check" /> : asked ? <PtChip label="Invited" tone="warning" icon="clock" /> : <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Invite</Text>}
        </Pressable>
        {last ? null : <PtDivider />}
      </React.Fragment>
    );
  };

  const familyRows = (family.data?.members ?? []).filter((m) => !inCircle.has(m.id));
  const needle = search.trim().replace(/^@/, '').toLowerCase();
  // Family first when they match, then everyone else on Patriai.
  const familyFound = needle.length >= 2 ? familyRows.filter((m) => m.name.toLowerCase().includes(needle)) : [];
  const found = [
    ...familyFound.map((m) => ({ id: m.id, full_name: m.name, username: null as string | null, sub: 'Family' })),
    ...(results.data ?? []).filter((u) => !familyFound.some((f) => f.id === u.id)).map((u) => ({ id: u.id, full_name: u.full_name, username: u.username, sub: u.username ? `@${u.username}` : '' })),
  ];

  return (
    <PtPageScreen
      title={replacing ? `Replace ${replacing.short}` : 'Invite people'}
      subtitle={a.name}
      onBack={() => navigation.goBack()}
      footer={replacing ? undefined : <PtButton title="Done" onPress={() => navigation.replace('Ajo', { walletId })} />}
    >
      {replacing ? (
        <PtNote>{`They take ${replacing.short}'s turn${replacing.turn_label ? ` (${replacing.turn_label})` : ''} and pay from the next round. ${replacing.short} leaves the circle when they join.`}</PtNote>
      ) : (
        <>
          <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
            <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.inkMuted }}>{`${a.joined} of ${a.size} joined${left ? ` · ${left} to go` : ''}`}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Circle code</Text>
                <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, letterSpacing: 4, color: pt.ink }} selectable accessibilityLabel={`Circle code ${a.code.split('').join(' ')}`}>
                  {a.code}
                </Text>
              </View>
              <PtButton
                title="Share"
                variant="secondary"
                size="sm"
                onPress={() =>
                  void Share.share({
                    message: `Join ${a.name}, my ajo circle on Patriai. Open Patriai → Treasury → Add → Join an ajo circle, and use the code ${a.code}. Each person pays ${formatNaira(a.contribution)} ${a.frequency === 'weekly' ? 'every week' : 'every month'}, ${a.period_label}.`,
                  })
                }
              />
            </View>
          </View>
          <PtNote>Everyone must be verified to join. Patriai holds the pot, so nobody holds cash for the group.</PtNote>
        </>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingHorizontal: 14, backgroundColor: pt.raised }}>
        <Feather name="search" size={18} color={pt.inkMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Name, @tag or phone"
          placeholderTextColor={pt.inkSubtle}
          autoCapitalize="none"
          accessibilityLabel="Find someone to invite"
          style={{ flex: 1, paddingVertical: 14, fontFamily: ptFont.regular, fontSize: 16, color: pt.ink }}
        />
      </View>

      {search.trim().length >= 2 ? (
        <PtPanel>
          {results.isLoading && found.length === 0 ? <ActivityIndicator color={pt.brand} style={{ paddingVertical: 14 }} /> : null}
          {found.map((u, i) => person(`u${u.id}`, u.full_name, u.sub, { invitee_user_id: u.id }, i === found.length - 1 && !phone))}
          {phone ? person(`p${phone}`, phone, 'Invite by SMS', { identifier: phone }, true) : null}
          {!results.isLoading && found.length === 0 && !phone ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 14 }}>Nobody by that name. Try their @tag or phone number.</Text>
          ) : null}
        </PtPanel>
      ) : null}

      {familyRows.length && needle.length < 2 ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>From your family</PtGroupLabel>
          <PtPanel>{familyRows.map((m, i) => person(`f${m.id}`, m.name, m.verified ? 'Verified' : '', { invitee_user_id: m.id }, i === familyRows.length - 1))}</PtPanel>
        </View>
      ) : null}

      {!replacing && (a.joined > 0 || a.invited.length > 0) ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>In the circle</PtGroupLabel>
          <PtPanel>
            {a.members.map((m, i) => (
              <React.Fragment key={m.member_id}>
                <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{m.you ? `${m.short} (you)` : m.short}</Text>
                  <PtChip label={m.organiser ? 'Organiser' : 'Joined'} tone="success" icon="check" />
                </View>
                {i < a.members.length - 1 || a.invited.length ? <PtDivider /> : null}
              </React.Fragment>
            ))}
            {a.invited.map((inv, i) => (
              <React.Fragment key={`i${inv.id}`}>
                <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{inv.name}</Text>
                  <PtChip label="Invited" tone="warning" icon="clock" />
                </View>
                {i < a.invited.length - 1 ? <PtDivider /> : null}
              </React.Fragment>
            ))}
          </PtPanel>
        </View>
      ) : null}
    </PtPageScreen>
  );
}
