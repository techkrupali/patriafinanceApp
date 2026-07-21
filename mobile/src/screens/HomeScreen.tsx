import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/Screen';
import { LoadError } from '../components/LoadError';
import { FamilySwitcherModal } from '../components/FamilySwitcherModal';
import { colors, gradients, shadow } from '../theme';
import { useApprovals, useAutomations, useDashboard, useFamily } from '../api/hooks';
import { useAuth } from '../store/auth';
import { formatMoney, initials } from '../lib/format';
import { selection } from '../lib/haptics';
import { approvalActionLabel } from '../lib/governance';
import { walletVisual } from '../lib/walletVisual';
import type { ApprovalRequest, Wallet } from '../api/types';
import type { TabScreenProps } from '../navigation/types';

/** Wallet types that count as goals in the Ledger design. */
const GOAL_TYPES: readonly string[] = ['savings', 'goal', 'emergency', 'giving'];

// ---------------------------------------------------------------------------
// Stitch "home_dashboard_mobile_final_layout" tokens (code.html)
// ---------------------------------------------------------------------------

/** Treasury card — dark brown → gold gradient (from-[#241a00] to-[#584400]). */
const TREASURY_GRADIENT = ['#241A00', '#584400'] as const;
/** Steward insight card — tertiary green → deep green (from-tertiary to-[#004d21]). */
const STEWARD_GRADIENT = ['#006D2F', '#004D21'] as const;
/** View Treasury button fill (primary-container). */
const GOLD_BUTTON = '#FFCC00';
/** Dark ink on gold surfaces (client on-primary-container family). */
const GOLD_INK = '#3D2F00';
/** Soft gold action-tile fill (primary-container/20 flattened on the page). */
const GOLD_TILE = '#FFF3C4';

const sumBalances = (ws: Wallet[]): number =>
  ws.reduce((acc, w) => acc + (parseFloat(w.balance || '0') || 0), 0);

/** ₦ compact for the treasury breakdown (design shows ₦1.2M / ₦2.5M / ₦550K). */
function compactNaira(n: number): string {
  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
  if (safe >= 1_000_000) {
    const m = safe / 1_000_000;
    return `₦${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
  }
  if (safe >= 1_000) {
    const k = safe / 1_000;
    return `₦${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}K`;
  }
  return `₦${Math.round(safe)}`;
}

// ---------------------------------------------------------------------------
// Local pieces
// ---------------------------------------------------------------------------

/** AVAILABLE / LOCKED / GOALS column inside the treasury card. */
function BreakdownCol({
  label,
  value,
  valueColor,
  align = 'flex-start',
}: {
  label: string;
  value: string;
  valueColor?: string;
  align?: 'flex-start' | 'center' | 'flex-end';
}) {
  return (
    <View style={{ alignItems: align }}>
      <Text className="text-[9px] font-bold uppercase tracking-widest text-white/50">{label}</Text>
      <Text
        className="mt-1 text-sm font-bold text-white"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

/** White wallet card in the Active Wallets horizontal rail. */
function WalletCard({ wallet, onPress }: { wallet: Wallet; onPress: () => void }) {
  const v = walletVisual(wallet.type);
  const iconColor = v.onDark ? v.gradient[0] : colors.muted;
  const iconBg = `${v.gradient[1]}26`; // ~15% tint of the wallet's colour family

  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="mr-3 w-[230px] rounded-2xl bg-white p-4 active:opacity-90"
      style={shadow.soft}
    >
      <View className="flex-row items-start justify-between">
        <View
          className="h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: iconBg }}
        >
          <Ionicons name={v.icon} size={18} color={iconColor} />
        </View>
        <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.faded} />
      </View>
      <Text className="mt-7 text-[9px] font-bold uppercase tracking-wider text-muted">
        {v.label} WALLET
      </Text>
      <Text className="mt-1 text-xl font-extrabold text-ink" numberOfLines={1}>
        {formatMoney(wallet.balance)}
      </Text>
    </Pressable>
  );
}

/** One of the 4 gold quick-action tiles (SEND / FUND / CREATE WALLET / ADD MEMBER). */
function ActionTile({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-1 items-center">
      <Pressable
        onPress={() => {
          selection();
          onPress();
        }}
        disabled={disabled}
        className={`h-[52px] w-[52px] items-center justify-center rounded-xl ${
          disabled ? 'opacity-40' : 'active:opacity-80'
        }`}
        style={{ backgroundColor: GOLD_TILE }}
      >
        {children}
      </Pressable>
      <Text className="mt-2 text-center text-[9px] font-bold uppercase tracking-tight text-muted">
        {label}
      </Text>
    </View>
  );
}

/** Tonal Smart Alert row with the design's border-l-4 accent. */
function AlertRow({
  accent,
  icon,
  text,
}: {
  accent: string;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <View
      className="flex-row items-center rounded-xl bg-page-top p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      {icon}
      <Text className="ml-3 flex-1 text-[13px] font-semibold text-ink" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Row inside the Pending Approvals group — taps through to ApprovalDetail. */
function ApprovalRow({ req, onPress }: { req: ApprovalRequest; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="flex-row items-center py-2.5 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
        <Ionicons name="person-outline" size={17} color={colors.muted} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[13px] font-bold text-ink" numberOfLines={1}>
          {req.initiator.name}&apos;s request
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted" numberOfLines={1}>
          {req.description || approvalActionLabel(req.action)}
        </Text>
      </View>
      <Text className="ml-2 text-[15px] font-bold text-ink">{formatMoney(req.amount)}</Text>
    </Pressable>
  );
}

/** 48%-wide Goals Progress card; fill alternates gold-deep / slate per the design. */
function GoalCard({
  wallet,
  accent,
  onPress,
}: {
  wallet: Wallet;
  accent: string;
  onPress: () => void;
}) {
  const v = walletVisual(wallet.type);
  const balance = parseFloat(wallet.balance || '0') || 0;
  const target = parseFloat(wallet.target_amount ?? '0') || 0;
  const pct = target > 0 ? Math.round((balance / target) * 100) : null;

  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="rounded-2xl bg-white p-4 active:opacity-90"
      style={[{ width: '48%', marginBottom: 14 }, shadow.soft]}
    >
      <View className="flex-row items-center justify-between">
        <Ionicons name={v.icon} size={18} color={accent} />
        {pct !== null ? (
          <Text className="text-xs font-bold" style={{ color: accent }}>
            {pct}%
          </Text>
        ) : null}
      </View>
      <Text className="mt-3.5 text-[13px] font-bold text-ink" numberOfLines={1}>
        {wallet.name}
      </Text>
      <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-lav-faint">
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${pct !== null ? Math.max(Math.min(pct, 100), 2) : 2}%`,
            backgroundColor: accent,
          }}
        />
      </View>
    </Pressable>
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
  const automationsQ = useAutomations();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const data = dashboardQ.data;
  const wallets = useMemo(() => data?.wallets ?? [], [data]);
  const pendingReqs = useMemo(() => approvalsQ.data ?? [], [approvalsQ.data]);

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

  const firstName = useMemo(() => {
    const first = (user?.full_name ?? '').trim().split(/\s+/)[0];
    return first || 'there';
  }, [user]);

  const daypart = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  }, []);

  const inflow = parseFloat(data?.inflow_30d ?? '0') || 0;
  const outflow = parseFloat(data?.outflow_30d ?? '0') || 0;

  const unread = data?.unread_notifications ?? 0;
  const pendingCount = data?.pending_approvals ?? pendingReqs.length;
  const memberCount = (familyQ.data?.stats.total_members ?? familyQ.data?.members.length ?? 0) + 1;

  const activeCommitments = useMemo(
    () => (automationsQ.data ?? []).filter((r) => r.enabled).length,
    [automationsQ.data],
  );

  // ---- Smart Alerts (only true conditions render) ----
  const goalNearDone = useMemo(
    () =>
      goalWallets.some((w) => {
        const target = parseFloat(w.target_amount ?? '0') || 0;
        return target > 0 && (parseFloat(w.balance || '0') || 0) / target >= 0.8;
      }),
    [goalWallets],
  );
  const overspending = outflow > inflow && outflow > 0;
  const hasAlerts = pendingCount > 0 || goalNearDone || overspending;

  // ---- Steward AI insight (simple real-data heuristics) ----
  const insight = useMemo(() => {
    if (overspending) {
      const base = inflow > 0 ? inflow : outflow;
      const pct = Math.min(999, Math.round(((outflow - inflow) / base) * 100));
      if (pct >= 5) {
        return `“You spent ${pct}% more than you brought in this month. Let's review where it went.”`;
      }
    }
    const ahead = goalWallets
      .map((w) => {
        const target = parseFloat(w.target_amount ?? '0') || 0;
        const pct = target > 0 ? Math.round(((parseFloat(w.balance || '0') || 0) / target) * 100) : 0;
        return { name: w.name, pct };
      })
      .filter((g) => g.pct >= 60)
      .sort((a, b) => b.pct - a.pct)[0];
    if (ahead) {
      return `“The ${ahead.name} goal is ${ahead.pct}% funded and ahead of schedule.”`;
    }
    return `“All quiet this week — set a goal or a rule and I'll keep the family on track.”`;
  }, [overspending, inflow, outflow, goalWallets]);

  const commitmentLine =
    activeCommitments > 0
      ? `You're on track with ${activeCommitments} active commitment${
          activeCommitments === 1 ? '' : 's'
        }`
      : "You're on track — automate savings with a rule";

  const onRefresh = () => {
    void dashboardQ.refetch();
    void familyQ.refetch();
    void approvalsQ.refetch();
    void automationsQ.refetch();
  };

  // ---- 1 · Header (always visible, in-screen) ----
  const topBar = (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 flex-row items-center pr-3">
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
            style={{ height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text className="text-xs font-bold text-white">{initials(user?.full_name)}</Text>
          </LinearGradient>
        </Pressable>
        <Text
          className="ml-3 flex-1 text-lg font-extrabold text-ink"
          style={{ letterSpacing: -0.3 }}
          numberOfLines={1}
        >
          Good {daypart}, {firstName}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('Notifications');
        }}
        hitSlop={8}
        className="active:opacity-70"
      >
        <Ionicons name="notifications-outline" size={24} color={colors.muted} />
        {unread > 0 ? (
          <View className="absolute -right-2 -top-1.5 h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1">
            <Text className="text-[9px] font-bold text-white">{unread > 99 ? '99+' : unread}</Text>
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
        {/* 1 · Header */}
        {topBar}

        {/* 2 · Family selector — opens the switcher sheet */}
        <Pressable
          onPress={() => {
            selection();
            setSwitcherOpen(true);
          }}
          className="mt-6 flex-row items-center rounded-xl bg-page-top p-4 active:opacity-80"
        >
          <View className="flex-1">
            <Text className="text-[15px] font-extrabold text-gold-deep" style={{ letterSpacing: -0.2 }}>
              {familyName}
            </Text>
            <Text className="mt-0.5 text-xs font-medium text-muted">
              {memberCount} Member{memberCount === 1 ? '' : 's'} • {activeGoals} Active Goal
              {activeGoals === 1 ? '' : 's'}
            </Text>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-lav">
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </View>
        </Pressable>

        {/* 3 · Treasury card — dark brown → gold */}
        <LinearGradient
          colors={TREASURY_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ borderRadius: 16, marginTop: 32, padding: 24, overflow: 'hidden' }, shadow.hero]}
        >
          {/* Decorative gold glow (design's blurred circle) */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -48,
              right: -48,
              height: 192,
              width: 192,
              borderRadius: 96,
              backgroundColor: GOLD_BUTTON,
              opacity: 0.08,
            }}
          />

          <View className="flex-row items-start justify-between">
            <Text
              className="text-[10px] font-bold uppercase"
              style={{ color: 'rgba(255, 224, 139, 0.75)', letterSpacing: 2 }}
            >
              Total Treasury Balance
            </Text>
            <Ionicons name="wallet" size={20} color={colors.goldSoft} />
          </View>

          <Text
            className="mt-2 font-extrabold"
            style={{ color: colors.gold, fontSize: 34, letterSpacing: -1 }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(data.total_balance)}
          </Text>

          <View className="mt-5 flex-row justify-between">
            <BreakdownCol label="Available" value={compactNaira(available)} />
            <BreakdownCol label="Locked" value={compactNaira(locked)} align="center" />
            <BreakdownCol
              label="Goals"
              value={compactNaira(inGoals)}
              valueColor={colors.brandMint}
              align="flex-end"
            />
          </View>

          {/* Steward commitments strip */}
          <View
            className="mt-5 flex-row items-center rounded-lg px-3 py-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
          >
            <MaterialCommunityIcons name="creation" size={15} color={colors.gold} />
            <Text className="ml-2 flex-1 text-[11px] font-medium text-white/90" numberOfLines={1}>
              {commitmentLine}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              selection();
              navigation.navigate('Treasury');
            }}
            className="mt-4 items-center rounded-xl py-3 active:opacity-85"
            style={{ backgroundColor: GOLD_BUTTON }}
          >
            <Text className="text-[15px] font-bold" style={{ color: GOLD_INK }}>
              View Treasury
            </Text>
          </Pressable>
        </LinearGradient>

        {/* 4 · Active Wallets — horizontal rail */}
        {wallets.length > 0 ? (
          <View className="mt-8">
            <View className="flex-row items-end justify-between">
              <Text className="text-lg font-bold text-ink">Active Wallets</Text>
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('Treasury');
                }}
                hitSlop={8}
                className="active:opacity-70"
              >
                <Text className="text-xs font-bold text-gold-deep">See All</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3"
              style={{ marginHorizontal: -20 }}
              contentContainerStyle={{ paddingHorizontal: 20 }}
            >
              {wallets.map((w) => (
                <WalletCard
                  key={w.id}
                  wallet={w}
                  onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* 5 · Quick actions */}
        <View className="mt-8 flex-row" style={{ gap: 8 }}>
          <ActionTile label="Send" onPress={() => navigation.navigate('Transfer')}>
            <Ionicons name="send" size={20} color={colors.goldDeep} />
          </ActionTile>
          <ActionTile
            label="Fund"
            disabled={!mainWallet}
            onPress={() => mainWallet && navigation.navigate('Fund', { walletId: mainWallet.id })}
          >
            <MaterialCommunityIcons name="credit-card-plus" size={20} color={colors.goldDeep} />
          </ActionTile>
          <ActionTile label="Create Wallet" onPress={() => navigation.navigate('CreateWallet')}>
            <Ionicons name="wallet" size={20} color={colors.goldDeep} />
          </ActionTile>
          <ActionTile label="Add Member" onPress={() => navigation.navigate('Family')}>
            <Ionicons name="person-add" size={20} color={colors.goldDeep} />
          </ActionTile>
        </View>

        {/* 6 · Smart Alerts — only conditions that are true */}
        {hasAlerts ? (
          <View className="mt-8">
            <View className="flex-row items-center">
              <MaterialCommunityIcons name="bell-ring" size={18} color={colors.muted} />
              <Text className="ml-2 text-lg font-bold text-ink">Smart Alerts</Text>
            </View>
            <View className="mt-3" style={{ gap: 8 }}>
              {pendingCount > 0 ? (
                <AlertRow
                  accent={colors.goldDeep}
                  icon={
                    <MaterialCommunityIcons
                      name="exclamation-thick"
                      size={18}
                      color={colors.goldDeep}
                    />
                  }
                  text="Payment request pending"
                />
              ) : null}
              {goalNearDone ? (
                <AlertRow
                  accent={colors.brand}
                  icon={<MaterialCommunityIcons name="flag" size={18} color={colors.brand} />}
                  text="Goal nearing completion"
                />
              ) : null}
              {overspending ? (
                <AlertRow
                  accent={colors.danger}
                  icon={<Ionicons name="warning" size={18} color={colors.danger} />}
                  text="Unusual spending detected"
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {/* 7 · Pending Approvals — rows navigate to ApprovalDetail */}
        {pendingReqs.length > 0 ? (
          <View className="mt-8 rounded-2xl bg-lav-soft p-5">
            <Text className="text-lg font-bold text-ink">Pending Approvals</Text>
            <View className="mt-2">
              {pendingReqs.slice(0, 3).map((r) => (
                <ApprovalRow
                  key={r.id}
                  req={r}
                  onPress={() => navigation.navigate('ApprovalDetail', { approvalId: r.id })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* 8 · Goals Progress */}
        <View className="mt-8">
          <Text className="text-lg font-bold text-ink">Goals Progress</Text>
          {goalWallets.length === 0 ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('CreateGoal');
              }}
              className="mt-3 items-center rounded-2xl bg-page-top p-6 active:opacity-80"
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
              {goalWallets.map((w, i) => (
                <GoalCard
                  key={w.id}
                  wallet={w}
                  accent={i % 2 === 0 ? colors.goldDeep : colors.muted}
                  onPress={() => navigation.navigate('WalletDetail', { walletId: w.id })}
                />
              ))}
            </View>
          )}
        </View>

        {/* 9 · Steward AI Insight — dark green card */}
        <LinearGradient
          colors={STEWARD_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 16, marginTop: 32, padding: 24 }}
        >
          <View className="flex-row items-center">
            <View
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <MaterialCommunityIcons name="robot-happy" size={20} color={colors.white} />
            </View>
            <Text className="ml-3 text-base font-bold text-white">Steward AI Insight</Text>
          </View>
          <Text className="mt-4 text-sm font-medium text-white/90" style={{ lineHeight: 21 }}>
            {insight}
          </Text>
          <Pressable
            onPress={() => {
              selection();
              navigation.navigate('Steward');
            }}
            className="mt-5 items-center rounded-xl bg-white py-3 active:opacity-85"
          >
            <Text className="text-[15px] font-bold" style={{ color: colors.brand }}>
              Ask Steward
            </Text>
          </Pressable>
        </LinearGradient>
      </ScrollView>

      {/* Family switcher bottom sheet */}
      <FamilySwitcherModal
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        familyName={familyName}
        memberCount={memberCount}
        treasuryLabel={compactNaira(totalBalance)}
      />
    </Screen>
  );
}
