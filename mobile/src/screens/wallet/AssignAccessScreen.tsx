import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { ErrorText } from '../../components/ErrorText';
import { colors, gradients } from '../../theme';
import { useWalletMembers, useUpdateMember } from '../../api/hooks';
import { initials } from '../../lib/format';
import { roleLabel } from '../../lib/governance';
import { notifySuccess } from '../../lib/haptics';
import type { WalletMember } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** The four boolean access toggles this screen edits (the read model's request_limit is not toggled here). */
type AccessToggles = { view: boolean; fund: boolean; request: boolean; withdraw: boolean };

const MATRIX: { key: keyof AccessToggles; label: string; hint: string; icon: IconName }[] = [
  { key: 'view', label: 'View', hint: 'See balance & activity', icon: 'eye-outline' },
  { key: 'fund', label: 'Fund', hint: 'Add money to this wallet', icon: 'add-circle-outline' },
  { key: 'request', label: 'Request', hint: 'Request a spend or approval', icon: 'hand-left-outline' },
  { key: 'withdraw', label: 'Withdraw', hint: 'Move money out (spend)', icon: 'arrow-up-circle-outline' },
];

/** The permissions a member's toggles are seeded from (server value, or role defaults). */
function baselinePerms(m: WalletMember): AccessToggles {
  const p = m.permissions;
  if (p) return { view: p.view, fund: p.fund, request: p.request, withdraw: p.withdraw };
  return { view: true, fund: true, request: true, withdraw: m.role !== 'viewer' };
}

function permsEqual(a: AccessToggles, b: AccessToggles): boolean {
  return a.view === b.view && a.fund === b.fund && a.request === b.request && a.withdraw === b.withdraw;
}

const isFullAccess = (role: string) => role === 'owner' || role === 'co_owner';

export function AssignAccessScreen({ route }: RootScreenProps<'AssignAccess'>) {
  const { walletId } = route.params;
  const { data, isLoading, error, refetch, isRefetching } = useWalletMembers(walletId);
  const update = useUpdateMember(walletId);

  const [edits, setEdits] = useState<Record<number, AccessToggles>>({});
  const [errors, setErrors] = useState<Record<number, string | null>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Seed local toggle state from the loaded members. Only fills in members we
  // haven't touched yet, so a background refetch never wipes unsaved edits.
  useEffect(() => {
    if (!data) return;
    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of data) {
        if (m.id === undefined || isFullAccess(m.role)) continue;
        if (!(m.id in next)) {
          next[m.id] = baselinePerms(m);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  const setPerm = (memberId: number, key: keyof AccessToggles, value: boolean) => {
    setEdits((prev) => ({ ...prev, [memberId]: { ...prev[memberId], [key]: value } }));
  };

  const save = (m: WalletMember) => {
    const memberId = m.id;
    if (memberId === undefined) return;
    const perms = edits[memberId];
    if (!perms) return;
    setErrors((e) => ({ ...e, [memberId]: null }));
    setSavingId(memberId);
    update.mutate(
      { memberId, body: { permissions: perms } },
      {
        onSuccess: () => {
          notifySuccess();
          setSavingId(null);
        },
        onError: (e) => {
          setErrors((prev) => ({ ...prev, [memberId]: e.message }));
          setSavingId(null);
        },
      },
    );
  };

  const manageable = (data ?? []).filter((m) => m.id !== undefined);

  return (
    <Screen withBottomInset>
      <Header title="Wallet access" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.navy} />
          }
        >
          <Text className="text-[15px] leading-5 text-muted">
            Fine-tune exactly what each member can do in this wallet. Owners and co-owners always
            have full access.
          </Text>

          {manageable.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon="options-outline"
              title="No members to manage"
              message="Invite members to this wallet first."
            />
          ) : (
            manageable.map((m) => {
              const full = isFullAccess(m.role);
              const local = edits[m.id!] ?? baselinePerms(m);
              const dirty = !full && !permsEqual(local, baselinePerms(m));
              const saving = savingId === m.id && update.isPending;

              return (
                <Card key={m.id} className="mt-3">
                  {/* Member header */}
                  <View className="flex-row items-center">
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
                      <Text className="text-sm font-bold text-white">{initials(m.name)}</Text>
                    </LinearGradient>
                    <View className="flex-1 pr-2">
                      <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Text className="text-xs text-faded" numberOfLines={1}>
                        {m.email}
                      </Text>
                    </View>
                    <View className="rounded-full bg-lav-faint px-2.5 py-1">
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        {roleLabel(m.role)}
                      </Text>
                    </View>
                  </View>

                  {full ? (
                    <View className="mt-4 flex-row items-center rounded-2xl bg-success-soft p-4">
                      <Ionicons name="shield-checkmark" size={20} color={colors.brand} style={{ marginRight: 10 }} />
                      <Text className="flex-1 text-[13px] font-medium text-brand">
                        Full access — owners & co-owners can do everything.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View className="mt-2">
                        {MATRIX.map((row, i) => {
                          const value = local[row.key];
                          const viewerWithdraw = row.key === 'withdraw' && m.role === 'viewer';
                          return (
                            <View
                              key={row.key}
                              className={`flex-row items-center py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                            >
                              <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-lav-faint">
                                <Ionicons name={row.icon} size={20} color={colors.navy} />
                              </View>
                              <View className="flex-1 pr-2">
                                <Text className="text-[14px] font-bold text-ink">{row.label}</Text>
                                <Text className="text-xs text-muted">{row.hint}</Text>
                                {viewerWithdraw ? (
                                  <Text className="mt-0.5 text-[11px] text-faded">
                                    Withdraw requires a spend-capable role.
                                  </Text>
                                ) : null}
                              </View>
                              <Switch
                                value={value}
                                onValueChange={(v) => setPerm(m.id!, row.key, v)}
                                trackColor={{ false: colors.border, true: colors.brand }}
                                thumbColor={colors.white}
                              />
                            </View>
                          );
                        })}
                      </View>

                      <ErrorText message={errors[m.id!]} className="mt-3" />

                      <Button
                        title="Save changes"
                        icon="checkmark"
                        onPress={() => save(m)}
                        loading={saving}
                        disabled={!dirty}
                        className="mt-4"
                      />
                    </>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
