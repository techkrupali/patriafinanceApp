import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useFamily } from '../../api/hooks';
import { initials } from '../../lib/format';
import { roleLabel } from '../../lib/governance';
import { selection } from '../../lib/haptics';
import type { FamilyMember, FamilyInvitation } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-4" style={shadow.soft}>
      <Text className="text-[26px] font-extrabold leading-tight text-ink">{value}</Text>
      <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</Text>
    </View>
  );
}

function MemberRow({ member }: { member: FamilyMember }) {
  const approver = member.memberships.some((ms) => ms.can_approve);
  return (
    <View className="flex-row items-center py-3">
      <LinearGradient
        colors={gradients.avatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height: 44,
          width: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Text className="text-sm font-bold text-white">{member.avatar || initials(member.name)}</Text>
      </LinearGradient>
      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
          {member.name}
        </Text>
        <Text className="text-xs text-faded" numberOfLines={1}>
          {member.email}
        </Text>
      </View>
      <View className="items-end">
        <View className="rounded-full bg-lav-faint px-2.5 py-1">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {roleLabel(member.role)}
          </Text>
        </View>
        <Text className="mt-1 text-[11px] text-faded">
          In {member.memberships.length} wallet{member.memberships.length === 1 ? '' : 's'}
        </Text>
        {approver ? (
          <View className="mt-0.5 flex-row items-center">
            <Ionicons name="shield-checkmark" size={11} color={colors.brand} style={{ marginRight: 3 }} />
            <Text className="text-[10px] font-semibold text-brand">Approver</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function InviteRow({
  icon,
  tile,
  iconColor,
  title,
  subtitle,
  right,
}: {
  icon: IconName;
  tile: string;
  iconColor: string;
  title: string;
  subtitle: string;
  right: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center py-3">
      <View className={`mr-3 h-11 w-11 items-center justify-center rounded-2xl ${tile}`}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-xs text-faded" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function FamilyHubScreen({ navigation }: RootScreenProps<'FamilyHub'>) {
  const family = useFamily();

  const data = family.data;
  const members = data?.members ?? [];
  const stats = data?.stats;
  const received = data?.pending_invitations.received ?? [];
  const sent = data?.pending_invitations.sent ?? [];
  const hasPending = received.length > 0 || sent.length > 0;

  const inviteSubtitle = (inv: FamilyInvitation) =>
    `${inv.wallet_name ?? 'A wallet'} · ${roleLabel(inv.role)}`;

  return (
    <Screen withBottomInset>
      <Header title="Family Hub" />

      {family.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : family.error ? (
        <LoadError message={(family.error as Error).message} onRetry={family.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={family.isRefetching} onRefresh={family.refetch} tintColor={colors.navy} />
          }
        >
          {/* Hero */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center">
              <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                <Ionicons name="people" size={16} color={colors.white} />
              </View>
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                Your Family
              </Text>
            </View>
            <Text className="mt-4 text-[34px] font-extrabold leading-tight tracking-tight text-white">
              {stats?.total_members ?? 0} member{(stats?.total_members ?? 0) === 1 ? '' : 's'}
            </Text>
            <Text className="mt-1 text-[13px] text-white/60">
              across {stats?.shared_wallets ?? 0} shared wallet{(stats?.shared_wallets ?? 0) === 1 ? '' : 's'}
            </Text>
          </LinearGradient>

          {/* Stats strip */}
          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <StatTile value={stats?.total_members ?? 0} label="Members" />
            <StatTile value={stats?.shared_wallets ?? 0} label="Shared" />
            {stats && stats.child_wallets > 0 ? (
              <StatTile value={stats.child_wallets} label="Children" />
            ) : (
              <StatTile value={stats?.pending_invites ?? 0} label="Pending" />
            )}
          </View>

          {/* Members */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Members</Text>
          {members.length > 0 ? (
            <Card className="mt-3 py-1">
              {members.map((m, i) => (
                <View key={m.id}>
                  <MemberRow member={m} />
                  {i < members.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: colors.border }} />
                  ) : null}
                </View>
              ))}
            </Card>
          ) : (
            <Card className="mt-3">
              <EmptyState
                icon="people-outline"
                title="No family members yet"
                message="Invite people to your shared wallets and they'll appear here."
              />
            </Card>
          )}

          {/* Pending invitations */}
          {hasPending ? (
            <>
              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                Pending Invitations
              </Text>
              <Card className="mt-3 py-1">
                {received.map((inv, i) => (
                  <View key={`r-${inv.id}`}>
                    <InviteRow
                      icon="mail-open-outline"
                      tile="bg-lav-soft"
                      iconColor={colors.navy}
                      title={`${inv.inviter?.name ?? 'Someone'} invited you`}
                      subtitle={inviteSubtitle(inv)}
                      right={
                        <Pressable
                          onPress={() => {
                            selection();
                            navigation.navigate('Invitations');
                          }}
                          hitSlop={6}
                          className="flex-row items-center rounded-full bg-lav px-3.5 py-1.5 active:opacity-80"
                        >
                          <Text className="text-[12px] font-bold text-navy">Review</Text>
                        </Pressable>
                      }
                    />
                    {i < received.length - 1 || sent.length > 0 ? (
                      <View style={{ height: 1, backgroundColor: colors.border }} />
                    ) : null}
                  </View>
                ))}
                {sent.map((inv, i) => (
                  <View key={`s-${inv.id}`}>
                    <InviteRow
                      icon="paper-plane-outline"
                      tile="bg-lav-faint"
                      iconColor={colors.muted}
                      title={`Invited ${inv.invited_identifier}`}
                      subtitle={inviteSubtitle(inv)}
                      right={
                        <View className="flex-row items-center rounded-full bg-lav-faint px-2.5 py-1">
                          <Ionicons name="time-outline" size={12} color={colors.muted} style={{ marginRight: 4 }} />
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
                            Pending
                          </Text>
                        </View>
                      }
                    />
                    {i < sent.length - 1 ? (
                      <View style={{ height: 1, backgroundColor: colors.border }} />
                    ) : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
