import React, { useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtRing } from '../../components/pt/PtRing';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtCard, PtRow } from '../../components/pt/PtList';
import { LoadError } from '../../components/LoadError';
import { MemberManageModal } from '../../components/MemberManageModal';
import {
  useAutomations,
  useFundingDetails,
  useWallet,
  useWalletInvitations,
  useWalletMembers,
  useWalletTransactions,
} from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { agoLabel, formatNaira, formatYmd, humanizeType, initials } from '../../lib/format';
import { approvalSummary, joinNames, ordinal } from '../../lib/goalPlan';
import { walletColour } from '../../lib/walletColours';
import { formatE164 } from '../../lib/phone';
import { canInviteMembers, canManageWallet, roleLabel } from '../../lib/governance';
import { notifySuccess, selection } from '../../lib/haptics';
import type { Transaction, WalletMember } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Tab = 'activity' | 'members' | 'rules' | 'account';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today, 9:12 am" · "Yesterday" · "1 Oct". */
function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) {
    const h = d.getHours() % 12 || 12;
    return `Today, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  }
  if (days === 1) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** "Emeka added money" when someone else paid in; otherwise the description. */
function activityTitle(t: Transaction, myId: number | undefined): string {
  if (t.direction === 'credit' && t.by && t.by.id !== myId) return `${t.by.first_name} added money`;
  return t.description || humanizeType(t.type);
}

const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'Someone';

/** WAL-02 underline tabs. */
function Tabs({ tabs, value, onChange }: { tabs: { key: Tab; label: string }[]; value: Tab; onChange: (t: Tab) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: pt.line }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              selection();
              onChange(t.key);
            }}
            // "button" on web: RNGH's Pressable ignores taps on role=tab elements there.
            accessibilityRole={Platform.select({ web: 'button', default: 'tab' })}
            accessibilityState={{ selected: on }}
            style={{ paddingTop: 8, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: on ? pt.brand : 'transparent', marginBottom: -1 }}
          >
            <Text style={{ fontFamily: on ? ptFont.bold : ptFont.medium, fontSize: 16, color: on ? pt.brand : pt.inkMuted }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Card linking to a part of the wallet that lives on its own screen. */
function LinkCard({
  icon,
  title,
  subtitle,
  tone = 'light',
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  tone?: 'light' | 'dark';
  onPress: () => void;
}) {
  const dark = tone === 'dark';
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: ptRadius.md,
        backgroundColor: dark ? pt.emerald900 : pt.raised,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(255,255,255,0.12)' : pt.brandSoft }}>
        <Feather name={icon} size={18} color={dark ? pt.emerald300 : pt.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: dark ? '#FFFFFF' : pt.ink }}>{title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: dark ? pt.onDarkMuted : pt.inkMuted }} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={dark ? pt.emerald300 : pt.inkSubtle} />
    </Pressable>
  );
}

/**
 * WAL-02 Wallet detail: progress ring (or balance) with who's in it, Add money /
 * Pay from wallet, then Activity · Members · Rules · Account. Emergency rules,
 * the savings plan and pending approvals link out from above the tabs.
 */
export function WalletDetailScreen({ navigation, route }: RootScreenProps<'WalletDetail'>) {
  const { walletId } = route.params;
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const detail = useWallet(walletId);
  const txns = useWalletTransactions(walletId);
  const automations = useAutomations();
  const [tab, setTab] = useState<Tab>('activity');
  const [copied, setCopied] = useState(false);
  const [manageMember, setManageMember] = useState<WalletMember | null>(null);

  const wallet = detail.data?.wallet;
  const members = detail.data?.members ?? [];
  const role = detail.data?.my_role ?? wallet?.my_role;
  const approval = detail.data?.approval;
  const held = parseFloat(detail.data?.held_amount ?? '0');
  const pending = detail.data?.pending_approvals ?? 0;
  const emergency = detail.data?.emergency ?? null;
  const emergencyLocked = emergency?.locked ?? false;
  const isMain = wallet?.type === 'main';

  const canManage = canManageWallet(role);
  const canInvite = canInviteMembers(role) && !isMain;
  const canSpend = detail.data?.my_can_spend ?? (role != null && ['owner', 'co_owner'].includes(role));
  const canRequest = (detail.data?.my_can_request ?? false) && !emergencyLocked;
  const richMembers = useWalletMembers(walletId, canManage);
  const invites = useWalletInvitations(walletId, canInvite);
  const funding = useFundingDetails(walletId, tab === 'account');

  const balance = parseFloat(wallet?.balance ?? '0');
  const target = parseFloat(wallet?.target_amount ?? '');
  const hasTarget = Number.isFinite(target) && target > 0;
  const pct = hasTarget ? Math.min((balance / target) * 100, 100) : 0;
  const shared = members.length > 1 || wallet?.mode === 'shared';
  const allTxns = txns.data?.pages.flatMap((p) => p.transactions) ?? [];
  const walletRules = (automations.data ?? []).filter((r) => r.from_wallet.id === walletId || r.to_wallet.id === walletId);
  const pendingInvites = canInvite ? invites.data ?? [] : [];
  const approvers = members.filter((m) => ['owner', 'co_owner', 'admin'].includes(m.role) || m.can_approve).map((m) => firstName(m.name));

  const refresh = () => {
    void detail.refetch();
    void txns.refetch();
    if (canManage) void richMembers.refetch();
    if (canInvite) void invites.refetch();
  };

  const openManage = (m: WalletMember) => {
    const rich = (richMembers.data ?? []).find((r) => r.user_id === m.user_id);
    if (!rich?.id || rich.role === 'owner') return;
    selection();
    setManageMember(rich);
  };

  const account = funding.data?.account_number ?? wallet?.virtual_account ?? null;
  const copyAccount = async () => {
    if (!account) return;
    selection();
    await Clipboard.setStringAsync(account);
    notifySuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const shareAccount = () => {
    if (!account) return;
    selection();
    void Share.share({
      message: `Pay into ${wallet?.name ?? 'our wallet'} on Patriai\nAccount number: ${account}${funding.data?.bank_name ? `\nBank: ${funding.data.bank_name}` : ''}${funding.data?.account_name ? `\nName: ${funding.data.account_name}` : ''}`,
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'activity', label: 'Activity' },
    ...(isMain ? [] : [{ key: 'members' as const, label: 'Members' }]),
    { key: 'rules', label: 'Rules' },
    { key: 'account', label: 'Account' },
  ];

  const payFromWallet = canSpend
    ? () => navigation.navigate('Transfer', { walletId })
    : canRequest
      ? () => navigation.navigate('RequestSpend', { walletId })
      : null;

  // ------------------------------------------------------------------ tabs
  const activity = txns.isLoading ? (
    <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
  ) : txns.error ? (
    <LoadError message={(txns.error as Error).message} onRetry={() => void txns.refetch()} />
  ) : allTxns.length === 0 ? (
    <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, paddingVertical: 20, textAlign: 'center' }}>
      No money in or out yet. Add money to get started.
    </Text>
  ) : (
    <View>
      {allTxns.map((t) => {
        const credit = t.direction === 'credit';
        return (
          <View key={t.id} style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: credit ? pt.brandSoft : pt.sunken }}>
              <Feather name={credit ? 'arrow-down-left' : 'arrow-up-right'} size={18} color={credit ? pt.brand : pt.inkMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, lineHeight: 22, color: pt.ink }} numberOfLines={1}>
                {activityTitle(t, me?.id)}
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }} numberOfLines={1}>
                {whenLabel(t.created_at)}
                {t.status !== 'successful' ? ` · ${humanizeType(t.status)}` : ''}
              </Text>
            </View>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: credit ? pt.emerald500 : pt.ink }}>
              {credit ? '+' : '−'}
              {formatNaira(t.amount)}
            </Text>
          </View>
        );
      })}
      {txns.hasNextPage ? (
        <PtButton title="Show more" variant="ghost" loading={txns.isFetchingNextPage} onPress={() => void txns.fetchNextPage()} />
      ) : null}
    </View>
  );

  const membersTab = (
    <View style={{ gap: 12, paddingTop: 8 }}>
      <PtCard>
        {members.map((m, i) => {
          const isOwner = m.role === 'owner';
          const tappable = canManage && !isOwner && richMembers.isSuccess;
          const you = m.user_id === me?.id;
          return (
            <PtRow
              key={m.user_id}
              minHeight={64}
              last={i === members.length - 1 && pendingInvites.length === 0}
              left={<PtAvatar initials={initials(m.name)} tone={isOwner ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />}
              title={`${m.name}${you ? ' (you)' : ''}`}
              subtitle={roleLabel(m.role)}
              right={m.can_approve || ['owner', 'co_owner'].includes(m.role) ? <PtChip label="Approver" tone="brand" /> : undefined}
              onPress={tappable ? () => openManage(m) : undefined}
            />
          );
        })}
        {pendingInvites.map((inv, i) => (
          <PtRow
            key={`inv-${inv.id}`}
            minHeight={64}
            last={i === pendingInvites.length - 1}
            left={<PtAvatar initials="+" tone="dashed" />}
            title={inv.invitee_identifier?.startsWith('+') ? formatE164(inv.invitee_identifier) : inv.invitee_identifier ?? 'Invited'}
            subtitle={`Invited ${agoLabel(inv.created_at)} · ${roleLabel(inv.role).toLowerCase()}`}
            right={<PtChip label="Pending" tone="warning" />}
          />
        ))}
      </PtCard>
      {canInvite ? <PtButton title="Add someone to this wallet" variant="secondary" onPress={() => navigation.navigate('InviteMember', { walletId })} /> : null}
      {canManage && members.length > 1 ? (
        <PtButton title="Access and permissions" variant="ghost" onPress={() => navigation.navigate('AssignAccess', { walletId })} />
      ) : null}
    </View>
  );

  const lock = wallet?.lock;
  const lockLine = lock?.locked
    ? `Locked until ${lock.mode === 'date' && lock.until ? formatYmd(lock.until) : `${formatNaira(wallet?.target_amount)} is reached`}. ${
        !lock.early_break ? 'Nothing comes out before then.' : lock.approval ? "Taking money out early needs everyone's yes." : 'Early breaks are allowed.'
      }`
    : null;
  const approvalLine = !approval?.enabled
    ? lockLine ?? 'Approvals are off. Owners and co-owners can pay out directly.'
    : wallet?.approval_mode
      ? approvalSummary({
          mode: wallet.approval_mode,
          threshold: approval.threshold ? parseFloat(approval.threshold) : null,
          approvers,
          lockUntilGoal: Boolean(wallet.goal_locked && lock?.mode !== 'date'),
        }) + (lock?.locked && lock.mode === 'date' && lockLine ? ` ${lockLine}` : '')
      : `${approval.threshold ? `Payments over ${formatNaira(approval.threshold)}` : 'Every payment'} need${approval.threshold ? '' : 's'} ${approval.required_approvals} yes${approval.required_approvals === 1 ? '' : 'es'} from ${joinNames(approvers) || 'an approver'}.${lockLine ? ` ${lockLine}` : ''}`;

  const rulesTab = (
    <View style={{ gap: 12, paddingTop: 8 }}>
      <PtCard>
        <PtRow
          minHeight={64}
          left={<Feather name="shield" size={20} color={pt.brand} />}
          title="When money needs a yes"
          subtitle={approvalLine}
          onPress={role === 'owner' ? () => navigation.navigate('WalletSettings', { walletId }) : undefined}
          chevron={role === 'owner'}
          last={!approval?.enabled && !wallet?.reminder_day && held <= 0}
        />
        {approval?.enabled ? (
          <PtRow
            left={<Feather name="clock" size={20} color={pt.brand} />}
            title="Requests expire after"
            right={`${wallet?.approval_expiry_hours ?? 48} hours`}
            last={!wallet?.reminder_day && held <= 0}
          />
        ) : null}
        {wallet?.reminder_day ? (
          <PtRow
            left={<Feather name="bell" size={20} color={pt.brand} />}
            title="Monthly reminder"
            right={`On the ${ordinal(wallet.reminder_day)}`}
            last={held <= 0}
          />
        ) : null}
        {held > 0 ? (
          <PtRow left={<Feather name="lock" size={20} color={pt.brand} />} title="Held for approvals" right={formatNaira(held)} last />
        ) : null}
      </PtCard>

      {walletRules.length > 0 ? (
        <PtCard>
          {walletRules.map((r, i) => (
            <PtRow
              key={r.id}
              minHeight={64}
              last={i === walletRules.length - 1}
              left={<Feather name="repeat" size={20} color={r.enabled ? pt.brand : pt.inkSubtle} />}
              title={r.name}
              subtitle={`${r.from_wallet.name} → ${r.to_wallet.name} · ${r.enabled ? r.next_run_hint : 'Paused'}`}
              right={
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>
                  {r.trigger === 'salary' ? `${r.percent}%` : r.trigger === 'roundup' ? `↑${formatNaira(r.roundup_to)}` : formatNaira(r.amount)}
                </Text>
              }
            />
          ))}
        </PtCard>
      ) : null}
      {role === 'owner' ? (
        <PtButton
          title="New rule"
          variant="secondary"
          onPress={() => navigation.navigate('CreateAutomation', isMain ? { fromWalletId: walletId } : { toWalletId: walletId })}
        />
      ) : null}
    </View>
  );

  const accountTab = (
    <View style={{ gap: 12, paddingTop: 8 }}>
      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 18, gap: 12 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>Anyone can pay into this wallet directly</Text>
        {account ? (
          <Text style={{ fontFamily: MONO, fontWeight: '700', fontSize: 22, letterSpacing: 1, color: pt.ink }} selectable>
            {account.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3')}
          </Text>
        ) : funding.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>
            {funding.error ? (funding.error as Error).message : 'The account number is being set up.'}
          </Text>
        )}
        <View style={{ height: 1, backgroundColor: pt.line }} />
        {[
          ['Bank', funding.data?.bank_name ?? wallet?.virtual_account_bank ?? '—'],
          ['Account name', funding.data?.account_name ?? '—'],
        ].map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{label}</Text>
            <Text style={{ flex: 1, textAlign: 'right', fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{value}</Text>
          </View>
        ))}
        {account ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <PtButton title={copied ? 'Copied' : 'Copy'} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void copyAccount()} />
            <PtButton title="Share" variant="secondary" size="sm" style={{ flex: 1 }} onPress={shareAccount} />
          </View>
        ) : null}
      </View>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted, paddingHorizontal: 4 }}>
        This account only accepts money. Paying out still follows the wallet's approval rules.
      </Text>
    </View>
  );

  // ------------------------------------------------------------------ screen
  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 4 }}>
      <StatusBar style="dark" />
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
        {navigation.canGoBack() ? <PtBackButton onPress={() => navigation.goBack()} /> : <View style={{ width: 44 }} />}
        <Text style={{ flex: 1, textAlign: 'center', fontFamily: ptFont.bold, fontSize: 18, color: pt.ink }} numberOfLines={1} accessibilityRole="header">
          {wallet?.name ?? 'Wallet'}
        </Text>
        {canManage ? (
          <Pressable
            onPress={() => {
              selection();
              navigation.navigate('WalletSettings', { walletId });
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Wallet settings"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="settings" size={22} color={pt.ink} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {detail.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={refresh} />
      ) : wallet ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 32, gap: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} tintColor={pt.brand} />}
        >
          {/* Hero */}
          <View style={{ alignItems: 'center', gap: 10 }}>
            {hasTarget ? <PtRing percent={pct} size={150} stroke={14} caption="funded" color={walletColour(wallet.colour) ?? pt.gold500} /> : null}
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, color: pt.ink, marginTop: hasTarget ? 6 : 12 }}>
              {formatNaira(wallet.balance)}
            </Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted, textAlign: 'center' }}>
              {hasTarget
                ? [
                    `of ${formatNaira(target)}`,
                    wallet.target_date ? `due ${formatYmd(wallet.target_date)}` : null,
                    balance < target ? `${formatNaira(target - balance)} to go` : 'goal reached',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : held > 0
                  ? `${formatNaira(Math.max(balance - held, 0))} available · ${formatNaira(held)} held for approvals`
                  : `${humanizeType(wallet.type)} wallet`}
            </Text>
            {wallet.description ? (
              <Text style={{ fontFamily: ptFont.medium, fontSize: 13, lineHeight: 18, color: pt.ink, textAlign: 'center' }}>{wallet.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              {members.length > 1 ? (
                <View style={{ flexDirection: 'row' }}>
                  {members.slice(0, 3).map((m, i) => (
                    <View key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 18, borderWidth: 2, borderColor: pt.surface }}>
                      <PtAvatar initials={initials(m.name)} tone={m.role === 'owner' ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} size={30} />
                    </View>
                  ))}
                </View>
              ) : null}
              {shared ? <PtChip label="Shared" tone="brand" icon="circle" /> : null}
              {approval?.enabled ? <PtChip label="Approvals on" tone="neutral" icon="lock" /> : null}
              {wallet.goal_locked ? (
                <PtChip
                  label={wallet.lock?.mode === 'date' && wallet.lock.until ? `Locked to ${formatYmd(wallet.lock.until).replace(/ \d{4}$/, '')}` : 'Locked until reached'}
                  tone="warning"
                  icon="lock"
                />
              ) : null}
              {wallet.status === 'frozen' ? <PtChip label="Frozen" tone="danger" icon="pause" /> : null}
            </View>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <PtButton title="Add money" onPress={() => navigation.navigate('Fund', { walletId })} />
            </View>
            {payFromWallet ? (
              <View style={{ flex: 1 }}>
                <PtButton title={canSpend ? 'Pay from wallet' : 'Ask to pay'} variant="secondary" onPress={payFromWallet} />
              </View>
            ) : null}
          </View>

          {/* Parts of the wallet with their own screens */}
          {emergency || pending > 0 || wallet.type === 'savings' || wallet.type === 'goal' ? (
            <View style={{ gap: 10 }}>
              {emergency ? (
                <LinkCard
                  icon={emergencyLocked ? 'lock' : 'unlock'}
                  tone={emergencyLocked ? 'dark' : 'light'}
                  title={emergencyLocked ? 'Locked by emergency rules' : 'Unlocked'}
                  subtitle={emergency.my_emergency_role === 'recipient' ? 'See your share and how this wallet unlocks' : 'Unlock rules, recipients and requests'}
                  onPress={() => navigation.navigate('EmergencyCenter', { walletId })}
                />
              ) : null}
              {pending > 0 ? (
                <LinkCard
                  icon="check-circle"
                  tone="dark"
                  title={`${pending} payment${pending === 1 ? '' : 's'} waiting for a yes`}
                  subtitle="Review what's waiting on this wallet"
                  onPress={() => navigation.navigate('Approvals', { scope: 'to_me' })}
                />
              ) : null}
              {wallet.type === 'savings' || wallet.type === 'goal' ? (
                <LinkCard
                  icon="trending-up"
                  title="Savings plan"
                  subtitle={
                    detail.data?.savings
                      ? `${detail.data.savings.label}${wallet.target_date ? ` · by ${formatYmd(wallet.target_date)}` : ''}`
                      : role === 'owner'
                        ? 'Milestones and auto-save for everyone'
                        : 'Progress, milestones and savers'
                  }
                  onPress={() => navigation.navigate('SavingsPlan', { walletId })}
                />
              ) : null}
            </View>
          ) : null}

          {/* Tabs */}
          <View>
            <Tabs tabs={tabs} value={tabs.some((t) => t.key === tab) ? tab : 'activity'} onChange={setTab} />
            {tab === 'members' && !isMain ? membersTab : tab === 'rules' ? rulesTab : tab === 'account' ? accountTab : activity}
          </View>
        </ScrollView>
      ) : null}

      <MemberManageModal walletId={walletId} member={manageMember} onClose={() => setManageMember(null)} />
    </View>
  );
}
