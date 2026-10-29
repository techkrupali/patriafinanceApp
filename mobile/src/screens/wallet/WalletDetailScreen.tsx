import React from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtRing } from '../../components/pt/PtRing';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { LoadError } from '../../components/LoadError';
import { ActivityRow, StateNotice } from '../../components/wallet/WalletManageUi';
import { GivingSection } from '../../components/giving/GivingSection';
import { JointSection } from '../../components/joint/JointSection';
import { GoalCancelButton } from '../../components/goal/GoalCancelButton';
import { useBudget, useWallet, useWalletLock, useWalletTransactions } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, formatYmd, humanizeType, initials } from '../../lib/format';
import { walletColour } from '../../lib/walletColours';
import { canManageWallet } from '../../lib/governance';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { WalletState } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Tab = 'activity' | 'members' | 'rules' | 'account';

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
 * WAL-02 Wallet detail: progress ring (or balance) with who's in it, the
 * wallet's state (WAL-12), Add money / Pay from wallet, then the latest
 * activity. Activity · Members · Rules · Account open their own pages
 * (WAL-03, 04, 08, 05). Emergency rules, the savings plan, spending limits
 * (WAL-09) and pending approvals link out above; a giving wallet shows what's
 * coming up (WAL-18), a joint wallet its rules (WAL-19).
 */
export function WalletDetailScreen({ navigation, route }: RootScreenProps<'WalletDetail'>) {
  const { walletId } = route.params;
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const detail = useWallet(walletId);
  const txns = useWalletTransactions(walletId);
  const pause = useWalletLock(walletId);

  const wallet = detail.data?.wallet;
  const members = detail.data?.members ?? [];
  const role = detail.data?.my_role ?? wallet?.my_role;
  const approval = detail.data?.approval;
  const held = parseFloat(detail.data?.held_amount ?? '0');
  const pending = detail.data?.pending_approvals ?? 0;
  const emergency = detail.data?.emergency ?? null;
  const emergencyLocked = emergency?.locked ?? false;
  const state = detail.data?.state ?? null;
  const isMain = wallet?.type === 'main';
  const closed = wallet?.status === 'closed';
  const stopped = closed || wallet?.status === 'suspended';

  const canManage = canManageWallet(role);
  const canSpend = detail.data?.my_can_spend ?? (role != null && ['owner', 'co_owner'].includes(role));
  const canRequest = (detail.data?.my_can_request ?? false) && !emergencyLocked && wallet?.status === 'active';
  const budget = useBudget(walletId, wallet?.type === 'spending');

  const balance = parseFloat(wallet?.balance ?? '0');
  const target = parseFloat(wallet?.target_amount ?? '');
  const hasTarget = Number.isFinite(target) && target > 0;
  const pct = hasTarget ? Math.min((balance / target) * 100, 100) : 0;
  const shared = members.length > 1 || wallet?.mode === 'shared';
  const latest = (txns.data?.pages.flatMap((p) => p.transactions) ?? []).slice(0, 5);

  const refresh = () => {
    void detail.refetch();
    void txns.refetch();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'activity', label: 'Activity' },
    ...(isMain ? [] : [{ key: 'members' as const, label: 'Members' }]),
    { key: 'rules', label: 'Rules' },
    { key: 'account', label: 'Account' },
  ];
  // WAL-02: each tab is its own page (WAL-03 · 04 · 08 · 05).
  const openTab = (t: Tab) => {
    if (t === 'activity') navigation.navigate('WalletActivity', { walletId });
    else if (t === 'members') navigation.navigate('WalletMembers', { walletId });
    else if (t === 'rules') navigation.navigate('ApprovalRules', { walletId });
    else navigation.navigate('WalletAccount', { walletId });
  };

  const payFromWallet = stopped || wallet?.status === 'frozen'
    ? null
    : canSpend
      ? () => navigation.navigate('Transfer', { walletId })
      : canRequest
        ? () => navigation.navigate('RequestSpend', { walletId })
        : null;

  const resume = () =>
    pause.unfreeze.mutate(undefined, {
      onSuccess: () => notifySuccess(),
      onError: (e) => showAlert('Could not resume', e.message),
    });

  /** WAL-12: each notice's one action. */
  const stateAction = (st: WalletState): { label: string; run: () => void } | null => {
    switch (st.kind) {
      case 'paused':
        return canManage ? { label: 'Resume wallet', run: resume } : null;
      case 'restricted':
        return st.me ? { label: "See what's needed", run: () => navigation.navigate('Kyc') } : null;
      case 'locked':
        return st.can_ask ? { label: 'Ask to unlock', run: () => navigation.navigate('AskToUnlock', { walletId }) } : null;
      case 'suspended':
        return { label: 'Talk to support', run: () => navigation.navigate('Tabs', { screen: 'Steward', params: { ask: `My wallet ${wallet?.name ?? ''} was suspended. What do I do?` } }) };
      default:
        return { label: 'Download statement', run: () => navigation.navigate('WalletStatement', { walletId }) };
    }
  };
  const action = state ? stateAction(state) : null;

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
              {wallet.goal_locked && state?.kind !== 'locked' && !closed ? (
                <PtChip
                  label={wallet.lock?.mode === 'date' && wallet.lock.until ? `Locked to ${formatYmd(wallet.lock.until).replace(/ \d{4}$/, '')}` : 'Locked until reached'}
                  tone="warning"
                  icon="lock"
                />
              ) : null}
            </View>
          </View>

          {/* WAL-12 */}
          {state ? <StateNotice state={state} action={action?.label} onAction={action?.run} /> : null}

          {/* Actions */}
          {!stopped ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PtButton title="Add money" onPress={() => navigation.navigate('WalletAccount', { walletId })} />
              </View>
              {payFromWallet ? (
                <View style={{ flex: 1 }}>
                  <PtButton title={canSpend ? 'Pay from wallet' : 'Ask to pay'} variant="mint" onPress={payFromWallet} />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Parts of the wallet with their own screens */}
          {!closed && (emergency || pending > 0 || ['savings', 'goal', 'spending'].includes(wallet.type)) ? (
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
                  title={`${pending} request${pending === 1 ? '' : 's'} waiting for a yes`}
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
              {wallet.type === 'spending' && budget.data ? (
                <LinkCard
                  icon="pie-chart"
                  title="Spending limits"
                  subtitle={`${formatNaira(budget.data.spent)} of ${formatNaira(budget.data.amount)} spent · ${budget.data.categories.length} categories`}
                  onPress={() => navigation.navigate('SpendingLimits', { walletId })}
                />
              ) : null}
            </View>
          ) : null}

          {wallet.type === 'giving' ? <GivingSection walletId={walletId} isOwner={role === 'owner'} /> : null}
          {wallet.type === 'joint' && wallet.joint ? <JointSection wallet={wallet} myId={me?.id} /> : null}
          {wallet.type === 'goal' && wallet.goal && role === 'owner' && wallet.status === 'active' ? <GoalCancelButton walletId={walletId} name={wallet.name} /> : null}

          {/* Tabs: the latest activity here; each tab opens its own page */}
          <View>
            <Tabs tabs={tabs} value="activity" onChange={openTab} />
            {txns.isLoading ? (
              <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
            ) : txns.error ? (
              <LoadError message={(txns.error as Error).message} onRetry={() => void txns.refetch()} />
            ) : latest.length === 0 ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, paddingVertical: 20, textAlign: 'center' }}>
                {stopped ? 'No money in or out yet.' : 'No money in or out yet. Add money to get started.'}
              </Text>
            ) : (
              <View>
                {latest.map((t, i) => (
                  <ActivityRow key={t.id} t={t} myId={me?.id} last={i === latest.length - 1} />
                ))}
                <PtButton title="See all activity" variant="ghost" onPress={() => openTab('activity')} />
              </View>
            )}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}
