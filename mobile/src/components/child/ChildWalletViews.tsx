import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtRing } from '../pt/PtRing';
import { PtButton } from '../pt/PtButton';
import { PtField } from '../pt/PtField';
import { PtGroupLabel, PtNote, PtReviewRow } from '../pt/PtForm';
import { PtSheet } from '../pt/PtSheet';
import { RoleSheet } from '../wallet/RoleSheet';
import { useChildNote, useChildView, type ChildView } from '../../api/child';
import { useChildLinkCode, useRespondApproval, useWalletLock } from '../../api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../store/auth';
import { formatNaira, initials } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Wallet, WalletDetailData } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

const AGES: Record<string, string> = { under_6: 'under 6', '6_9': '6 to 9', '10_12': '10 to 12', '13_15': '13 to 15', '16_17': '16 to 17' };
const EVERY: Record<string, string> = { weekly: 'every Monday', biweekly: 'every 2 weeks', monthly: 'every month' };

/** "Child · age 13 to 15" · "Shared with you by Ngozi" */
export function childSubtitle(v: ChildView | undefined, owner: string): string {
  if (!v) return 'Child';
  return v.role === 'relative' ? `Shared with you by ${owner}` : `Child · age ${AGES[v.age_band] ?? v.age_band}`;
}

/** "₦5,000 every Monday · ₦2,000 a day limit" */
function rulesLine(v: ChildView): string {
  const day = v.allowance?.starts_on ? new Date(v.allowance.starts_on).toLocaleDateString('en-GB', { weekday: 'long' }) : 'Monday';
  const every = v.allowance?.frequency === 'weekly' ? `every ${day}` : EVERY[v.allowance?.frequency ?? 'weekly'];
  return [parseFloat(v.allowance?.amount ?? '0') > 0 ? `${formatNaira(v.allowance?.amount)} ${every}` : null, `${formatNaira(v.daily_limit)} a day limit`].filter(Boolean).join(' · ');
}

function Tile({ icon, label, onPress, disabled, why }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress?: () => void; disabled?: boolean; why?: string }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        if (disabled) return why ? showAlert(label, why) : undefined;
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ flex: 1, minHeight: 104, borderRadius: ptRadius.md, backgroundColor: disabled ? pt.sunken : pt.raised, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}
    >
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: disabled ? pt.raised : pt.emerald700, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={disabled ? 'lock' : icon} size={22} color={disabled ? pt.inkMuted : '#FFFFFF'} />
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: disabled ? pt.inkMuted : pt.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function ViewingAs({ me, title, onWhat }: { me: string; title: string; onWhat: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.emerald300, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.emerald900 }}>{initials(me)}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, lineHeight: 20, color: pt.ink }}>
        {"You're viewing as "}
        <Text style={{ fontFamily: ptFont.bold }}>{me.split(' ')[0]}</Text>
        {` · ${title}`}
      </Text>
      <Pressable onPress={onWhat} accessibilityRole="button" hitSlop={8}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>What can I do?</Text>
      </Pressable>
    </View>
  );
}

/** One ask: approve or decline it here (CHD-09 "Waiting for you", WPV-04 "Kamsi asked"). */
function Ask({ ask, walletId, compact }: { ask: NonNullable<ChildView['asks']>[number]; walletId: number; compact?: boolean }) {
  const respond = useRespondApproval(ask.id);
  const qc = useQueryClient();
  const answer = (decision: 'approve' | 'reject') =>
    respond.mutate(
      { decision } as never,
      {
        onSuccess: () => {
          notifySuccess();
          void qc.invalidateQueries({ queryKey: ['child-view', walletId] });
        },
        onError: (e) => showAlert('Not done', e.message),
      },
    );
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
      {compact ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`${ask.by ?? 'They'} asked`}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{compact ? `${formatNaira(ask.amount)} for ${ask.title.charAt(0).toLowerCase()}${ask.title.slice(1)}` : ask.title}</Text>
        {compact ? null : <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{formatNaira(ask.amount)}</Text>}
      </View>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{ask.needs}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PtButton title="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => answer('reject')} loading={respond.isPending && respond.variables?.decision === 'reject'} />
        <PtButton title="Approve" style={{ flex: 1 }} onPress={() => answer('approve')} loading={respond.isPending && respond.variables?.decision === 'approve'} />
      </View>
    </View>
  );
}

/**
 * The child wallet, by who's looking: CHD-09 a parent (balance, what's waiting,
 * tasks), WPV-04 a co-parent (approve, send extra, set a task, change limits,
 * pause), WPV-05 a relative — gifts only: the goal, send a gift or a note.
 */
export function ChildWalletView({ wallet, detail }: { wallet: Wallet; detail: WalletDetailData }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const q = useChildView(wallet.id);
  const note = useChildNote(wallet.id);
  const lock = useWalletLock(wallet.id);
  const linkCode = useChildLinkCode();
  const [code, setCode] = useState<string | null>(null);
  const [role, setRole] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [message, setMessage] = useState('');
  const v = q.data;
  if (q.isLoading) return <ActivityIndicator color={pt.brand} />;
  if (!v) return null;
  const myName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim();
  const owner = v.parents[0]?.first_name ?? 'The owner';
  const kid = v.first_name;
  const goal = v.goal;

  const roleSheet = (
    <RoleSheet
      visible={role}
      wallet={wallet}
      role={detail.my_role}
      ownerFirst={owner}
      canFund
      canSpend={v.role !== 'relative'}
      canApprove={Boolean(v.can_approve)}
      onClose={() => setRole(false)}
    />
  );

  // WPV-05 a relative: gifts only.
  if (v.role === 'relative') {
    return (
      <View style={{ gap: 16 }}>
        <ViewingAs me={myName} title="Relative · gifts only" onWhat={() => setRole(true)} />
        {goal ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <PtRing percent={goal.percent} size={150} stroke={14} caption={goal.name.split(' ').slice(-1)[0].toLowerCase()} />
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink, textAlign: 'center' }}>{`${kid} is saving for ${goal.name.toLowerCase().replace(/^new /, 'a ')}`}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, color: pt.inkMuted }}>{`${formatNaira(goal.saved)} of ${formatNaira(goal.target)}`}</Text>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="gift" label="Send a gift" disabled={!v.gifts} why={`${owner} turned gifts off.`} onPress={() => navigation.navigate('ChildGift', { walletId: wallet.id, into: 'wallet' })} />
            <Tile icon="arrow-down" label={goal ? `Add to the ${goal.name.split(' ').slice(-1)[0].toLowerCase()}` : 'Add to the goal'} disabled={!goal || !v.gifts} why="There's no goal yet." onPress={() => navigation.navigate('ChildGift', { walletId: wallet.id, into: 'goal' })} />
            <Tile icon="message-square" label="Send a note" onPress={() => setNoteOpen(true)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="eye" label="See spending" disabled why={`Only ${v.parents.map((p) => p.first_name).join(' and ')} see what ${kid} spends.`} />
            <Tile icon="credit-card" label="Balance" disabled why={`The balance is for ${kid}'s parents.`} />
            <Tile icon="check" label="Approve" disabled why={`${kid}'s parents approve requests.`} />
          </View>
        </View>
        <PtNote tone="info" icon="gift">{`${v.parents.map((p) => p.first_name).join(' and ')} see your gifts. ${kid} gets a note saying it's from ${myName.split(' ')[0]}.`}</PtNote>
        {roleSheet}
        <PtSheet
          visible={noteOpen}
          title={`A note for ${kid}`}
          subtitle="It shows in their app"
          onClose={() => setNoteOpen(false)}
          footer={
            <PtButton
              title="Send note"
              disabled={!message.trim()}
              loading={note.isPending}
              onPress={() => note.mutate(message.trim(), { onSuccess: () => { notifySuccess(); setNoteOpen(false); setMessage(''); showAlert('Sent', `${kid} will see it.`); }, onError: (e) => showAlert('Not sent', e.message) })}
            />
          }
        >
          <PtField label="Note" value={message} onChangeText={setMessage} placeholder="Well done on your saving!" maxLength={200} />
        </PtSheet>
      </View>
    );
  }

  const asks = v.asks ?? [];
  const pause = () =>
    (v.paused ? lock.unfreeze : lock.freeze).mutate(undefined, {
      onSuccess: () => {
        notifySuccess();
        void q.refetch();
        showAlert(v.paused ? 'Spending is back on' : 'Spending is paused', v.paused ? `${kid} can spend again.` : `${kid} can't spend until you turn it back on. Money can still come in.`);
      },
      onError: (e) => showAlert('Not changed', e.message),
    });

  // CHW-06 linking later: a fresh code for the child's phone, good for 10 minutes.
  const link = !v.linked ? (
    <View style={{ gap: 8 }}>
      <PtNote tone="info" icon="smartphone">
        {code ? `On ${kid}'s phone, tap "I have an invite or a code" and enter ${code}. It works for 10 minutes.` : `${kid}'s phone isn't linked yet. Show a code, then enter it on ${kid}'s phone.`}
      </PtNote>
      <PtButton
        title={code ? 'Show a new code' : `Link ${kid}'s phone`}
        variant="secondary"
        loading={linkCode.renew.isPending}
        onPress={() => linkCode.renew.mutate(wallet.id, { onSuccess: (d) => setCode(d.code), onError: (e) => showAlert('No code', e.message) })}
      />
    </View>
  ) : null;

  // WPV-04 a co-parent.
  if (v.role === 'coparent') {
    return (
      <View style={{ gap: 16 }}>
        <ViewingAs me={myName} title="Co-parent" onWhat={() => setRole(true)} />
        <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{`${kid} has`}</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(v.balance)}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{rulesLine(v)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            [goal ? `Saved for ${goal.name.split(' ').slice(-1)[0].toLowerCase()}` : 'Saved', formatNaira(goal?.saved ?? '0')],
            ['Spent this week', formatNaira(v.spent_this_week)],
            ['Asks waiting', String(asks.length)],
          ].map(([label, value]) => (
            <View key={label} style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 12, gap: 4 }}>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{label}</Text>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{value}</Text>
            </View>
          ))}
        </View>
        {asks[0] ? <Ask ask={asks[0]} walletId={wallet.id} compact /> : null}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="check" label="Approve" disabled={!asks.length} why={`${kid} hasn't asked for anything.`} onPress={() => navigation.navigate('Approvals', { scope: 'to_me' })} />
            <Tile icon="send" label="Send extra" onPress={() => navigation.navigate('MoveMoney', { toWalletId: wallet.id })} />
            <Tile icon="star" label="Set a task" onPress={() => navigation.navigate('AssignTask', { walletId: wallet.id })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Tile icon="shield" label="Change limits" disabled={!v.can_change} why={`${owner} keeps the limits.`} onPress={() => navigation.navigate('ChildLimits', { walletId: wallet.id })} />
            <Tile icon={v.paused ? 'play' : 'pause'} label={v.paused ? 'Resume spending' : 'Pause spending'} onPress={pause} />
            <Tile icon="user-x" label="Remove child" disabled why={`Only ${owner} can remove ${kid}'s wallet.`} />
          </View>
        </View>
        {link}
        {roleSheet}
      </View>
    );
  }

  // CHD-09 a parent.
  return (
    <View style={{ gap: 16 }}>
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 4 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Balance</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(v.balance)}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{rulesLine(v)}</Text>
        {v.paused ? <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.gold500, marginTop: 4 }}>Spending paused</Text> : null}
      </View>
      {asks.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Waiting for you</PtGroupLabel>
          {asks.map((a) => (
            <Ask key={a.id} ask={a} walletId={wallet.id} />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PtButton title="Send extra" style={{ flex: 1 }} onPress={() => navigation.navigate('MoveMoney', { toWalletId: wallet.id })} />
        <PtButton title={v.paused ? 'Resume spending' : 'Pause spending'} variant="mint" style={{ flex: 1 }} loading={lock.freeze.isPending || lock.unfreeze.isPending} onPress={pause} />
      </View>
      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('ChildTasksParent', { walletId: wallet.id });
        }}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14 }}
      >
        <View style={{ width: 44, height: 44, borderRadius: ptRadius.sm, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="star" size={20} color={pt.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Tasks and rewards</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{v.tasks_waiting ? `${v.tasks_waiting} waiting for you to check` : `Set ${kid} a task to earn`}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={pt.inkMuted} />
      </Pressable>
      <PtReviewRow label="Limits and controls" value={`${formatNaira(v.daily_limit)} a day · auto-approve up to ${formatNaira(v.requests?.auto_limit)}`} onEdit={() => navigation.navigate('ChildLimits', { walletId: wallet.id })} last />
      {link}
    </View>
  );
}
