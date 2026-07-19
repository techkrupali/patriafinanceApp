import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import {
  useSync,
  useWallets,
  useCreateSync,
  useRespondSync,
  useUpdateSyncTransparency,
  useSyncLifecycle,
} from '../../api/hooks';
import { formatMoney, initials, dayLabel } from '../../lib/format';
import { selection, notifySuccess } from '../../lib/haptics';
import type { SpousalSync, SyncTransparency } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const partnerName = (s: SpousalSync): string =>
  'name' in s.partner ? s.partner.name : s.partner.identifier;

interface TransparencyOption {
  value: SyncTransparency;
  label: string;
  hint: string;
  icon: IconName;
}

const TRANSPARENCY_OPTIONS: TransparencyOption[] = [
  { value: 'minimal', label: 'Minimal', hint: "Only that you're synced", icon: 'lock-closed-outline' },
  { value: 'selective', label: 'Selective', hint: 'Only wallets you choose', icon: 'options-outline' },
  { value: 'full', label: 'Full', hint: 'All your wallets & activity', icon: 'eye-outline' },
];

export function SpousalSyncScreen(_props: RootScreenProps<'SpousalSync'>) {
  const q = useSync();
  const wallets = useWallets();
  const createSync = useCreateSync();

  const sync = q.data?.sync ?? null;
  const history = q.data?.history ?? [];
  const syncId = sync?.id ?? 0;

  const respond = useRespondSync(syncId);
  const updateTransparency = useUpdateSyncTransparency(syncId);
  const lifecycle = useSyncLifecycle(syncId);

  // ---- local UI state ----
  const [identifier, setIdentifier] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [transparency, setTransparency] = useState<SyncTransparency>('minimal');
  const [walletIds, setWalletIds] = useState<number[]>([]);

  // Seed local state from the server whenever the active sync changes.
  useEffect(() => {
    if (sync) {
      setTransparency(sync.transparency);
      setWalletIds(sync.shared_wallet_ids ?? []);
    }
  }, [sync?.id, sync?.transparency, sync?.shared_wallet_ids]);

  const ownedWallets = (wallets.data ?? []).filter((w) => w.my_role === 'owner');

  const sendRequest = () => {
    setCreateError(null);
    if (!identifier.trim()) {
      setCreateError('Enter your partner’s email or phone.');
      return;
    }
    createSync.mutate(
      { identifier: identifier.trim() },
      {
        onSuccess: () => {
          notifySuccess();
          setIdentifier('');
        },
        onError: (e) => setCreateError(e.message),
      },
    );
  };

  const chooseTransparency = (value: SyncTransparency) => {
    selection();
    setTransparency(value);
    // Non-selective modes apply immediately; selective waits for the wallet chooser.
    if (value !== 'selective') {
      updateTransparency.mutate(
        { transparency: value },
        { onSuccess: () => notifySuccess() },
      );
    }
  };

  const toggleWallet = (id: number) => {
    selection();
    setWalletIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveSelectiveWallets = () => {
    updateTransparency.mutate(
      { transparency: 'selective', wallet_ids: walletIds },
      { onSuccess: () => notifySuccess() },
    );
  };

  const confirmEnd = () => {
    if (!sync) return;
    Alert.alert('End sync', `Stop syncing finances with ${partnerName(sync)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End sync',
        style: 'destructive',
        onPress: () => lifecycle.end.mutate(undefined, { onSuccess: () => notifySuccess() }),
      },
    ]);
  };

  return (
    <Screen withBottomInset>
      <Header title="Spousal Sync" />

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.navy} />
          }
        >
          {/* ---------- A) No sync — intro + invite ---------- */}
          {!sync ? (
            <>
              <Card className="items-center">
                <LinearGradient
                  colors={gradients.brand}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    { height: 64, width: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
                    shadow.soft,
                  ]}
                >
                  <Ionicons name="heart" size={30} color={colors.white} />
                </LinearGradient>
                <Text className="mt-4 text-center text-lg font-extrabold text-ink">
                  Sync finances with your partner
                </Text>
                <Text className="mt-2 text-center text-[14px] leading-5 text-muted">
                  Link accounts for mutual transparency. You each choose how much to share — from a
                  simple heads-up to your full activity — and either of you can pause or end it anytime.
                </Text>
              </Card>

              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                Invite your partner
              </Text>
              <Card className="mt-3">
                <Input
                  label="Partner's email or phone"
                  icon="at-outline"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="them@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <ErrorText message={createError} className="mt-4" />
                <Button
                  title="Send sync request"
                  icon="paper-plane"
                  onPress={sendRequest}
                  loading={createSync.isPending}
                  className="mt-5"
                />
              </Card>
            </>
          ) : null}

          {/* ---------- B) Pending — initiator ---------- */}
          {sync && sync.status === 'pending' && sync.is_initiator ? (
            <Card className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-3xl bg-lav-soft">
                <Ionicons name="hourglass-outline" size={28} color={colors.navy} />
              </View>
              <Text className="mt-4 text-center text-lg font-extrabold text-ink">
                Waiting for {partnerName(sync)}
              </Text>
              <Text className="mt-1.5 text-center text-[14px] text-muted">
                They'll get a request to accept.
              </Text>
              <Button
                title="Cancel request"
                icon="close-circle-outline"
                variant="danger"
                onPress={() => lifecycle.end.mutate(undefined, { onSuccess: () => notifySuccess() })}
                loading={lifecycle.end.isPending}
                className="mt-6"
              />
            </Card>
          ) : null}

          {/* ---------- C) Pending — recipient ---------- */}
          {sync && sync.status === 'pending' && !sync.is_initiator ? (
            <Card className="items-center">
              <LinearGradient
                colors={gradients.avatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 56, width: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className="text-base font-bold text-white">{initials(partnerName(sync))}</Text>
              </LinearGradient>
              <Text className="mt-4 text-center text-lg font-extrabold text-ink">
                {partnerName(sync)} wants to sync finances
              </Text>
              <Text className="mt-1.5 text-center text-[14px] text-muted">
                Accept to share finances with mutual transparency. You choose what they can see.
              </Text>
              <Button
                title="Accept"
                icon="checkmark-circle"
                onPress={() => respond.mutate(true, { onSuccess: () => notifySuccess() })}
                loading={respond.isPending}
                className="mt-6"
              />
              <Button
                title="Decline"
                icon="close-circle-outline"
                variant="danger"
                onPress={() => respond.mutate(false)}
                loading={respond.isPending}
                className="mt-3"
              />
            </Card>
          ) : null}

          {/* ---------- D) Active / paused — main card ---------- */}
          {sync && (sync.status === 'active' || sync.status === 'paused') ? (
            <>
              {/* Hero */}
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
              >
                <View className="flex-row items-center">
                  <View className="mr-3.5 h-14 w-14 items-center justify-center rounded-full bg-white/15">
                    <Text className="text-base font-bold text-white">{initials(partnerName(sync))}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                      Syncing with
                    </Text>
                    <Text className="text-[22px] font-extrabold leading-tight text-white" numberOfLines={1}>
                      {partnerName(sync)}
                    </Text>
                  </View>
                  <View
                    className={`rounded-full px-3 py-1 ${
                      sync.status === 'active' ? 'bg-white/20' : 'bg-black/20'
                    }`}
                  >
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-white">
                      {sync.status === 'active' ? 'Active' : 'Paused'}
                    </Text>
                  </View>
                </View>
                {sync.status === 'paused' ? (
                  <View className="mt-4 flex-row items-center rounded-2xl bg-black/15 px-3.5 py-2.5">
                    <Ionicons name="pause-circle" size={16} color={colors.white} style={{ marginRight: 8 }} />
                    <Text className="flex-1 text-[12px] font-medium text-white/90">
                      Sync is paused — sharing is on hold until you resume.
                    </Text>
                  </View>
                ) : null}
              </LinearGradient>

              {/* Transparency selector */}
              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                Transparency
              </Text>
              <View className="mt-3" style={{ gap: 10 }}>
                {TRANSPARENCY_OPTIONS.map((o) => {
                  const active = transparency === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => chooseTransparency(o.value)}
                      className={`flex-row items-center rounded-2xl border p-4 active:opacity-90 ${
                        active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                      }`}
                    >
                      <View
                        className={`mr-3 h-10 w-10 items-center justify-center rounded-2xl ${
                          active ? 'bg-white' : 'bg-lav-faint'
                        }`}
                      >
                        <Ionicons name={o.icon} size={19} color={active ? colors.brand : colors.muted} />
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="text-[15px] font-bold text-ink">{o.label}</Text>
                        <Text className="mt-0.5 text-[13px] text-muted">{o.hint}</Text>
                      </View>
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={active ? colors.brand : colors.faded}
                      />
                    </Pressable>
                  );
                })}
              </View>

              {/* Selective wallet chooser */}
              {transparency === 'selective' ? (
                <>
                  <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Wallets to share
                  </Text>
                  {ownedWallets.length > 0 ? (
                    <>
                      <Card className="mt-3 py-1">
                        {ownedWallets.map((w, i) => {
                          const on = walletIds.includes(w.id);
                          return (
                            <View key={w.id}>
                              <Pressable
                                onPress={() => toggleWallet(w.id)}
                                className="flex-row items-center py-3.5 active:opacity-80"
                              >
                                <View className="flex-1 pr-3">
                                  <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                                    {w.name}
                                  </Text>
                                  <Text className="text-[12px] text-faded">{formatMoney(w.balance)}</Text>
                                </View>
                                <Ionicons
                                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                                  size={24}
                                  color={on ? colors.brand : colors.faded}
                                />
                              </Pressable>
                              {i < ownedWallets.length - 1 ? (
                                <View style={{ height: 1, backgroundColor: colors.border }} />
                              ) : null}
                            </View>
                          );
                        })}
                      </Card>
                      <Button
                        title="Update shared wallets"
                        icon="save-outline"
                        onPress={saveSelectiveWallets}
                        loading={updateTransparency.isPending}
                        className="mt-4"
                      />
                    </>
                  ) : (
                    <Card className="mt-3">
                      <Text className="text-sm text-muted">
                        You don't own any wallets to share yet.
                      </Text>
                    </Card>
                  )}
                </>
              ) : null}

              {/* Shared wallets summary */}
              {sync.wallets.length > 0 ? (
                <>
                  <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                    Shared wallets
                  </Text>
                  <View className="mt-3" style={{ gap: 10 }}>
                    {sync.wallets.map((w) => (
                      <Card key={w.id} className="flex-row items-center py-4">
                        <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-lav-soft">
                          <Ionicons name="wallet-outline" size={20} color={colors.navy} />
                        </View>
                        <View className="flex-1 pr-2">
                          <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                            {w.name}
                          </Text>
                          <View className="mt-1 self-start rounded-full bg-lav-faint px-2.5 py-1">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
                              {w.type}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-[15px] font-bold text-ink">{formatMoney(w.balance)}</Text>
                      </Card>
                    ))}
                  </View>
                </>
              ) : null}

              {/* Lifecycle actions */}
              <View className="mt-8" style={{ gap: 12 }}>
                {sync.status === 'active' ? (
                  <Button
                    title="Pause sync"
                    icon="pause-outline"
                    variant="secondary"
                    onPress={() => lifecycle.pause.mutate(undefined, { onSuccess: () => notifySuccess() })}
                    loading={lifecycle.pause.isPending}
                  />
                ) : (
                  <Button
                    title="Resume sync"
                    icon="play-outline"
                    onPress={() => lifecycle.resume.mutate(undefined, { onSuccess: () => notifySuccess() })}
                    loading={lifecycle.resume.isPending}
                  />
                )}
                <Button
                  title="End sync"
                  icon="close-circle-outline"
                  variant="danger"
                  onPress={confirmEnd}
                  loading={lifecycle.end.isPending}
                />
              </View>
            </>
          ) : null}

          {/* ---------- E) History ---------- */}
          {history.length > 0 ? (
            <>
              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                History
              </Text>
              <Card className="mt-3 py-1">
                {history.map((s, i) => (
                  <View key={s.id}>
                    <View className="flex-row items-center py-3.5">
                      <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-lav-faint">
                        <Ionicons name="time-outline" size={16} color={colors.muted} />
                      </View>
                      <Text className="flex-1 text-[14px] text-ink" numberOfLines={1}>
                        {partnerName(s)}
                        <Text className="text-muted"> · ended {dayLabel(s.responded_at ?? s.created_at)}</Text>
                      </Text>
                    </View>
                    {i < history.length - 1 ? (
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
