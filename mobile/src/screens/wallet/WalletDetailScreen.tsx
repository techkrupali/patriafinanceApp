import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
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

function ActionButton({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="flex-1 items-center active:opacity-70"
    >
      {primary ? (
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { height: 56, width: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
            shadow.soft,
          ]}
        >
          <Ionicons name={icon} size={22} color={colors.white} />
        </LinearGradient>
      ) : (
        <View
          className="h-14 w-14 items-center justify-center rounded-2xl bg-lav-soft"
          style={[shadow.soft, { borderRadius: 18 }]}
        >
          <Ionicons name={icon} size={22} color={colors.navy} />
        </View>
      )}
      <Text className="mt-2 text-[12px] font-semibold text-ink">{label}</Text>
    </Pressable>
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
  // Members with ids (for management) — only fetched when the user can manage.
  const richMembers = useWalletMembers(walletId, canManage);

  const target = parseFloat(wallet?.target_amount ?? '');
  const balanceNum = parseFloat(wallet?.balance ?? '0');
  const hasTarget = Number.isFinite(target) && target > 0;
  const targetPct = hasTarget ? Math.min((balanceNum / target) * 100, 100) : 0;

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

  const settingsGear = canManage ? (
    <Pressable
      onPress={() => {
        selection();
        navigation.navigate('WalletSettings', { walletId });
      }}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
      style={shadow.soft}
    >
      <Ionicons name="settings-outline" size={20} color={colors.ink} />
    </Pressable>
  ) : undefined;

  return (
    <Screen>
      <Header title={wallet?.name ?? 'Wallet'} right={settingsGear} />

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={refresh} />
      ) : wallet ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={detail.isRefetching} onRefresh={refresh} tintColor={colors.navy} />
          }
        >
          {/* Balance hero */}
          <LinearGradient
            colors={visual.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                  <Ionicons name={visual.icon} size={16} color={colors.white} />
                </View>
                <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                  {visual.label} Wallet
                </Text>
              </View>
              <View className="rounded-full bg-white/20 px-2.5 py-1">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-brand-glow">
                  {wallet.status}
                </Text>
              </View>
            </View>
            <Text className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Available balance
            </Text>
            <Text className="mt-1 text-[40px] font-extrabold leading-tight tracking-tight text-white">
              {formatMoney(wallet.balance)}
            </Text>

            {hasTarget ? (
              <View className="mt-3">
                <View className="h-2 overflow-hidden rounded-full bg-white/15">
                  <View className="h-2 rounded-full bg-brand-mint" style={{ width: `${Math.max(targetPct, 2)}%` }} />
                </View>
                <Text className="mt-1.5 text-[11px] text-white/70">
                  {Math.floor(targetPct)}% of {formatMoney(wallet.target_amount)} target
                </Text>
              </View>
            ) : null}

            {wallet.virtual_account ? (
              <Pressable
                onPress={() => void copyAccount()}
                className="mt-4 flex-row items-center self-start rounded-2xl bg-white/10 px-3.5 py-2 active:opacity-80"
              >
                <Ionicons name="card-outline" size={15} color={colors.brandGlow} style={{ marginRight: 7 }} />
                <Text className="text-[13px] font-semibold text-white">
                  {wallet.virtual_account}
                  {wallet.virtual_account_bank ? ` · ${wallet.virtual_account_bank}` : ''}
                </Text>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={15}
                  color={copied ? colors.brandGlow : colors.white}
                  style={{ marginLeft: 8 }}
                />
              </Pressable>
            ) : null}
          </LinearGradient>

          {/* Governance status */}
          {approval || held > 0 ? (
            <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
              {approval ? (
                <View
                  className={`flex-row items-center rounded-full px-3 py-1.5 ${
                    approval.enabled ? 'bg-success-soft' : 'bg-lav-faint'
                  }`}
                >
                  <Ionicons
                    name={approval.enabled ? 'shield-checkmark' : 'shield-outline'}
                    size={14}
                    color={approval.enabled ? colors.brand : colors.muted}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    className={`text-[11px] font-bold ${approval.enabled ? 'text-brand' : 'text-muted'}`}
                  >
                    {approval.enabled
                      ? `Approvals on · ${
                          approval.threshold ? `over ${formatMoney(approval.threshold)}` : 'all spends'
                        }`
                      : 'Approvals off'}
                  </Text>
                </View>
              ) : null}
              {held > 0 ? (
                <View className="flex-row items-center rounded-full bg-lav-faint px-3 py-1.5">
                  <Ionicons name="lock-closed" size={13} color={colors.muted} style={{ marginRight: 5 }} />
                  <Text className="text-[11px] font-bold text-muted">{formatMoney(held)} held</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Pending approvals banner */}
          {pending > 0 ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('Approvals', { scope: 'to_me' });
              }}
              className="mt-4 flex-row items-center rounded-3xl bg-navy p-4 active:opacity-90"
              style={shadow.card}
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-2xl bg-white/20">
                <Ionicons name="hourglass-outline" size={18} color={colors.brandGlow} />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-bold text-white">
                  {pending} pending approval{pending === 1 ? '' : 's'}
                </Text>
                <Text className="text-xs text-white/60">Review spends waiting on this wallet</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.brandGlow} />
            </Pressable>
          ) : null}

          {/* Actions — spend buttons are hidden for view-only roles (they 403). */}
          <View className="mt-6 flex-row rounded-3xl bg-white px-2 py-5" style={[shadow.card, { gap: 8 }]}>
            <ActionButton icon="add" label="Fund" primary onPress={() => navigation.navigate('Fund', { walletId })} />
            {canSpend ? (
              <>
                <ActionButton icon="arrow-down" label="Withdraw" onPress={() => navigation.navigate('Withdraw', { walletId })} />
                <ActionButton icon="paper-plane" label="Transfer" onPress={() => navigation.navigate('Transfer', { walletId })} />
              </>
            ) : null}
          </View>
          {!canSpend ? (
            <View className="mt-3 flex-row items-start rounded-2xl bg-lav-faint px-4 py-3">
              <Ionicons name="eye-outline" size={15} color={colors.muted} style={{ marginRight: 8, marginTop: 1 }} />
              <Text className="flex-1 text-xs text-muted">
                You have view-only access to this wallet — withdrawals and transfers are disabled for your role.
              </Text>
            </View>
          ) : null}

          {/* Members */}
          {wallet.type !== 'main' ? (
            <>
              <View className="mt-7 flex-row items-center justify-between">
                <Text className="text-lg font-bold text-ink">
                  Members{members.length > 0 ? ` · ${members.length}` : ''}
                </Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  {canManage && members.length > 1 ? (
                    <Pressable
                      onPress={() => {
                        selection();
                        navigation.navigate('AssignAccess', { walletId });
                      }}
                      hitSlop={6}
                      className="flex-row items-center rounded-full bg-lav px-3.5 py-1.5 active:opacity-80"
                    >
                      <Ionicons name="options-outline" size={14} color={colors.navy} style={{ marginRight: 5 }} />
                      <Text className="text-[12px] font-bold text-navy">Access</Text>
                    </Pressable>
                  ) : null}
                  {canInvite ? (
                    <Pressable
                      onPress={() => {
                        selection();
                        navigation.navigate('InviteMember', { walletId });
                      }}
                      hitSlop={6}
                      className="flex-row items-center rounded-full bg-lav px-3.5 py-1.5 active:opacity-80"
                    >
                      <Ionicons name="person-add-outline" size={14} color={colors.navy} style={{ marginRight: 5 }} />
                      <Text className="text-[12px] font-bold text-navy">Invite</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {members.length > 0 ? (
                <Card className="mt-3 py-1">
                  {members.map((m, i) => {
                    const isOwner = m.role === 'owner';
                    // Only advertise a row as tappable once the rich member list
                    // (which carries the id needed to manage it) has loaded —
                    // otherwise the tap silently no-ops.
                    const tappable = canManage && !isOwner && richMembers.isSuccess;
                    const Row = tappable ? Pressable : View;
                    return (
                      <View key={m.user_id}>
                        <Row
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
                        {i < members.length - 1 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
                      </View>
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

          {/* Transactions */}
          <Text className="mt-7 text-lg font-bold text-ink">Transactions</Text>
          <View className="mt-3" style={{ gap: 10 }}>
            {txns.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color={colors.navy} />
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
                    className="items-center rounded-2xl bg-lav-soft py-3.5 active:opacity-80"
                  >
                    {txns.isFetchingNextPage ? (
                      <ActivityIndicator color={colors.navy} />
                    ) : (
                      <Text className="text-sm font-semibold text-navy">Load more</Text>
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
