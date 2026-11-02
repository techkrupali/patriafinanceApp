import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useSavings } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtRing } from '../pt/PtRing';
import { RoleSheet, roleTitle } from '../wallet/RoleSheet';
import { Stat, Tile } from '../savings/CoSaverView';
import { ViewingAs } from '../project/ProjectRoleViews';
import { paceChip } from './GoalView';
import { formatNaira, formatYmd } from '../../lib/format';
import type { Wallet, WalletDetailData } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

const short = (ymd: string | null | undefined) => (ymd ? formatYmd(ymd.slice(0, 10)).replace(/ \d{4}$/, '') : '');

/**
 * WPV-01 Goal, seen by a contributor: "You're viewing as Aunty Ada ·
 * Contributor", what's saved together, what they put in and when last, who
 * else is saving, and Add money · Monthly gift · Family chat. Taking money
 * out, changing rules and inviting people are the owners'.
 */
export function GoalContributorView({ wallet, detail }: { wallet: Wallet; detail: WalletDetailData }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const q = useSavings(wallet.id);
  const [roleOpen, setRoleOpen] = useState(false);
  const s = q.data;
  const owner = detail.members.find((m) => m.role === 'owner');
  const ownerFirst = (wallet.owner?.name ?? owner?.name ?? 'The owner').split(' ')[0];
  const myMember = detail.members.find((m) => m.user_id === me?.id);
  const canFund = myMember?.permissions?.fund ?? true;
  const balance = Number(wallet.balance);
  const target = Number(wallet.target_amount ?? 0);
  const pct = target ? Math.min(100, (balance * 100) / target) : 0;
  const mine = s?.savers.find((x) => x.user.id === me?.id);
  const people = (s?.savers ?? []).filter((x) => x.status !== 'invited');
  const chip = paceChip(s);

  return (
    <View style={{ gap: 16 }}>
      <ViewingAs role={roleTitle(wallet.type, detail.my_role)} tone="gold" onWhat={() => setRoleOpen(true)} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 18 }}>
        <PtRing percent={pct} size={76} stroke={8} track="rgba(255,255,255,0.85)" labelColor="#FFFFFF" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Saved together</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 30, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(wallet.balance)}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.onDarkMuted }}>
            {[target ? `of ${formatNaira(target)}` : null, wallet.target_date ? `due ${short(wallet.target_date)}` : null, chip ? chip.label.toLowerCase() : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="You put in" value={formatNaira(mine?.total_saved ?? '0')} />
        <Stat label="Your last" value={mine?.last_at ? short(mine.last_at) : '—'} />
        <Stat label="People" value={String(people.length)} />
      </View>

      {!s ? (
        <ActivityIndicator color={pt.brand} />
      ) : (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
          {people.map((p, i) => (
            <View key={p.user.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: i === people.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{p.user.id === me?.id ? 'You' : p.user.name.split(' ')[0]}</Text>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(p.total_saved)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="arrow-down" label="Add money" disabled={!canFund} why={`${ownerFirst} didn't give you adding money here.`} onPress={() => navigation.navigate('MoveMoney', { toWalletId: wallet.id })} />
          <Tile icon="repeat" label="Monthly gift" disabled={!canFund} why={`${ownerFirst} didn't give you adding money here.`} onPress={() => navigation.navigate('SavingsPlan', { walletId: wallet.id })} />
          <Tile icon="message-square" label="Family chat" onPress={() => navigation.navigate('Chats')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="lock" label="Take money out" disabled why={`Only ${ownerFirst} and co-owners take money out.`} />
          <Tile icon="sliders" label="Change rules" disabled why={`Only ${ownerFirst} changes the plan.`} />
          <Tile icon="user-plus" label="Invite people" disabled why={`Only ${ownerFirst} invites people.`} />
        </View>
      </View>

      <RoleSheet
        visible={roleOpen}
        wallet={wallet}
        role={detail.my_role}
        ownerFirst={ownerFirst}
        canFund={canFund}
        canSpend={false}
        canApprove={false}
        onClose={() => setRoleOpen(false)}
      />
    </View>
  );
}
