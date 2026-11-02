import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useAuth } from '../../store/auth';
import { PtButton } from '../pt/PtButton';
import { Stat, Tile } from '../savings/CoSaverView';
import { ProjectRoleSheet, ViewingAs } from '../project/ProjectRoleViews';
import { formatNaira, formatYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { Wallet } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

const groupAccount = (n: string) => n.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');

/** Why it needs the other's yes, in JNT-03's words. */
const why = (over: string | null) =>
  !over || over.startsWith('over')
    ? 'Over the alone limit'
    : over === 'a new account'
      ? 'Sending to a new account'
      : 'Moving money out to a personal wallet';

/**
 * WPV-03 Joint wallet, for either partner: "You're viewing as Emeka ·
 * Co-owner", the joint balance with what each put in, what you can spend alone
 * and what's left today, what's waiting for your yes, and Approve · Send money ·
 * Add money · Propose a change · Statement · Leave.
 */
export function JointView({ wallet }: { wallet: Wallet }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const [what, setWhat] = useState(false);
  const j = wallet.joint;
  if (!j) return null;

  const iAmOwner = wallet.owner ? wallet.owner.id === me?.id : true;
  const otherFull = iAmOwner ? j.partner?.name : wallet.owner?.name;
  const otherName = (otherFull ?? 'your partner').split(/\s+/)[0];
  const put = j.put_in ?? [];
  const myPut = put.find((p) => p.user_id === me?.id)?.amount ?? '0';
  const theirPut = put.find((p) => p.user_id !== me?.id)?.amount ?? '0';
  const waiting = j.waiting ?? [];
  const forMe = waiting.filter((w) => w.by.id !== me?.id);
  const proposalFromOther = j.proposal && j.proposal.by !== me?.id;
  const go = (fn: () => void) => () => { selection(); fn(); };

  const card = (key: string | number, top: string, title: string, sub: string, onPress?: () => void, tone: 'light' | 'warn' = 'light') => (
    <Pressable key={key} onPress={onPress ? go(onPress) : undefined} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tone === 'warn' ? '#FDEBC8' : pt.raised, borderRadius: ptRadius.md, padding: 16 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{top}</Text>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 23, color: pt.ink }}>{title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{sub}</Text>
        </View>
        {onPress ? <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{tone === 'warn' ? 'See' : 'Open'}</Text> : null}
      </View>
    </Pressable>
  );

  return (
    <View style={{ gap: 16 }}>
      <ViewingAs role="Co-owner" onWhat={() => setWhat(true)} />

      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 6 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Joint balance</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 32, letterSpacing: -0.8, color: '#FFFFFF' }} adjustsFontSizeToFit numberOfLines={1}>
          {formatNaira(wallet.balance)}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.onDarkMuted }}>
          {[
            wallet.virtual_account ? `Account ${groupAccount(wallet.virtual_account)}` : null,
            Number(myPut) === Number(theirPut) ? `you each put in ${formatNaira(myPut)}` : `you put in ${formatNaira(myPut)}, ${otherName} ${formatNaira(theirPut)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="You can spend alone" value={formatNaira(j.me?.spend_alone ?? j.limits.per_payment)} />
        <Stat label="Left today" value={formatNaira(j.me?.left_today ?? j.limits.per_day)} />
        <Stat label="Waiting" value={String(waiting.length)} />
      </View>

      {j.closing && j.closing.by !== me?.id
        ? card('closing', `${otherName} wants to close it`, 'Confirm with your PIN to close', 'The money splits the way you agreed', () => navigation.navigate('JointLeave', { walletId: wallet.id }), 'warn')
        : null}
      {j.leaving
        ? card('leaving', j.leaving.by === me?.id ? 'You gave notice' : `${otherName} gave notice`, `Payments continue until ${formatYmd(j.leaving.ends_on)}`, 'Then the money splits the way you agreed', () => navigation.navigate('JointLeave', { walletId: wallet.id }))
        : null}
      {j.proposal
        ? card(
            'proposal',
            proposalFromOther ? `${otherName} proposed a change` : `Waiting for ${otherName} to agree`,
            j.proposal.summary,
            proposalFromOther ? 'It only changes if you agree' : 'Rule changes need both of you',
            () => navigation.navigate('JointRules', { walletId: wallet.id }),
            proposalFromOther ? 'warn' : 'light',
          )
        : null}
      {waiting.map((w) =>
        card(
          w.id,
          w.by.id === me?.id ? 'You asked to pay' : `${w.by.first_name ?? otherName} wants to pay`,
          `${w.to ?? 'Someone'} ${formatNaira(w.amount)}`,
          w.by.id === me?.id ? `${why(w.over)} · waiting for ${otherName}'s yes` : `${why(w.over)} · needs your yes`,
          () => navigation.navigate('ApprovalDetail', { approvalId: w.id }),
          w.by.id === me?.id ? 'light' : 'warn',
        ),
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="check" label="Approve" disabled={!forMe.length} why={`Nothing of ${otherName}'s is waiting for your yes.`} onPress={() => forMe[0] && navigation.navigate('ApprovalDetail', { approvalId: forMe[0].id })} />
          <Tile icon="send" label="Send money" disabled={Boolean(j.closing)} why="Nothing can be paid out while the wallet is closing." onPress={() => navigation.navigate('Send', { fromWalletId: wallet.id })} />
          <Tile icon="arrow-down" label="Add money" onPress={() => navigation.navigate('MoveMoney', { toWalletId: wallet.id })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="repeat" label="Propose a change" onPress={() => navigation.navigate('JointRules', { walletId: wallet.id })} />
          <Tile icon="download" label="Statement" onPress={() => navigation.navigate('WalletStatement', { walletId: wallet.id })} />
          <Tile icon="log-out" label="Leave" onPress={() => navigation.navigate('JointLeave', { walletId: wallet.id })} />
        </View>
      </View>

      {forMe.length > 1 ? <PtButton title={`See all ${forMe.length} waiting`} variant="ghost" onPress={() => navigation.navigate('Approvals', { scope: 'to_me' })} /> : null}

      <ProjectRoleSheet
        visible={what}
        title="You're a co-owner"
        owner={otherName}
        note={`You and ${otherName} agreed these rules. Changing them needs both of you.`}
        can={[
          `Spend alone up to ${formatNaira(j.limits.per_payment)} a payment, ${formatNaira(j.limits.per_day)} a day`,
          `Say yes to ${otherName}'s bigger payments`,
          'Add money and see every payment',
          'Propose a change to the rules',
          'Give notice to leave',
        ]}
        cannot={[
          j.always.new_account ? 'Pay a new account alone' : null,
          j.always.personal ? 'Move money to a personal wallet alone' : null,
          'Change the rules or close the wallet alone',
        ].filter(Boolean) as string[]}
        onClose={() => setWhat(false)}
      />
    </View>
  );
}
