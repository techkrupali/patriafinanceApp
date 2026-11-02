import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtRing } from '../pt/PtRing';
import { PtAvatar } from '../pt/PtAvatar';
import { PtNote } from '../pt/PtForm';
import { PtSheet } from '../pt/PtSheet';
import { PtButton } from '../pt/PtButton';
import { RoleSheet, roleTitle } from '../wallet/RoleSheet';
import { useSavings, useSavingsActions } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, formatYmd, initials, parseYmd } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Wallet, WalletDetailData } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

/** "25 Nov" */
const dayMonth = (ymd: string | null | undefined) => {
  const d = parseYmd(ymd);
  return d ? `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}` : null;
};

export function Tile({ icon, label, onPress, disabled, why }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress?: () => void; disabled?: boolean; why?: string }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        // A greyed action says why it's not there for you.
        if (disabled) return why ? showAlert(label, why) : undefined;
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{ flex: 1, minHeight: 104, borderRadius: ptRadius.md, backgroundColor: disabled ? pt.sunken : pt.raised, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}
    >
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: disabled ? pt.raised : pt.emerald700, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={22} color={disabled ? pt.inkMuted : '#FFFFFF'} />
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: disabled ? pt.inkMuted : pt.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, borderRadius: ptRadius.md, backgroundColor: pt.raised, padding: 12, gap: 4 }}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{label}</Text>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 22, color: pt.ink }}>{value}</Text>
    </View>
  );
}

/**
 * WPV-02 Savings, seen by a co-saver: "You're viewing as Emeka · Co-saver"
 * (What can I do? → WPV-09), what's saved together, their own rule, next save
 * and what they put in, and their actions — add money, change their %,
 * pause their saving, ask to unlock, break early. Deleting is the owner's.
 */
export function CoSaverView({ wallet, detail }: { wallet: Wallet; detail: WalletDetailData }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const savings = useSavings(wallet.id);
  const actions = useSavingsActions(wallet.id);
  const [role, setRole] = useState(false);
  const [percentOpen, setPercentOpen] = useState(false);
  const s = savings.data;
  const mine = s?.me.auto_save ?? null;
  const [percent, setPercent] = useState<number | null>(null);
  const owner = detail.members.find((m) => m.role === 'owner');
  const ownerFirst = (wallet.owner?.name ?? owner?.name ?? 'The owner').split(' ')[0];
  const myMember = detail.members.find((m) => m.user_id === me?.id);
  const myTotal = s?.savers.find((x) => x.user.id === me?.id)?.total_saved ?? '0';
  const ownerTotal = s?.savers.find((x) => x.status === 'owner')?.total_saved ?? '0';
  const balance = parseFloat(wallet.balance);
  const target = parseFloat(wallet.target_amount ?? '') || 0;
  const pct = target ? Math.min(100, (balance * 100) / target) : 0;
  const locked = Boolean(wallet.goal_locked || wallet.lock?.locked);
  const lockText = wallet.lock?.mode === 'date' && wallet.lock.until ? `locked until ${dayMonth(wallet.lock.until)}` : locked ? 'locked until reached' : null;
  const canSpend = Boolean(detail.my_can_spend);
  const canFund = myMember?.permissions?.fund ?? true;
  const next = dayMonth(mine?.next_on);
  const rule = mine ? (mine.salary_percent ? `${mine.salary_percent}% of salary` : mine.label) : 'Not saving yet';

  // "Ngozi started this with ₦100,000. Your first ₦60,000 moves when your salary lands on 25 Nov."
  const firstSave = mine?.per_month && parseFloat(mine.per_month) > 0 ? formatNaira(mine.per_month) : 'save';
  const firstMove = mine?.enabled && next ? ` Your first ${firstSave} moves ${mine.salary_percent ? 'when your salary lands ' : ''}on ${next}.` : '';
  const note =
    parseFloat(myTotal) === 0 && parseFloat(ownerTotal) > 0
      ? `${ownerFirst} started this with ${formatNaira(ownerTotal)}.${firstMove}`
      : `You've put in ${formatNaira(myTotal)} of ${formatNaira(wallet.balance)} saved together.`;

  const setMy = (input: { salary_percent?: number; enabled?: boolean }, done: string) =>
    actions.updateAutoSave.mutate(input as never, {
      onSuccess: () => {
        notifySuccess();
        setPercentOpen(false);
        showAlert(done);
      },
      onError: (e) => showAlert('Not changed', e.message),
    });

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.emerald300, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.emerald900 }}>{initials(`${me?.first_name ?? ''} ${me?.last_name ?? ''}`)}</Text>
        </View>
        <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, lineHeight: 20, color: pt.ink }}>
          {"You're viewing as "}
          <Text style={{ fontFamily: ptFont.bold }}>{me?.first_name}</Text>
          {` · ${roleTitle(wallet.type, detail.my_role)}`}
        </Text>
        <Pressable onPress={() => setRole(true)} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>What can I do?</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 18 }}>
        <PtRing percent={pct} size={76} stroke={8} track="rgba(255,255,255,0.85)" labelColor="#FFFFFF" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Saved together</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 30, letterSpacing: -0.8, color: '#FFFFFF' }}>{formatNaira(wallet.balance)}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>
            {[target ? `of ${formatNaira(target)}` : null, lockText ?? (wallet.target_date ? `by ${formatYmd(wallet.target_date)}` : null)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Your rule" value={rule} />
        <Stat label="Next save" value={mine?.enabled === false ? 'Paused' : next ?? (mine?.salary_percent ? 'Next salary' : '—')} />
        <Stat label="You put in" value={formatNaira(myTotal)} />
      </View>

      {s ? <PtNote tone="info">{note}</PtNote> : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="arrow-down" label="Add money" disabled={!canFund} onPress={() => navigation.navigate('MoveMoney', { toWalletId: wallet.id })} />
          {mine?.salary_percent ? (
            <Tile
              icon="sliders"
              label="Change my %"
              disabled={!s?.me.can_edit_own_terms}
              why={`${ownerFirst} sets how much everyone saves here. Ask them to let savers choose their own.`}
              onPress={() => {
                setPercent(mine.salary_percent ?? 15);
                setPercentOpen(true);
              }}
            />
          ) : (
            <Tile icon="trending-up" label={mine ? 'My saving' : 'Start saving'} onPress={() => navigation.navigate('SavingsPlan', { walletId: wallet.id })} />
          )}
          <Tile
            icon={mine?.enabled === false ? 'play' : 'pause'}
            label={mine?.enabled === false ? 'Resume my saving' : 'Pause my saving'}
            disabled={!mine}
            why="You're not saving into this yet."
            onPress={() => setMy({ enabled: mine?.enabled === false }, mine?.enabled === false ? 'Your saving is back on' : 'Your saving is paused')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile icon="unlock" label="Ask to unlock" disabled={!locked} why="It isn't locked. Money can come out by the wallet's rules." onPress={() => navigation.navigate('AskToUnlock', { walletId: wallet.id })} />
          <Tile
            icon="send"
            label="Break early"
            disabled={!canSpend || !locked || !wallet.lock?.early_break}
            why={!locked ? 'It isn\'t locked, so there is no early-break fee.' : !wallet.lock?.early_break ? 'This wallet opens only on its date or target. Ask to unlock instead.' : `Only ${ownerFirst} and co-owners can take money out.`}
            onPress={() => navigation.navigate('BreakEarly', { walletId: wallet.id })} />
          <Tile icon="lock" label="Delete wallet" disabled why={`Only ${ownerFirst} can delete this wallet.`} />
        </View>
      </View>

      <RoleSheet
        visible={role}
        wallet={wallet}
        role={detail.my_role}
        ownerFirst={ownerFirst}
        canFund={canFund}
        canSpend={canSpend}
        canApprove={Boolean(myMember?.can_approve) || ['co_owner', 'admin'].includes(detail.my_role)}
        onClose={() => setRole(false)}
      />
      <PtSheet
        visible={percentOpen}
        title="Change my %"
        subtitle="Of each salary, moved the moment it lands"
        onClose={() => setPercentOpen(false)}
        footer={<PtButton title={`Save ${percent ?? 0}%`} loading={actions.updateAutoSave.isPending} onPress={() => percent && setMy({ salary_percent: percent }, `You now save ${percent}% of each salary`)} />}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[5, 10, 15, 20, 25, 30].map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                selection();
                setPercent(p);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: percent === p }}
              style={{ width: 92, height: 52, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: percent === p ? pt.brand : pt.lineStrong, backgroundColor: percent === p ? pt.brandSoft : pt.raised, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: percent === p ? pt.brand : pt.ink }}>{`${p}%`}</Text>
            </Pressable>
          ))}
        </View>
      </PtSheet>
    </View>
  );
}
