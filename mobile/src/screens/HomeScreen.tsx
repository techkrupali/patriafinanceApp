import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { TxnRow } from '../components/TxnRow';
import { EmptyState } from '../components/EmptyState';
import { LoadError } from '../components/LoadError';
import { colors, gradients, shadow } from '../theme';
import { useApprovals, useDashboard, useFamily, useRespondApproval } from '../api/hooks';
import { useAuth } from '../store/auth';
import { formatMoney, initials } from '../lib/format';
import { notifySuccess, selection } from '../lib/haptics';
import { approvalActionLabel, roleLabel } from '../lib/governance';
import { walletVisual } from '../lib/walletVisual';
import type { ApprovalRequest, Wallet } from '../api/types';
import type { TabScreenProps } from '../navigation/types';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

/** Wallet types that count as goals in the Ledger design. */
const GOAL_TYPES: readonly string[] = ['savings', 'goal', 'emergency', 'giving'];

/** Steward gold-card ink (client token: on-primary-container). */
const GOLD_INK = '#3D2F00';

const sumBalances = (ws: Wallet[]): number =>
  ws.reduce((acc, w) => acc + (parseFloat(w.balance || '0') || 0), 0);

// ---------------------------------------------------------------------------
// Local pieces
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">{children}</Text>
  );
}

/** 64px presence avatar with the green "online" ring + dot. */
function PresenceAvatar({
  name,
  displayName,
  role,
  onPress,
}: {
  name: string;
  displayName: string;
  role: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="w-[68px] items-center active:opacity-70"
    >
      <View
        style={{
          height: 64,
          width: 64,
          borderRadius: 32,
          borderWidth: 2,
          borderColor: colors.brand,
          padding: 2,
        }}
      >
        <LinearGradient
          colors={gradients.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text className="text-base font-bold text-white">{initials(name)}</Text>
        </LinearGradient>
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            height: 15,
            width: 15,
            borderRadius: 8,
            backgroundColor: colors.brand,
            borderWidth: 2,
            borderColor: colors.page,
          }}
        />
      </View>
      <Text className="mt-1.5 text-xs font-bold text-ink" numberOfLines={1}>
        {displayName}
      </Text>
      <Text className="text-[10px] text-muted" numberOfLines={1}>
        {role}
      </Text>
    </Pressable>
  );
}

/** One action in the treasury hero's 4-column grid. */
function HeroAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IonName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      disabled={disabled}
      className={`flex-1 items-center ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
    >
      <View className="h-12 w-12 items-center justify-center rounded-xl bg-white/10">
        <Ionicons name={icon} size={21} color={colors.white} />
      </View>
      <Text className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white">{label}</Text>
    </Pressable>
  );
}

/** Available / Locked / In Goals column inside the hero breakdown row. */
function BreakdownCol({
  label,
  value,
  dim,
  align = 'flex-start',
}: {
  label: string;
  value: string;
  dim?: boolean;
  align?: 'flex-start' | 'center' | 'flex-end';
}) {
  return (
    <View style={{ alignItems: align }}>
      <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60">{label}</Text>
      <Text className={`mt-1 text-sm font-bold ${dim ? 'text-white/60' : 'text-white'}`}>
        {value}
      </Text>
    </View>
  );
}

/** Tonal alert card with the design's border-l-4 accent. */
function AlertCard({
  bg,
  accent,
  titleClass,
  bodyClass,
  title,
  body,
  onPress,
}: {
  bg: string;
  accent: string;
  titleClass: string;
  bodyClass: string;
  title: string;
  body: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <Text className={`text-[15px] font-bold ${titleClass}`}>{title}</Text>
      <Text className={`mt-0.5 text-[13px] ${bodyClass}`}>{body}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          selection();
          onPress();
        }}
        className={`rounded-xl border-l-4 p-4 active:opacity-80 ${bg}`}
        style={{ borderLeftColor: accent }}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View className={`rounded-xl border-l-4 p-4 ${bg}`} style={{ borderLeftColor: accent }}>
      {inner}
    </View>
  );
}

/**
 * Inline approve/decline for one pending request. Kept as its own component so
 * the per-id useRespondApproval hook sits at a component's top level.
 */
function PendingCard({ req }: { req: ApprovalRequest }) {
  const respond = useRespondApproval(req.id);
  const busy = respond.isPending;
  const deciding = respond.variables?.decision;

  const decide = (decision: 'approve' | 'reject') => {
    if (busy) return;
    selection();
    respond.mutate({ decision }, { onSuccess: () => notifySuccess() });
  };

  return (
    <Card className="mt-3">
      <View className="flex-row items-center">
        <LinearGradient
          colors={gradients.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text className="text-xs font-bold text-white">{initials(req.initiator.name)}</Text>
        </LinearGradient>
        <View className="ml-3 flex-1">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {req.initiator.name}&apos;s Request
          </Text>
          <Text className="mt-0.5 text-[13px] text-muted" numberOfLines={1}>
            {formatMoney(req.amount)} · {req.description || approvalActionLabel(req.action)}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row" style={{ gap: 10 }}>
        <Pressable
          onPress={() => decide('approve')}
          disabled={busy}
          className={`flex-1 items-center justify-center rounded-lg bg-brand py-2 ${
            busy ? 'opacity-60' : 'active:opacity-80'
          }`}
        >
          {busy && deciding === 'approve' ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text className="text-[13px] font-bold text-white">Approve</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => decide('reject')}
          disabled={busy}
          className={`flex-1 items-center justify-center rounded-lg bg-lav-faint py-2 ${
            busy ? 'opacity-60' : 'active:opacity-80'
          }`}
        >
          {busy && deciding === 'reject' ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Text className="text-[13px] font-bold text-muted">Decline</Text>
          )}
        </Pressable>
      </View>
    </Card>
  );
}

/** 48%-wide goal card with the gold progress track. */
function GoalCard({ wallet, onPress }: { wallet: Wallet; onPress: () => void }) {
  const v = walletVisual(wallet.type);
  const balance = parseFloat(wallet.balance || '0') || 0;
  const target = parseFloat(wallet.target_amount ?? '0') || 0;
  const pct = target > 0 ? Math.round((balance / target) * 100) : null;

  return (
    <Card
      onPress={() => {
        selection();
        onPress();
      }}
      style={{ width: '48%', marginBottom: 14 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-lav-soft">
          <Ionicons name={v.icon} size={16} color={v.gradient[0]} />
        </View>
        {pct !== null ? <Text className="text-xs font-bold text-muted">{pct}%</Text> : null}
      </View>
      <Text className="mt-3 text-[15px] font-bold text-ink" numberOfLines={1}>
        {wallet.name}
      </Text>
      {pct !== null ? (
        <>
          <View className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-lav-faint">
            <View
              className="h-1.5 rounded-full bg-gold"
              style={{ width: `${Math.max(Math.min(pct, 100), 2)}%` }}
            />
          </View>
          <Text className="mt-2 text-xs text-muted" numberOfLines={2}>
            {formatMoney(wallet.balance)} of {formatMoney(wallet.target_amount)} saved
          </Text>
        </>
      ) : (
        <Text className="mt-2.5 text-xs text-muted">Saved {formatMoney(wallet.balance)}</Text>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const user = useAuth((s) => s.user);
  const dashboardQ = useDashboard();
  const familyQ = useFamily();
  const approvalsQ = useApprovals('to_me', 'pending');
  const [hidden, setHidden] = useState(false);
  const [stewardDismissed, setStewardDismissed] = useState(false);

  const data = dashboardQ.data;
  const wallets = useMemo(() => data?.wallets ?? [], [data]);
  const pendingReqs = useMemo(() => approvalsQ.data ?? [], [approvalsQ.data]);
  const members = familyQ.data?.members ?? [];

  const mainWallet = useMemo(() => wallets.find((w) => w.type === 'main') ?? wallets[0], [wallets]);
  const goalWallets = useMemo(() => wallets.filter((w) => GOAL_TYPES.includes(w.type)), [wallets]);
  const frozenWallets = useMemo(() => wallets.filter((w) => w.status === 'frozen'), [wallets]);

  const totalBalance = parseFloat(data?.total_balance ?? '0') || 0;
  const inGoals = useMemo(() => sumBalances(goalWallets), [goalWallets]);
  const locked = useMemo(() => sumBalances(frozenWallets), [frozenWallets]);
  const available = Math.max(0, totalBalance - inGoals - locked);

  const activeGoals = useMemo(
    () => goalWallets.filter((w) => (parseFloat(w.target_amount ?? '0') || 0) > 0).length,
    [goalWallets],
  );

  const familyName = useMemo(() => {
    const parts = (user?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length > 0 ? `${parts[parts.length - 1]} Family` : 'My Family';
  }, [user]);

  const inflow = parseFloat(data?.inflow_30d ?? '0') || 0;
  const outflow = parseFloat(data?.outflow_30d ?? '0') || 0;

  const verdict = useMemo(() => {
    if (inflow >= outflow * 1.1) {
      return {
        label: 'Strong',
        cls: 'text-brand',
        detail: `${formatMoney(inflow)} in vs ${formatMoney(outflow)} out — inflow leads this month.`,
      };
    }
    if (inflow >= outflow) {
      return {
        label: 'Steady',
        cls: 'text-gold-deep',
        detail: `${formatMoney(inflow)} in vs ${formatMoney(outflow)} out — holding even this month.`,
      };
    }
    return {
      label: 'Watch',
      cls: 'text-danger',
      detail: `${formatMoney(outflow)} out vs ${formatMoney(inflow)} in — spending leads this month.`,
    };
  }, [inflow, outflow]);

  const insight = useMemo(() => {
    const req = pendingReqs[0];
    if (req) {
      return `“${req.initiator.name} is asking for ${formatMoney(req.amount)} — review it below.”`;
    }
    const funded = goalWallets
      .map((w) => {
        const target = parseFloat(w.target_amount ?? '0') || 0;
        const pct = target > 0 ? Math.round(((parseFloat(w.balance || '0') || 0) / target) * 100) : 0;
        return { name: w.name, pct };
      })
      .filter((g) => g.pct >= 60)
      .sort((a, b) => b.pct - a.pct)[0];
    if (funded) {
      return `“The ${funded.name} goal is ${funded.pct}% funded and ahead of schedule.”`;
    }
    return `“All quiet — set a goal or a rule and I'll keep it on track.”`;
  }, [pendingReqs, goalWallets]);

  const unread = data?.unread_notifications ?? 0;
  const pendingCount = data?.pending_approvals ?? pendingReqs.length;
  const canUpgradeKyc = data?.kyc?.can_upgrade ?? false;
  const alertCount =
    (pendingCount > 0 ? 1 : 0) + (frozenWallets.length > 0 ? 1 : 0) + (canUpgradeKyc ? 1 : 0);

  const memberCount = (familyQ.data?.stats.total_members ?? members.length) + 1;

  const onRefresh = () => {
    void dashboardQ.refetch();
    void familyQ.refetch();
    void approvalsQ.refetch();
  };

  const mask = '••••';

  // ---- Top bar (always visible, in-screen) ----
  const topBar = (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center">
        <Pressable
          onPress={() => {
            selection();
            navigation.navigate('More');
          }}
          className="active:opacity-80"
        >
          <LinearGradient
            colors={gradients.avatar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ height: 42, width: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text className="text-sm font-bold text-white">{initials(user?.full_name)}</Text>
          </LinearGradient>
        </Pressable>
        <Text className="ml-3 text-xl font-extrabold text-muted" style={{ letterSpacing: -0.5 }}>
          Patriai
        </Text>
      </View>
      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('Notifications');
        }}
        className="h-11 w-11 items-center justify-center rounded-full bg-white active:opacity-80"
        style={shadow.soft}
      >
        <Ionicons name="notifications-outline" size={21} color={colors.ink} />
        {unread > 0 ? (
          <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1">
            <Text className="text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  if (dashboardQ.isLoading) {
    return (
      <Screen>
        <View style={{ padding: 20 }}>{topBar}</View>
        <View className="flex-1 items-center justify-center pb-24">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      </Screen>
    );
  }

  if (dashboardQ.error || !data) {
    return (
      <Screen>
        <View style={{ padding: 20 }}>{topBar}</View>
        <View className="flex-1 justify-center pb-24">
          <LoadError
            message={(dashboardQ.error as Error | null)?.message}
            onRetry={() => void dashboardQ.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={dashboardQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.navy}
          />
        }
      >
        {/* 1 · Top bar */}
        {topBar}

        {/* 2 · Family selector */}
        <Card
          className="mt-5 flex-row items-center"
          onPress={() => {
            selection();
            navigation.navigate('Family');
          }}
        >
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-gold-soft">
            <MaterialCommunityIcons
              name="human-male-female-child"
              size={22}
              color={colors.goldDeep}
            />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-extrabold text-ink">{familyName}</Text>
            <Text className="mt-0.5 text-xs text-muted">
              {memberCount} member{memberCount === 1 ? '' : 's'} · {activeGoals} active goal
              {activeGoals === 1 ? '' : 's'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faded} />
        </Card>

        {/* 3 · Family presence */}
        <View className="mt-7">
          <View className="flex-row items-center justify-between">
            <SectionLabel>Family Presence</SectionLabel>
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Family');
              }}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text className="text-xs font-bold text-gold-deep">View All</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3"
            contentContainerStyle={{ gap: 14, paddingRight: 8 }}
          >
            <PresenceAvatar
              name={user?.full_name ?? 'You'}
              displayName="You"
              role="Owner"
              onPress={() => navigation.navigate('Family')}
            />
            {members.map((m) => (
              <PresenceAvatar
                key={m.id}
                name={m.name}
                displayName={m.name.split(/\s+/)[0] ?? m.name}
                role={roleLabel(m.role)}
                onPress={() => navigation.navigate('FamilyMember', { memberId: m.id })}
              />
            ))}
          </ScrollView>
        </View>

        {/* 4 · Treasury balance hero */}
        <LinearGradient
          colors={gradients.navy}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { borderRadius: 24, marginTop: 28, padding: 28, overflow: 'hidden' },
            shadow.hero,
          ]}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              height: 192,
              width: 192,
              borderRadius: 96,
              backgroundColor: colors.gold,
              opacity: 0.08,
            }}
          />

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="wallet-outline" size={15} color="rgba(255,255,255,0.8)" />
              <Text className="ml-2 text-sm text-white/80">Total Treasury Balance</Text>
            </View>
            <Pressable
              onPress={() => {
                selection();
                setHidden((h) => !h);
              }}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-full bg-white/10 active:opacity-70"
            >
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={15}
                color={colors.white}
              />
            </Pressable>
          </View>

          <Text className="mt-2 text-4xl font-extrabold tracking-tight text-white">
            {hidden ? '₦•••••••' : formatMoney(data.total_balance)}
          </Text>

          <View className="mt-2 flex-row items-center">
            <Ionicons name="trending-up" size={15} color={colors.brandMint} />
            <Text className="ml-1.5 text-[13px] font-semibold text-brand-mint">
              {hidden ? mask : `+${formatMoney(data.inflow_30d)}`} in this month
            </Text>
          </View>

          <View className="my-6 flex-row justify-between border-y border-white/10 py-4">
            <BreakdownCol label="Available" value={hidden ? mask : formatMoney(available)} />
            <BreakdownCol
              label="Locked"
              value={hidden ? mask : formatMoney(locked)}
              dim
              align="center"
            />
            <BreakdownCol
              label="In Goals"
              value={hidden ? mask : formatMoney(inGoals)}
              align="flex-end"
            />
          </View>

          <View className="flex-row" style={{ gap: 8 }}>
            <HeroAction
              icon="paper-plane"
              label="Send"
              onPress={() => navigation.navigate('Transfer', { walletId: mainWallet?.id })}
            />
            <HeroAction
              icon="add-circle"
              label="Fund"
              disabled={!mainWallet}
              onPress={() => mainWallet && navigation.navigate('Fund', { walletId: mainWallet.id })}
            />
            <HeroAction
              icon="wallet"
              label="Wallet"
              onPress={() => navigation.navigate('Treasury')}
            />
            <HeroAction
              icon="person-add"
              label="Invite"
              onPress={() => navigation.navigate('Family')}
            />
          </View>
        </LinearGradient>

        {/* 5 · Health + Steward */}
        <View className="mt-7" style={{ gap: 16 }}>
          <Card style={{ backgroundColor: colors.pageTop }}>
            <SectionLabel>Status Report</SectionLabel>
            <Text className="mt-1 text-lg font-bold text-ink">Family Financial Health</Text>
            <Text className={`mt-2 text-3xl font-extrabold ${verdict.cls}`}>{verdict.label}</Text>
            <Text className="mt-1.5 text-[13px] leading-5 text-muted">{verdict.detail}</Text>
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Steward');
              }}
              className="mt-4 items-center rounded-xl bg-lav-soft py-3 active:opacity-80"
            >
              <Text className="text-sm font-bold text-muted">See Insights</Text>
            </Pressable>
          </Card>

          {!stewardDismissed ? (
            <LinearGradient
              colors={['#FFCC00', '#F1C100']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 16, padding: 20 }, shadow.gold]}
            >
              <View className="flex-row items-center">
                <MaterialCommunityIcons name="creation" size={16} color={GOLD_INK} />
                <Text
                  className="ml-1.5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: GOLD_INK }}
                >
                  Steward AI
                </Text>
              </View>
              <Text
                className="mt-3 text-base font-bold leading-tight"
                style={{ color: GOLD_INK }}
              >
                {insight}
              </Text>
              <View className="mt-4 flex-row" style={{ gap: 8 }}>
                <Pressable
                  onPress={() => {
                    selection();
                    navigation.navigate('Steward');
                  }}
                  className="rounded-lg px-4 py-2 active:opacity-80"
                  style={{ backgroundColor: GOLD_INK }}
                >
                  <Text className="text-xs font-bold text-white">Review</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    selection();
                    setStewardDismissed(true);
                  }}
                  className="rounded-lg px-4 py-2 active:opacity-70"
                  style={{ backgroundColor: 'rgba(61, 47, 0, 0.1)' }}
                >
                  <Text className="text-xs font-bold" style={{ color: GOLD_INK }}>
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            </LinearGradient>
          ) : null}
        </View>

        {/* 6 · Recent activity */}
        <View className="mt-7">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="history" size={18} color={colors.muted} />
            <Text className="ml-2 text-lg font-bold text-ink">Recent Activity</Text>
          </View>
          <View className="mt-3" style={{ gap: 10 }}>
            {data.recent_transactions.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                message="Fund your wallet to see activity here."
                icon="swap-vertical-outline"
              />
            ) : (
              data.recent_transactions.slice(0, 3).map((t) => <TxnRow key={t.id} txn={t} />)
            )}
          </View>
          {data.recent_transactions.length > 0 ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Activity');
              }}
              className="mt-2 flex-row items-center justify-center py-3 active:opacity-70"
            >
              <Text className="text-sm font-bold text-gold-deep">View all</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.goldDeep} />
            </Pressable>
          ) : null}
        </View>

        {/* 7 · Alerts */}
        {alertCount > 0 ? (
          <View className="mt-7">
            <View className="flex-row items-center">
              <SectionLabel>Alerts</SectionLabel>
              <View className="ml-2 h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5">
                <Text className="text-[10px] font-bold text-white">{alertCount}</Text>
              </View>
            </View>
            <View className="mt-3" style={{ gap: 10 }}>
              {pendingCount > 0 ? (
                <AlertCard
                  bg="bg-danger-soft"
                  accent={colors.danger}
                  titleClass="text-danger"
                  bodyClass="text-rose"
                  title="Approvals waiting"
                  body={`${pendingCount} request${pendingCount === 1 ? '' : 's'} need${
                    pendingCount === 1 ? 's' : ''
                  } your sign-off.`}
                  onPress={() => navigation.navigate('Approvals', { scope: 'to_me' })}
                />
              ) : null}
              {frozenWallets.length > 0 ? (
                <AlertCard
                  bg="bg-lav-soft"
                  accent={colors.muted}
                  titleClass="text-ink"
                  bodyClass="text-muted"
                  title={`Wallet${frozenWallets.length === 1 ? '' : 's'} frozen`}
                  body={frozenWallets.map((w) => w.name).join(', ')}
                />
              ) : null}
              {canUpgradeKyc ? (
                <AlertCard
                  bg="bg-gold-soft"
                  accent={colors.gold}
                  titleClass="text-gold-deep"
                  bodyClass="text-gold-deep"
                  title="Raise your limits"
                  body="Verify your identity"
                  onPress={() => navigation.navigate('Kyc')}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {/* 8 · Pending — inline approve */}
        {pendingReqs.length > 0 ? (
          <View className="mt-7">
            <SectionLabel>Pending</SectionLabel>
            <PendingCard req={pendingReqs[0]} />
          </View>
        ) : null}

        {/* 9 · Family goals */}
        <View className="mt-7">
          <View className="flex-row items-center">
            <Ionicons name="flag" size={17} color={colors.muted} />
            <Text className="ml-2 text-lg font-bold text-ink">Family Goals</Text>
          </View>
          {goalWallets.length === 0 ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('CreateGoal');
              }}
              className="mt-3 items-center rounded-3xl bg-page-top p-6 active:opacity-80"
            >
              <View className="h-12 w-12 items-center justify-center rounded-full bg-gold-soft">
                <Ionicons name="flag" size={20} color={colors.goldDeep} />
              </View>
              <Text className="mt-3 text-[15px] font-bold text-ink">Create your first goal</Text>
              <Text className="mt-1 text-center text-xs text-muted">
                Save toward school fees, a trip or a rainy day.
              </Text>
            </Pressable>
          ) : (
            <View className="mt-3 flex-row flex-wrap justify-between">
              {goalWallets.map((w) => (
                <GoalCard
                  key={w.id}
                  wallet={w}
                  onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
