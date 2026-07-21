import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { TxnRow } from '../../components/TxnRow';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { MemberManageModal } from '../../components/MemberManageModal';
import { colors, gradients, shadow } from '../../theme';
import { useWallet, useWalletMembers, useWalletTransactions } from '../../api/hooks';
import { formatMoney, initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { walletVisual } from '../../lib/walletVisual';
import { canInviteMembers, canManageWallet, roleLabel } from '../../lib/governance';
import type { WalletMember } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Main-treasury hero: dark gold/brown editorial gradient from the Stitch design. */
const TREASURY_HERO = ['#413B2A', '#241A00'] as const;
/** On-primary-container brown — text/icon colour on the #FFCC00 action pills. */
const ON_GOLD = '#6F5700';

/** Uppercase micro section heading (Stitch "RECENT TRANSACTIONS" treatment). */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-xs font-extrabold uppercase tracking-widest text-ink">{children}</Text>
  );
}

/** Gold action pill — icon over an uppercase label (Fund / Withdraw / Transfer / Request). */
function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="flex-1 items-center justify-center rounded-2xl bg-[#FFCC00] py-4 active:opacity-90"
      style={shadow.soft}
    >
      <Ionicons name={icon} size={24} color={ON_GOLD} />
      <Text className="mt-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#6F5700]">
        {label}
      </Text>
    </Pressable>
  );
}

/** Row inside the tonal Governance & Rules card. */
function GovRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View className="flex-row items-center">
      <Ionicons name={icon} size={18} color={colors.muted} style={{ marginRight: 14 }} />
      <Text className="flex-1 text-sm font-medium text-[#4B637E]">{text}</Text>
    </View>
  );
}

export function WalletDetailScreen({ navigation, route }: RootScreenProps<'WalletDetail'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const txns = useWalletTransactions(walletId);
  const [copied, setCopied] = useState(false);
  const [manageMember, setManageMember] = useState<WalletMember | null>(null);

  const wallet = detail.data?.wallet;
  const members = detail.data?.members ?? [];
  const role = detail.data?.my_role ?? wallet?.my_role;
  const approval = detail.data?.approval;
  const held = parseFloat(detail.data?.held_amount ?? '0');
  const pending = detail.data?.pending_approvals ?? 0;
  const allTxns = txns.data?.pages.flatMap((p) => p.transactions) ?? [];
  const visual = walletVisual(wallet?.type);

  const canManage = canManageWallet(role);
  const canInvite = canInviteMembers(role);
  // Spend actions (Withdraw/Transfer) 403 unless the server says this member may
  // spend. Owner/co_owner always can; admin/contributor only with an explicit
  // can_spend grant. Trust the backend's my_can_spend flag and fall back to the
  // role gate only if the field is absent (older payloads).
  const canSpend =
    detail.data?.my_can_spend ??
    (role != null && ['owner', 'co_owner'].includes(role));
  // Members who can't spend directly but hold the "Request" permission can raise
  // a spend request that the owner approves.
  const canRequest = detail.data?.my_can_request ?? false;
  // Members with ids (for management) — only fetched when the user can manage.
  const richMembers = useWalletMembers(walletId, canManage);

  const target = parseFloat(wallet?.target_amount ?? '');
  const balanceNum = parseFloat(wallet?.balance ?? '0');
  const hasTarget = Number.isFinite(target) && target > 0;
  const targetPct = hasTarget ? Math.min((balanceNum / target) * 100, 100) : 0;

  // The main treasury gets the dark-gold editorial hero; other types keep their
  // recognisable walletVisual material.
  const isMain = wallet?.type === 'main';
  const heroGradient = isMain ? TREASURY_HERO : visual.gradient;
  const heroDark = isMain ? true : visual.onDark;
  const heroSub = heroDark ? 'rgba(255,255,255,0.5)' : 'rgba(23,28,31,0.45)';
  const heroDivider = heroDark ? 'rgba(255,255,255,0.12)' : 'rgba(23,28,31,0.08)';
  const available = Math.max(balanceNum - held, 0);

  // Derived one-line insight (Stitch "AI insight" strip) from real wallet state.
  const insight = !canSpend
    ? canRequest
      ? 'You can request spends on this wallet — the owner reviews and approves them before money moves.'
      : 'You have view-only access to this wallet — withdrawals and transfers are disabled for your role.'
    : held > 0
      ? `${formatMoney(held)} is currently held against pending approvals.`
      : 'This wallet is currently fully available for use.';

  const refresh = () => {
    void detail.refetch();
    void txns.refetch();
    if (canManage) void richMembers.refetch();
  };

  const copyAccount = async () => {
    if (!wallet?.virtual_account) return;
    selection();
    await Clipboard.setStringAsync(wallet.virtual_account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const openManage = (m: WalletMember) => {
    // Match the embed member to its rich counterpart (which carries the member id).
    const rich = (richMembers.data ?? []).find((r) => r.user_id === m.user_id);
    if (!rich?.id) return;
    if (rich.role === 'owner') return;
    selection();
    setManageMember(rich);
  };

  return (
    <Screen>
      {/* Header — gold uppercase title, kebab settings (Stitch treatment) */}
      <View className="flex-row items-center px-5 py-3" style={{ minHeight: 56 }}>
        {navigation.canGoBack() ? (
          <Pressable
            onPress={() => {
              selection();
              navigation.goBack();
            }}
            hitSlop={10}
            className="mr-2 h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            style={{ marginLeft: -8 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.goldDeep} />
          </Pressable>
        ) : null}
        <Text
          className="flex-1 text-[16px] font-extrabold uppercase tracking-wider text-gold-deep"
          numberOfLines={1}
        >
          {wallet?.name ?? 'Wallet'}
        </Text>
        {canManage ? (
          <Pressable
            onPress={() => {
              selection();
              navigation.navigate('WalletSettings', { walletId });
            }}
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            style={{ marginRight: -8 }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.goldDeep} />
        </View>
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={refresh} />
      ) : wallet ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} tintColor={colors.goldDeep} />
          }
        >
          {/* Balance hero — editorial card with breakdown row */}
          <LinearGradient
            colors={heroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 32, padding: 28, overflow: 'hidden' }, shadow.hero]}
          >
            {/* Decorative gold wash */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -48,
                right: -48,
                height: 176,
                width: 176,
                borderRadius: 88,
                backgroundColor: heroDark ? 'rgba(241,193,0,0.14)' : 'rgba(255,255,255,0.35)',
              }}
            />

            <View className="flex-row items-center justify-between">
              <Text
                className="flex-1 pr-3 text-[11px] font-bold uppercase"
                style={{ letterSpacing: 2.5, color: heroDark ? 'rgba(255,224,139,0.8)' : colors.goldDeep }}
                numberOfLines={1}
              >
                {wallet.name}
              </Text>
              <View
                className={`rounded-full px-2.5 py-1 ${heroDark ? 'bg-white/20' : 'bg-white'}`}
                style={!heroDark ? shadow.soft : undefined}
              >
                <Text
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    heroDark ? 'text-brand-glow' : 'text-brand'
                  }`}
                >
                  {wallet.status}
                </Text>
              </View>
            </View>

            <Text
              className={`mt-2 text-[38px] font-extrabold leading-tight tracking-tight ${
                heroDark ? 'text-white' : 'text-ink'
              }`}
            >
              {formatMoney(wallet.balance)}
            </Text>

            {/* Breakdown row */}
            <View
              className="mt-6 flex-row items-center justify-between pt-5"
              style={{ borderTopWidth: 1, borderColor: heroDivider }}
            >
              <View>
                <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: heroSub }}>
                  Available
                </Text>
                <Text
                  className="mt-1 text-[13px] font-bold"
                  style={{ color: heroDark ? colors.brandGlow : colors.brand }}
                >
                  {formatMoney(available)}
                </Text>
              </View>
              <View className="items-center">
                <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: heroSub }}>
                  Held
                </Text>
                <Text className={`mt-1 text-[13px] font-bold ${heroDark ? 'text-white' : 'text-ink'}`}>
                  {formatMoney(held)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: heroSub }}>
                  Target
                </Text>
                <Text className={`mt-1 text-[13px] font-bold ${heroDark ? 'text-white' : 'text-ink'}`}>
                  {hasTarget ? formatMoney(wallet.target_amount) : '—'}
                </Text>
              </View>
            </View>

            {hasTarget ? (
              <View className="mt-4">
                <View
                  className="h-2 overflow-hidden rounded-full"
                  style={{ backgroundColor: heroDark ? 'rgba(255,255,255,0.15)' : 'rgba(23,28,31,0.08)' }}
                >
                  <View
                    className="h-2 rounded-full"
                    style={{ width: `${Math.max(targetPct, 2)}%`, backgroundColor: '#FFCC00' }}
                  />
                </View>
                <Text className="mt-1.5 text-[11px]" style={{ color: heroDark ? 'rgba(255,255,255,0.7)' : colors.muted }}>
                  {Math.floor(targetPct)}% of {formatMoney(wallet.target_amount)} target
                </Text>
              </View>
            ) : null}

            {wallet.virtual_account ? (
              <Pressable
                onPress={() => void copyAccount()}
                className={`mt-5 flex-row items-center self-start rounded-full px-3.5 py-2 active:opacity-80 ${
                  heroDark ? 'bg-white/10' : 'bg-white'
                }`}
                style={!heroDark ? shadow.soft : undefined}
              >
                <Ionicons
                  name="card-outline"
                  size={15}
                  color={heroDark ? colors.gold : colors.goldDeep}
                  style={{ marginRight: 7 }}
                />
                <Text className={`text-[13px] font-semibold ${heroDark ? 'text-white' : 'text-ink'}`}>
                  {wallet.virtual_account}
                  {wallet.virtual_account_bank ? ` · ${wallet.virtual_account_bank}` : ''}
                </Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={15}
                  color={
                    copied
                      ? heroDark
                        ? colors.brandGlow
                        : colors.brand
                      : heroDark
                        ? colors.white
                        : colors.muted
                  }
                  style={{ marginLeft: 8 }}
                />
              </Pressable>
            ) : null}
          </LinearGradient>

          {/* Insight strip */}
          <View className="mt-3 flex-row items-start rounded-xl bg-page-top p-4">
            <Ionicons name="sparkles" size={18} color={colors.goldDeep} style={{ marginRight: 12, marginTop: 1 }} />
            <Text className="flex-1 text-sm font-medium leading-5 text-muted">{insight}</Text>
          </View>

          {/* Pending approvals banner */}
          {pending > 0 ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Approvals', { scope: 'to_me' });
              }}
              className="mt-4 flex-row items-center rounded-2xl bg-navy p-4 active:opacity-90"
              style={shadow.card}
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-white/15">
                <Ionicons name="hourglass-outline" size={18} color={colors.gold} />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-bold text-white">
                  {pending} pending approval{pending === 1 ? '' : 's'}
                </Text>
                <Text className="text-xs text-white/60">Review spends waiting on this wallet</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            </Pressable>
          ) : null}

          {/* Primary actions — gold pills. Spend buttons stay hidden for roles that
              can't spend (they 403); request-only members see "Request". */}
          <View className="mt-6 flex-row" style={{ gap: 12 }}>
            <ActionButton icon="add-circle" label="Fund" onPress={() => navigation.navigate('Fund', { walletId })} />
            {canSpend ? (
              <>
                <ActionButton icon="cash" label="Withdraw" onPress={() => navigation.navigate('Withdraw', { walletId })} />
                <ActionButton icon="swap-horizontal" label="Transfer" onPress={() => navigation.navigate('Transfer', { walletId })} />
              </>
            ) : canRequest ? (
              <ActionButton icon="hand-left" label="Request" onPress={() => navigation.navigate('RequestSpend', { walletId })} />
            ) : null}
          </View>

          {/* Governance & Rules — tonal secondary-container card */}
          {approval || held > 0 ? (
            <View className="mt-7">
              <SectionTitle>Governance & Rules</SectionTitle>
              <View
                className="mt-3 rounded-2xl p-5"
                style={{ backgroundColor: 'rgba(199,223,255,0.35)', gap: 14 }}
              >
                {approval ? (
                  <GovRow
                    icon={approval.enabled ? 'shield-checkmark' : 'shield-outline'}
                    text={
                      approval.enabled
                        ? approval.threshold
                          ? `Approval required for spends over ${formatMoney(approval.threshold)}`
                          : 'Approval required for every spend'
                        : 'Approvals are off for this wallet'
                    }
                  />
                ) : null}
                {approval?.enabled && (approval.required_approvals ?? 1) > 1 ? (
                  <GovRow
                    icon="people-circle"
                    text={`${approval.required_approvals} approvals needed per spend`}
                  />
                ) : null}
                {held > 0 ? (
                  <GovRow icon="lock-closed" text={`${formatMoney(held)} held for pending approvals`} />
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Access & Members */}
          {wallet.type !== 'main' ? (
            <>
              <View className="mt-7 flex-row items-center justify-between">
                <SectionTitle>
                  {`Access & Members${members.length > 0 ? ` · ${members.length}` : ''}`}
                </SectionTitle>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  {canManage && members.length > 1 ? (
                    <Pressable
                      onPress={() => {
                        selection();
                        navigation.navigate('AssignAccess', { walletId });
                      }}
                      hitSlop={6}
                      className="flex-row items-center rounded-full px-3.5 py-1.5 active:opacity-80"
                      style={{ backgroundColor: 'rgba(255,204,0,0.20)' }}
                    >
                      <Ionicons name="options-outline" size={13} color={colors.goldDeep} style={{ marginRight: 5 }} />
                      <Text className="text-[12px] font-bold text-gold-deep">Access</Text>
                    </Pressable>
                  ) : null}
                  {canInvite ? (
                    <Pressable
                      onPress={() => {
                        selection();
                        navigation.navigate('InviteMember', { walletId });
                      }}
                      hitSlop={6}
                      className="flex-row items-center rounded-full px-3.5 py-1.5 active:opacity-80"
                      style={{ backgroundColor: 'rgba(255,204,0,0.20)' }}
                    >
                      <Ionicons name="person-add-outline" size={13} color={colors.goldDeep} style={{ marginRight: 5 }} />
                      <Text className="text-[12px] font-bold text-gold-deep">Invite</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {members.length > 0 ? (
                <Card className="mt-3 py-2">
                  {members.map((m) => {
                    const isOwner = m.role === 'owner';
                    // Only advertise a row as tappable once the rich member list
                    // (which carries the id needed to manage it) has loaded —
                    // otherwise the tap silently no-ops.
                    const tappable = canManage && !isOwner && richMembers.isSuccess;
                    const Row = tappable ? Pressable : View;
                    return (
                      <Row
                        key={m.user_id}
                        onPress={tappable ? () => openManage(m) : undefined}
                        className={`flex-row items-center py-3 ${tappable ? 'active:opacity-70' : ''}`}
                      >
                        <LinearGradient
                          colors={gradients.avatar}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{
                            height: 40,
                            width: 40,
                            borderRadius: 20,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <Text className="text-xs font-bold text-white">{initials(m.name)}</Text>
                        </LinearGradient>
                        <View className="flex-1 pr-2">
                          <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                            {m.name}
                          </Text>
                          <Text className="text-xs text-faded" numberOfLines={1}>
                            {m.email}
                          </Text>
                        </View>
                        <View className="items-end">
                          <View className="rounded-full bg-lav-faint px-2.5 py-1">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
                              {roleLabel(m.role)}
                            </Text>
                          </View>
                          {m.can_approve ? (
                            <View className="mt-1 flex-row items-center">
                              <Ionicons name="shield-checkmark" size={11} color={colors.brand} style={{ marginRight: 3 }} />
                              <Text className="text-[10px] font-semibold text-brand">Approver</Text>
                            </View>
                          ) : null}
                        </View>
                        {tappable ? (
                          <Ionicons name="ellipsis-horizontal" size={18} color={colors.faded} style={{ marginLeft: 8 }} />
                        ) : null}
                      </Row>
                    );
                  })}
                </Card>
              ) : (
                <Card className="mt-3">
                  <Text className="text-sm text-muted">
                    No members yet.{canInvite ? ' Invite someone to collaborate on this wallet.' : ''}
                  </Text>
                </Card>
              )}
            </>
          ) : null}

          {/* Recent transactions */}
          <View className="mt-7">
            <SectionTitle>Recent Transactions</SectionTitle>
          </View>
          <View className="mt-3" style={{ gap: 12 }}>
            {txns.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color={colors.goldDeep} />
              </View>
            ) : txns.error ? (
              <LoadError message={(txns.error as Error).message} onRetry={() => txns.refetch()} />
            ) : allTxns.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                message="Fund this wallet to see its history here."
                icon="swap-vertical-outline"
              />
            ) : (
              <>
                {allTxns.map((t) => (
                  <TxnRow key={t.id} txn={t} />
                ))}
                {txns.hasNextPage ? (
                  <Pressable
                    onPress={() => void txns.fetchNextPage()}
                    disabled={txns.isFetchingNextPage}
                    className="items-center rounded-2xl py-3.5 active:opacity-80"
                    style={{ backgroundColor: 'rgba(255,204,0,0.16)' }}
                  >
                    {txns.isFetchingNextPage ? (
                      <ActivityIndicator color={colors.goldDeep} />
                    ) : (
                      <Text className="text-xs font-extrabold uppercase tracking-widest text-gold-deep">
                        Load more
                      </Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      ) : null}

      <MemberManageModal walletId={walletId} member={manageMember} onClose={() => setManageMember(null)} />
    </Screen>
  );
}
