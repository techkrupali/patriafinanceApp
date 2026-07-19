import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useFamilyMember } from '../../api/hooks';
import { formatMoney, timeLabel } from '../../lib/format';
import { roleLabel } from '../../lib/governance';
import { approvalStatusVisual, statusIconColor, approvalActionLabel } from '../../lib/governance';
import { walletVisual } from '../../lib/walletVisual';
import { selection } from '../../lib/haptics';
import type { WalletType } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-4" style={shadow.soft}>
      <Text className="text-[22px] font-extrabold leading-tight text-ink" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</Text>
    </View>
  );
}

/** A tiny ✓/✕ chip for one permission in the access summary row. */
function PermChip({ label, on }: { label: string; on: boolean }) {
  return (
    <View
      className={`flex-row items-center rounded-full px-2 py-0.5 ${on ? 'bg-success-soft' : 'bg-lav-faint'}`}
    >
      <Ionicons
        name={on ? 'checkmark' : 'close'}
        size={10}
        color={on ? colors.brand : colors.faded}
        style={{ marginRight: 2 }}
      />
      <Text className={`text-[10px] font-bold ${on ? 'text-brand' : 'text-faded'}`}>{label}</Text>
    </View>
  );
}

/** Family member detail — the parent's view of one person (Child Dashboard). */
export function FamilyMemberScreen({ navigation, route }: RootScreenProps<'FamilyMember'>) {
  const { memberId } = route.params;
  const q = useFamilyMember(memberId);
  const data = q.data;

  return (
    <Screen withBottomInset>
      <Header title={data?.person.name ?? 'Family member'} />

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : q.error || !data ? (
        <LoadError message={(q.error as Error)?.message} onRetry={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.navy} />
          }
        >
          {/* Person hero */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24, alignItems: 'center' }, shadow.hero]}
          >
            <View className="h-20 w-20 items-center justify-center rounded-full bg-white/15">
              <Text className="text-2xl font-bold text-white">{data.person.avatar}</Text>
            </View>
            <Text className="mt-3 text-[22px] font-extrabold text-white">{data.person.name}</Text>
            <Text className="mt-0.5 text-[13px] text-white/60">{data.person.email}</Text>
            <View className="mt-3 rounded-full bg-white/15 px-3 py-1">
              <Text className="text-[10px] font-bold uppercase tracking-widest text-white">
                {roleLabel(data.person.role)}
              </Text>
            </View>
          </LinearGradient>

          {/* Stats */}
          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <Stat value={data.stats.shared_wallets} label="Wallets" />
            <Stat value={data.stats.pending_requests} label="Pending" />
            <Stat value={data.stats.approved_requests_30d} label="Approved 30d" />
          </View>

          {/* Wallet access */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
            Wallet access
          </Text>
          {data.memberships.map((ms) => {
            const visual = walletVisual(ms.wallet_type as WalletType);
            const owner = ms.role === 'owner';
            return (
              <Card
                key={ms.wallet_id}
                className="mt-3"
                onPress={() => {
                  selection();
                  navigation.navigate('AssignAccess', { walletId: ms.wallet_id });
                }}
              >
                <View className="flex-row items-center">
                  <LinearGradient
                    colors={visual.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      height: 40,
                      width: 40,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Ionicons name={visual.icon} size={18} color={colors.white} />
                  </LinearGradient>
                  <View className="flex-1 pr-2">
                    <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                      {ms.wallet_name}
                    </Text>
                    <Text className="text-xs text-faded">{roleLabel(ms.role)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.faded} />
                </View>
                {owner ? (
                  <View className="mt-3 flex-row items-center rounded-2xl bg-success-soft px-3 py-2">
                    <Ionicons name="shield-checkmark" size={14} color={colors.brand} style={{ marginRight: 6 }} />
                    <Text className="text-[12px] font-semibold text-brand">Owns this wallet — full access</Text>
                  </View>
                ) : (
                  <View className="mt-3 flex-row flex-wrap items-center" style={{ gap: 6 }}>
                    <PermChip label="View" on={ms.permissions.view} />
                    <PermChip label="Fund" on={ms.permissions.fund} />
                    <PermChip label="Request" on={ms.permissions.request} />
                    <PermChip label="Withdraw" on={ms.permissions.withdraw} />
                    {ms.permissions.request_limit ? (
                      <View className="rounded-full bg-lav-faint px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-muted">
                          Limit {formatMoney(ms.permissions.request_limit)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </Card>
            );
          })}

          {/* Recent spend requests */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
            Spend requests
          </Text>
          {data.recent_requests.length > 0 ? (
            <Card className="mt-3 py-1">
              {data.recent_requests.map((r, i) => {
                const v = approvalStatusVisual(r.status);
                return (
                  <View key={r.id}>
                    <Pressable
                      onPress={() => {
                        selection();
                        navigation.navigate('ApprovalDetail', { approvalId: r.id });
                      }}
                      className="flex-row items-center py-3 active:opacity-70"
                    >
                      <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-lav-faint">
                        <Ionicons name="hand-left-outline" size={18} color={colors.navy} />
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="text-[14px] font-semibold text-ink" numberOfLines={1}>
                          {r.description || approvalActionLabel(r.action)}
                        </Text>
                        <Text className="text-xs text-faded">
                          {r.wallet.name} · {timeLabel(r.created_at)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-[14px] font-bold text-ink">{formatMoney(r.amount)}</Text>
                        <View className={`mt-1 flex-row items-center rounded-full px-2 py-0.5 ${v.bg}`}>
                          <Ionicons name={v.icon} size={10} color={statusIconColor(v)} style={{ marginRight: 3 }} />
                          <Text className={`text-[9px] font-bold uppercase tracking-wider ${v.text}`}>
                            {v.label}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                    {i < data.recent_requests.length - 1 ? (
                      <View style={{ height: 1, backgroundColor: colors.border }} />
                    ) : null}
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card className="mt-3">
              <Text className="text-sm text-muted">
                No spend requests yet — when {data.person.name.split(' ')[0]} asks for money, it shows up here.
              </Text>
            </Card>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
