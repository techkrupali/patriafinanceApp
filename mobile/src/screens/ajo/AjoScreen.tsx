import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtDivider, PtGroupLabel, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { ViewingAs, ProjectRoleSheet } from '../../components/project/ProjectRoleViews';
import { Stat, Tile } from '../../components/savings/CoSaverView';
import { AjoOrganiserCard, AjoRoundCard, AjoStatusChip, AjoTurnCard, useAjoPay } from '../../components/ajo/AjoUi';
import { useAjo, useAjoActions, type AjoDetail, type AjoMemberRow } from '../../api/ajo';
import { formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const SHOWN = 5;

/**
 * AJO-03 a member's circle ("Round 1 of 12 · November", your turn, Pay this
 * round, Ask to swap, Circle chat, this round's members), WPV-06 the
 * organiser's ("You organise this circle": late and due, Remind all, Swap
 * turns, Replace member, Edit rules, and "Take the pot" that isn't there), and
 * a circle that's still forming.
 */
export function AjoScreen({ navigation, route }: RootScreenProps<'Ajo'>) {
  const { walletId } = route.params;
  const q = useAjo(walletId);
  const actions = useAjoActions(walletId);
  const a = q.data;
  const pay = useAjoPay(a);
  const [all, setAll] = useState(false);
  const [role, setRole] = useState(false);
  const [member, setMember] = useState<AjoMemberRow | null>(null);
  const [replace, setReplace] = useState(false);

  if (!a) {
    return (
      <PtPageScreen title="Ajo circle" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const organiser = a.role === 'organiser';
  const chat = () => (a.conversation_id ? navigation.navigate('Conversation', { conversationId: a.conversation_id }) : showAlert('Circle chat', 'The chat opens once people join.'));
  const remindAll = () =>
    actions.remind.mutate(undefined, {
      onSuccess: (r) => { notifySuccess(); showAlert(r.sent ? 'Reminded' : 'Everyone has paid', r.sent ? `${r.sent} ${r.sent === 1 ? 'person' : 'people'} will get a reminder.` : undefined); },
      onError: (e) => showAlert('Not sent', e.message),
    });
  const subtitle = a.status === 'forming' ? `${a.joined} of ${a.size} joined · ${formatNaira(a.contribution)} ${a.frequency === 'weekly' ? 'weekly' : 'monthly'}` : organiser ? 'You organise this circle' : `${a.size} members · ${formatNaira(a.contribution)} ${a.frequency === 'weekly' ? 'weekly' : 'monthly'}`;

  const dueBanner = pay.due ? (
    <Pressable
      onPress={() => { selection(); if (pay.due?.late || (pay.due?.days_late ?? 0) > 0) navigation.navigate('AjoMissed', { walletId }); else pay.open(); }}
      accessibilityRole="button"
      style={{ backgroundColor: pay.due.days_late > 0 ? pt.dangerSoft : '#FDEBC8', borderRadius: ptRadius.md, padding: 14, gap: 4 }}
    >
      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pay.due.days_late > 0 ? pt.danger : '#8F5400' }}>
        {pay.due.days_late > 0 ? `${pay.due.month}'s ${formatNaira(pay.due.amount)} is ${pay.due.days_late} day${pay.due.days_late === 1 ? '' : 's'} late` : `Your ${formatNaira(pay.due.amount)} for ${pay.due.month} is due`}
      </Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.ink }}>
        {pay.due.late ? `Pay ${formatNaira(pay.due.total)} with the late fee.` : parseFloat(pay.due.late_fee) > 0 ? `Pay before ${pay.due.fee_from} to avoid the ${formatNaira(pay.due.late_fee)} late fee.` : 'Pay it from the circle.'}
      </Text>
    </Pressable>
  ) : null;

  const swapsIn = a.me?.swaps_in.length ? (
    <View style={{ gap: 10 }}>
      {a.me.swaps_in.map((s) => (
        <View key={s.id} style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 10 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: pt.ink }}>
            <Text style={{ fontFamily: ptFont.bold }}>{s.name}</Text>
            {` asks to swap: their ${s.turn_label} for your ${a.me?.turn_label}.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PtButton title="Keep my turn" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => actions.respondSwap.mutate({ swapId: s.id, accept: false }, { onError: (e) => showAlert('Not changed', e.message) })} />
            <PtButton title="Swap" size="sm" style={{ flex: 1 }} onPress={() => actions.respondSwap.mutate({ swapId: s.id, accept: true }, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Not swapped', e.message) })} />
          </View>
        </View>
      ))}
    </View>
  ) : null;

  const autoPay = a.me ? (
    <PtPanel>
      <PtSwitchRow
        title={`Pay automatically from ${a.me.pay_from.replace(/\s+wallet$/i, '')}`}
        subtitle={a.me.auto_pay ? a.pay_day_label : 'Off: you pay each round yourself'}
        value={a.me.auto_pay}
        onChange={(v) => actions.autoPay.mutate(v, { onError: (e) => showAlert('Not changed', e.message) })}
      />
    </PtPanel>
  ) : null;

  // ---------------------------------------------------------------- forming
  if (a.status === 'forming' || a.status === 'cancelled') {
    return (
      <PtPageScreen title={a.name} subtitle={a.status === 'cancelled' ? 'Cancelled' : subtitle} onBack={() => navigation.goBack()}>
        {a.status === 'cancelled' ? <PtNote>This circle was cancelled before it started. No money moved.</PtNote> : null}
        <PtPanel>
          <PtReviewRow label="Each person pays" value={`${formatNaira(a.contribution)} ${a.frequency === 'weekly' ? 'every week' : 'every month'}`} sub={a.period_label} />
          <PtReviewRow label="Each payout" value={formatNaira(a.payout_amount)} sub={`${a.size} × ${formatNaira(a.contribution)}`} />
          <PtReviewRow label="Late fee" value={a.late_fee_label} last={a.status !== 'forming'} />
          {a.status === 'forming' ? <PtReviewRow label="Circle code" value={a.code} sub="Share it so people can join" last /> : null}
        </PtPanel>
        {a.status === 'forming' ? (
          organiser ? (
            <>
              <PtButton title="Invite people" variant="secondary" onPress={() => navigation.navigate('AjoInvite', { walletId })} />
              <PtButton title="Set the order and start" disabled={a.joined < 2} onPress={() => navigation.navigate('AjoOrder', { walletId })} />
              {a.joined < 2 ? <PtNote>At least 2 people need to join before it starts.</PtNote> : null}
            </>
          ) : (
            <PtNote>{`Waiting for ${a.organiser.first_name ?? 'the organiser'} to start the circle. ${a.order_mode === 'agreed' ? 'They set the order with everyone.' : 'Your turn is set by a draw when it starts.'}`}</PtNote>
          )
        ) : null}
        <View style={{ gap: 10 }}>
          <PtGroupLabel>{`Joined · ${a.joined} of ${a.size}`}</PtGroupLabel>
          <PtPanel>
            {a.members.map((m, i) => (
              <React.Fragment key={m.member_id}>
                <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{m.you ? `${m.short.split(' ')[0]} (you)` : m.short}</Text>
                  {m.organiser ? <AjoStatusChip label="Organiser" tone="success" /> : null}
                </View>
                {i < a.members.length - 1 ? <PtDivider /> : null}
              </React.Fragment>
            ))}
          </PtPanel>
        </View>
        {a.status === 'forming' ? autoPay : null}
        {a.status === 'forming' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="message-square" label="Circle chat" onPress={chat} />
            {organiser ? <Tile icon="shield" label="Edit rules" onPress={() => navigation.navigate('AjoSetup', { walletId })} /> : null}
          </View>
        ) : null}
        {organiser && a.status === 'forming' ? (
          <PtButton
            title="Cancel the circle"
            variant="ghost"
            onPress={() =>
              showAlert('Cancel this circle?', 'Nobody has paid yet, so no money moves. Everyone who joined is told.', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel the circle', onPress: () => actions.cancel.mutate(undefined, { onError: (e) => showAlert('Not cancelled', e.message) }) },
              ])
            }
          />
        ) : null}
      </PtPageScreen>
    );
  }

  // ------------------------------------------------------------ this round
  const roundRows = [...a.members]
    .filter((m) => m.round_status)
    .sort((x, y) => (x.round_status?.label === 'Paid' ? 0 : 1) - (y.round_status?.label === 'Paid' ? 0 : 1) || (x.position ?? 0) - (y.position ?? 0));
  const shown = all ? roundRows : roundRows.slice(0, SHOWN);
  const roundList = roundRows.length ? (
    <View style={{ gap: 10 }}>
      <PtGroupLabel>This round</PtGroupLabel>
      <PtPanel>
        {shown.map((m, i) => (
          <React.Fragment key={m.member_id}>
            <Pressable
              onPress={() => (organiser && !m.you ? setMember(m) : undefined)}
              disabled={!organiser || m.you}
              accessibilityRole="button"
              style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{m.you ? `${m.short.split(' ')[0]} (you)` : m.short}</Text>
              {m.round_status ? <AjoStatusChip label={m.round_status.label} tone={m.round_status.tone} /> : null}
            </Pressable>
            {i < shown.length - 1 || (!all && roundRows.length > SHOWN) ? <PtDivider /> : null}
          </React.Fragment>
        ))}
        {!all && roundRows.length > SHOWN ? (
          <Pressable onPress={() => setAll(true)} accessibilityRole="button" style={{ minHeight: 48, justifyContent: 'center' }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{`+ ${roundRows.length - SHOWN} more members`}</Text>
          </Pressable>
        ) : null}
      </PtPanel>
    </View>
  ) : null;

  const completed = a.status === 'completed' ? <PtNote tone="success">Everyone has had their turn. The circle is complete.</PtNote> : null;

  // ---------------------------------------------------------------- WPV-06
  if (organiser) {
    const owing = a.members.filter((m) => m.round_status && m.round_status.tone !== 'success' && !m.you);
    const replaceable = a.members.filter((m) => m.can_replace);
    return (
      <PtPageScreen title={a.name} subtitle={subtitle} onBack={() => navigation.goBack()}>
        <ViewingAs role="Organiser" tone="gold" onWhat={() => setRole(true)} />
        {completed}
        <AjoOrganiserCard ajo={a} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat label="Late" value={String(a.stats.late)} />
          <Stat label="Due today" value={String(a.stats.due_today)} />
          <Stat label="Fees collected" value={formatNaira(a.stats.fees_collected)} />
        </View>
        {owing.length ? (
          <PtPanel>
            {owing.map((m, i) => (
              <PtReviewRow
                key={m.member_id}
                label={m.short}
                value={m.round_status?.tone === 'danger' && parseFloat(m.owes) > parseFloat(a.contribution) ? `${m.round_status.label} · ${formatNaira(m.owes)} with fee` : m.round_status?.label ?? ''}
                onEdit={() => setMember(m)}
                last={i === owing.length - 1}
              />
            ))}
          </PtPanel>
        ) : null}
        {dueBanner}
        {swapsIn}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="bell" label="Remind all" onPress={remindAll} />
            <Tile icon="shuffle" label="Swap turns" onPress={() => navigation.navigate('AjoOrder', { walletId })} />
            <Tile icon="message-square" label="Circle chat" onPress={chat} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile
              icon="users"
              label="Replace member"
              disabled={replaceable.length === 0}
              why="You can replace someone whose turn hasn't come and who hasn't paid in yet."
              onPress={() => setReplace(true)}
            />
            <Tile icon="shield" label="Edit rules" onPress={() => navigation.navigate('AjoSetup', { walletId })} />
            <Tile icon="lock" label="Take the pot" disabled why="Organisers can't touch the pot. Patriai pays each turn automatically." />
          </View>
        </View>
        <PtNote icon="lock">Organisers can't touch the pot. Patriai pays each turn automatically.</PtNote>
        <AjoTurnCard ajo={a} />
        {autoPay}
        <PtPanel>
          <PtReviewRow label="Payout order" value={`${a.size} turns · ${a.period_label}`} onEdit={() => navigation.navigate('AjoOrder', { walletId })} />
          <PtReviewRow label="Circle code" value={a.code} last />
        </PtPanel>
        {roundList}

        <ProjectRoleSheet
          visible={role}
          title="You're the organiser"
          owner="You"
          note="You started this circle. Patriai holds the pot."
          can={['Invite and replace members', 'Remind everyone who owes', 'Change the late fee and swaps', 'See who has paid each round', 'Chat with the circle']}
          cannot={['Take money from the pot', 'Change the amount once it starts', "Move someone's turn without them agreeing"]}
          onClose={() => setRole(false)}
        />
        <PtSheet visible={Boolean(member)} title={member?.short ?? ''} subtitle={member?.round_status?.label} onClose={() => setMember(null)}>
          {member ? (
            <View style={{ gap: 10 }}>
              <PtPanel>
                <PtReviewRow label="Owes" value={parseFloat(member.owes) > 0 ? formatNaira(member.owes) : 'Nothing'} sub={member.missed ? `Missed ${member.missed} of 3 · then they lose their turn` : undefined} />
                <PtReviewRow label="Turn" value={member.turn_label ?? '—'} sub={member.received ? 'Paid out' : member.status === 'lost_turn' ? 'Lost their turn' : undefined} last />
              </PtPanel>
              <PtButton title="Remind all who owe" variant="secondary" onPress={() => { setMember(null); remindAll(); }} />
              {member.can_replace ? <PtButton title={`Replace ${member.short.split(' ')[0]}`} variant="ghost" onPress={() => { const id = member.member_id; setMember(null); navigation.navigate('AjoInvite', { walletId, replaceMemberId: id }); }} /> : null}
            </View>
          ) : null}
        </PtSheet>
        <PtSheet visible={replace} title="Replace member" subtitle="Someone whose turn hasn't come and who hasn't paid in" onClose={() => setReplace(false)}>
          <PtPanel>
            {replaceable.map((m, i) => (
              <PtReviewRow key={m.member_id} label={m.turn_label ?? ''} value={m.short} onEdit={() => { setReplace(false); navigation.navigate('AjoInvite', { walletId, replaceMemberId: m.member_id }); }} last={i === replaceable.length - 1} />
            ))}
          </PtPanel>
        </PtSheet>
        {pay.sheet}
      </PtPageScreen>
    );
  }

  // ---------------------------------------------------------------- AJO-03
  return (
    <PtPageScreen title={a.name} subtitle={subtitle} onBack={() => navigation.goBack()}>
      {completed}
      <AjoRoundCard ajo={a} />
      <AjoTurnCard ajo={a} />
      {dueBanner}
      {swapsIn}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Tile icon="send" label="Pay this round" disabled={!pay.due} why="You're all paid up for now." onPress={() => (pay.due?.late ? navigation.navigate('AjoMissed', { walletId }) : pay.open())} />
        <Tile
          icon="shuffle"
          label="Ask to swap"
          disabled={!a.allow_swaps || a.status !== 'active'}
          why={a.allow_swaps ? 'The circle has ended.' : "This circle doesn't allow swaps."}
          onPress={() => navigation.navigate('AjoOrder', { walletId })}
        />
        <Tile icon="message-square" label="Circle chat" onPress={chat} />
      </View>
      {roundList}
      {autoPay}
      <PtPanel>
        <PtReviewRow label="Payout order" value={`${a.size} turns · ${a.period_label}`} onEdit={() => navigation.navigate('AjoOrder', { walletId })} />
        <PtReviewRow label="Organiser" value={a.organiser.name ?? '—'} />
        <PtReviewRow label="Late fee" value={a.late_fee_label} sub="Miss 3 rounds and you lose your turn" last />
      </PtPanel>
      <PtNote icon="lock">Patriai holds the pot and pays out on the day, so nobody holds cash for the group.</PtNote>
      {pay.sheet}
    </PtPageScreen>
  );
}

export type { AjoDetail };
