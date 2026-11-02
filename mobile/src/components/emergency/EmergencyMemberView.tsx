import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtRing } from '../pt/PtRing';
import { RoleSheet } from '../wallet/RoleSheet';
import { Stat, Tile } from '../savings/CoSaverView';
import { ReleaseRequestCard, releaseLine } from './EmergencyUi';
import { useEmergency } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, initials } from '../../lib/format';
import type { Wallet, WalletDetailData } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

/**
 * WPV-07 Emergency fund, seen by someone else in it: "You're viewing as Obi ·
 * Keyholder · contributor" (What can I do? → WPV-09), what's ready, "2 of 3 to
 * release", what they put in and save each month, releases so far, a request
 * waiting for their yes, and their actions. Nobody withdraws alone.
 */
export function EmergencyMemberView({ wallet, detail }: { wallet: Wallet; detail: WalletDetailData }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const q = useEmergency(wallet.id);
  const [roleOpen, setRoleOpen] = useState(false);
  const e = q.data;
  if (!e) return <ActivityIndicator color={pt.brand} style={{ marginTop: 40 }} />;

  const owner = detail.members.find((m) => m.role === 'owner');
  const ownerFirst = (wallet.owner?.name ?? owner?.name ?? 'The owner').split(' ')[0];
  const keyholder = Boolean(e.me.is_keyholder);
  const recipient = e.me.role === 'recipient';
  const saving = e.me.monthly != null;
  const roles = [keyholder ? 'Keyholder' : recipient ? 'Beneficiary' : null, saving || parseFloat(e.me.put_in ?? '0') > 0 ? 'contributor' : null].filter(Boolean) as string[];
  const roleText = roles.length ? roles.join(' · ').replace(/^contributor/, 'Contributor') : 'Viewer';
  const balance = parseFloat(e.balance);
  const target = parseFloat(e.target ?? '') || 0;
  const pct = target ? Math.min(100, (balance * 100) / target) : 0;
  const months = e.months_saving ?? 0;
  const waiting = e.requests.filter((r) => (r.method === 'dual_approval' || r.method === 'rule_change') && r.status === 'pending');
  const releaseWaiting = waiting.some((r) => r.method === 'dual_approval');
  const canAsk = e.locked && (e.me.can_request_dual || e.me.can_fast_release);
  const share = e.me.beneficiary;
  const myMember = detail.members.find((m) => m.user_id === me?.id);
  const canFund = myMember?.permissions?.fund ?? true;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.gold100, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: '#8F5400' }}>{initials(`${me?.first_name ?? ''} ${me?.last_name ?? ''}`)}</Text>
        </View>
        <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, lineHeight: 20, color: pt.ink }}>
          {"You're viewing as "}
          <Text style={{ fontFamily: ptFont.bold }}>{me?.first_name}</Text>
          {` · ${roleText}`}
        </Text>
        <Pressable onPress={() => setRoleOpen(true)} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>What can I do?</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 18 }}>
        {target ? <PtRing percent={pct} size={76} stroke={8} track="rgba(255,255,255,0.85)" labelColor="#FFFFFF" /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>{e.locked ? 'Ready for an emergency' : 'Released — open to spend'}</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 30, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(e.balance)}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.onDarkMuted }}>
            {[target ? `of ${formatNaira(target)}` : null, months > 0 ? `after ${months} month${months === 1 ? '' : 's'} of saving` : null, releaseLine(e)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="You put in" value={formatNaira(e.me.put_in ?? '0')} />
        <Stat label="Your monthly" value={saving ? formatNaira(e.me.monthly) : '—'} />
        <Stat label="Releases" value={String(e.releases ?? 0)} />
      </View>

      {waiting.length ? (
        waiting.map((r) => <ReleaseRequestCard key={r.id} walletId={wallet.id} r={r} myId={me?.id} />)
      ) : (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>No release requests</Text>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{keyholder ? "We'll alert you if one comes in" : `${ownerFirst} and the keyholders decide releases`}</Text>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="arrow-down" label="Add money" disabled={!canFund} why={`${ownerFirst} didn't give you adding money here.`} onPress={() => navigation.navigate('MoveMoney', { toWalletId: wallet.id })} />
          <Tile
            icon="flag"
            label="Start a request"
            disabled={!canAsk}
            why={!e.locked ? 'The fund is already released.' : releaseWaiting ? 'A request is already waiting for the keyholders.' : 'Only keyholders and beneficiaries can ask for a release.'}
            onPress={() => navigation.navigate('EmergencyRelease', { walletId: wallet.id })}
          />
          <Tile icon="message-square" label="Fund chat" disabled why="Fund chat is coming soon." />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="shield" label="Release policy" onPress={() => navigation.navigate('EmergencyPolicy', { walletId: wallet.id })} />
          <Tile icon="download" label="Statement" onPress={() => navigation.navigate('WalletStatement', { walletId: wallet.id })} />
          {share?.can_withdraw_now ? (
            <Tile icon="arrow-up" label="Take my share" onPress={() => navigation.navigate('EmergencyCenter', { walletId: wallet.id })} />
          ) : (
            <Tile icon="lock" label="Withdraw alone" disabled why={`Nobody takes money out alone. ${releaseLine(e).replace(/^(\d+ of \d+) to release$/, 'Money leaves when $1 keyholders agree.').replace('Only you release it', `Only ${ownerFirst} releases it.`)}`} />
          )}
        </View>
      </View>

      <RoleSheet
        visible={roleOpen}
        wallet={wallet}
        role={detail.my_role}
        ownerFirst={ownerFirst}
        canFund={canFund}
        canSpend={false}
        canApprove={keyholder}
        onClose={() => setRoleOpen(false)}
      />
    </View>
  );
}
