import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useUpdateWallet, useWallet, useWalletDeletion } from '../../api/hooks';
import { selection, notifySuccess } from '../../lib/haptics';
import type { UpdateWalletPayload } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

export function WalletSettingsScreen({ navigation, route }: RootScreenProps<'WalletSettings'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const update = useUpdateWallet(walletId);

  const wallet = detail.data?.wallet;
  const approval = detail.data?.approval;
  const isMain = wallet?.type === 'main';

  const del = useWalletDeletion(walletId);
  const isArchived = wallet?.status === 'closed';
  const isOwner = (detail.data?.my_role ?? wallet?.my_role) === 'owner';
  const delBusy = del.archive.isPending || del.unarchive.isPending || del.remove.isPending;

  const confirmArchive = () => {
    if (!wallet) return;
    selection();
    Alert.alert(
      'Delete wallet',
      `"${wallet.name}" will be archived and hidden from your active wallets. You can restore it anytime. The wallet must be empty first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            del.archive.mutate(undefined, {
              onSuccess: () => {
                notifySuccess();
                navigation.goBack();
              },
              onError: (e) => Alert.alert('Could not delete', e.message),
            }),
        },
      ],
    );
  };

  const restore = () => {
    selection();
    del.unarchive.mutate(undefined, {
      onSuccess: () => notifySuccess(),
      onError: (e) => Alert.alert('Could not restore', e.message),
    });
  };

  const confirmDeleteForever = () => {
    if (!wallet) return;
    selection();
    Alert.alert(
      'Delete permanently',
      `This permanently removes "${wallet.name}" and its history. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () =>
            del.remove.mutate(undefined, {
              onSuccess: () => {
                notifySuccess();
                navigation.goBack();
              },
              onError: (e) => Alert.alert('Could not delete', e.message),
            }),
        },
      ],
    );
  };

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [threshold, setThreshold] = useState('');
  const [required, setRequired] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && wallet && approval) {
      setName(wallet.name);
      setDescription(wallet.description ?? '');
      setApprovalEnabled(approval.enabled);
      setThreshold(approval.threshold ?? '');
      setRequired(Math.max(approval.required_approvals || 1, 1));
      setInitialized(true);
    }
  }, [initialized, wallet, approval]);

  const save = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give your wallet a name.');
      return;
    }
    const body: UpdateWalletPayload = {
      name: name.trim(),
      description: description.trim(),
    };
    if (!isMain) {
      body.approval_enabled = approvalEnabled;
      if (approvalEnabled) {
        body.approval_threshold = threshold.trim() ? threshold.trim() : null;
        body.required_approvals = required;
      }
    }
    update.mutate(body, {
      onSuccess: () => navigation.goBack(),
      onError: (e) => setError(e.message),
    });
  };

  return (
    <Screen withBottomInset>
      <Header title="Wallet settings" />

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : detail.error ? (
        <LoadError message={(detail.error as Error).message} onRetry={() => detail.refetch()} />
      ) : wallet ? (
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
            <Input
              label="Wallet Name"
              icon="pricetag-outline"
              value={name}
              onChangeText={setName}
              placeholder="Wallet name"
              maxLength={100}
            />

            <Input
              label="Description (Optional)"
              icon="document-text-outline"
              value={description}
              onChangeText={setDescription}
              placeholder="What's this wallet for?"
              maxLength={200}
              containerClassName="mt-5"
            />

            {isMain ? (
              <View className="mt-7 flex-row items-start rounded bg-lav-faint p-4">
                <Ionicons name="information-circle" size={18} color={colors.brand} style={{ marginRight: 8, marginTop: 1 }} />
                <Text className="flex-1 text-[13px] leading-5 text-muted">
                  Approval controls aren't available on your main wallet.
                </Text>
              </View>
            ) : (
              <>
                <Text className="mt-8 text-[13px] font-semibold text-muted">
                  Spending Approvals
                </Text>

                <View className="mt-2 flex-row items-center rounded bg-lav-faint p-4">
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.navy} style={{ marginRight: 10 }} />
                  <View className="flex-1 pr-2">
                    <Text className="text-[15px] font-semibold text-ink">Require approval</Text>
                    <Text className="mt-0.5 text-[13px] leading-5 text-muted">
                      When on, withdrawals and transfers must be approved by chosen members before they go through.
                    </Text>
                  </View>
                  <Switch
                    value={approvalEnabled}
                    onValueChange={(v) => {
                      selection();
                      setApprovalEnabled(v);
                    }}
                    trackColor={{ false: colors.border, true: colors.brand }}
                    thumbColor={colors.white}
                  />
                </View>

                {approvalEnabled ? (
                  <>
                    <Input
                      label="Approval Threshold (Optional)"
                      icon="cash-outline"
                      value={threshold}
                      onChangeText={(t) => setThreshold(t.replace(/[^0-9.]/g, ''))}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      containerClassName="mt-5"
                    />
                    <Text className="mt-2 text-[13px] leading-5 text-muted">
                      {threshold.trim()
                        ? `Only spends over ${threshold.trim()} will need approval.`
                        : 'Leave empty to require approval on every spend.'}
                    </Text>

                    <Text className="mt-6 text-[13px] font-semibold text-muted">
                      Approvals Required
                    </Text>
                    <View className="mt-2 flex-row items-center justify-between rounded bg-lav-faint p-3">
                      <Pressable
                        onPress={() => {
                          selection();
                          setRequired((n) => Math.max(1, n - 1));
                        }}
                        disabled={required <= 1}
                        className={`h-11 w-11 items-center justify-center rounded bg-white ${
                          required <= 1 ? 'opacity-40' : 'active:opacity-70'
                        }`}
                      >
                        <Ionicons name="remove" size={22} color={colors.navy} />
                      </Pressable>
                      <View className="items-center">
                        <Text className="text-2xl font-extrabold text-ink">{required}</Text>
                        <Text className="text-[11px] text-muted">approver{required === 1 ? '' : 's'}</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          selection();
                          setRequired((n) => Math.min(10, n + 1));
                        }}
                        disabled={required >= 10}
                        className={`h-11 w-11 items-center justify-center rounded bg-white ${
                          required >= 10 ? 'opacity-40' : 'active:opacity-70'
                        }`}
                      >
                        <Ionicons name="add" size={22} color={colors.navy} />
                      </Pressable>
                    </View>
                    <Text className="mt-2 text-[13px] leading-5 text-muted">
                      Number of approvers who must sign off before a spend executes.
                    </Text>
                  </>
                ) : null}
              </>
            )}

            <ErrorText message={error} className="mt-5" />

            <Button title="Save changes" icon="checkmark" onPress={save} loading={update.isPending} className="mt-6" />

            {!isMain ? (
              <>
                <Text className="mt-9 text-[13px] font-semibold text-muted">
                  Wallet Controls
                </Text>
                <View className="mt-2 overflow-hidden rounded bg-white" style={{ borderWidth: 1, borderColor: colors.border }}>
                  <Pressable
                    onPress={() => {
                      selection();
                      navigation.navigate('WalletLock', { walletId });
                    }}
                    className="flex-row items-center p-4 active:opacity-70"
                  >
                    <View className="mr-3 h-10 w-10 items-center justify-center rounded bg-lav-faint">
                      <Ionicons name="lock-closed-outline" size={19} color={colors.navy} />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-[15px] font-semibold text-ink">Freeze &amp; scheduled access</Text>
                      <Text className="mt-0.5 text-[13px] text-muted">
                        {wallet.status === 'frozen'
                          ? 'Frozen — spending blocked'
                          : wallet.access_schedule
                            ? 'Spending allowed only in a time window'
                            : 'Freeze the wallet or set a spend window'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faded} />
                  </Pressable>
                  <View style={{ height: 1, backgroundColor: colors.border }} />
                  <Pressable
                    onPress={() => {
                      selection();
                      navigation.navigate('WalletAuditLog', { walletId });
                    }}
                    className="flex-row items-center p-4 active:opacity-70"
                  >
                    <View className="mr-3 h-10 w-10 items-center justify-center rounded bg-lav-faint">
                      <Ionicons name="receipt-outline" size={19} color={colors.navy} />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-[15px] font-semibold text-ink">Audit log</Text>
                      <Text className="mt-0.5 text-[13px] text-muted">Every change to this wallet</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.faded} />
                  </Pressable>
                </View>

                {/* Danger zone — delete/archive (owner only) */}
                {isOwner ? (
                  <>
                    <Text className="mt-9 text-[13px] font-semibold text-danger">
                      Danger Zone
                    </Text>
                    <View
                      className="mt-2 overflow-hidden rounded bg-white"
                      style={{ borderWidth: 1, borderColor: colors.border }}
                    >
                      {isArchived ? (
                        <>
                          <Pressable
                            onPress={restore}
                            disabled={delBusy}
                            className="flex-row items-center p-4 active:opacity-70"
                          >
                            <View className="mr-3 h-10 w-10 items-center justify-center rounded bg-lav-faint">
                              <Ionicons name="refresh-outline" size={19} color={colors.navy} />
                            </View>
                            <View className="flex-1 pr-2">
                              <Text className="text-[15px] font-semibold text-ink">Restore wallet</Text>
                              <Text className="mt-0.5 text-[13px] text-muted">
                                Move it back to your active wallets
                              </Text>
                            </View>
                            {del.unarchive.isPending ? (
                              <ActivityIndicator color={colors.navy} />
                            ) : (
                              <Ionicons name="chevron-forward" size={18} color={colors.faded} />
                            )}
                          </Pressable>
                          <View style={{ height: 1, backgroundColor: colors.border }} />
                          <Pressable
                            onPress={confirmDeleteForever}
                            disabled={delBusy}
                            className="flex-row items-center p-4 active:opacity-70"
                          >
                            <View className="mr-3 h-10 w-10 items-center justify-center rounded bg-danger-soft">
                              <Ionicons name="trash-outline" size={19} color={colors.danger} />
                            </View>
                            <View className="flex-1 pr-2">
                              <Text className="text-[15px] font-semibold text-danger">Delete permanently</Text>
                              <Text className="mt-0.5 text-[13px] text-muted">
                                Remove this wallet and its history — cannot be undone
                              </Text>
                            </View>
                            {del.remove.isPending ? <ActivityIndicator color={colors.danger} /> : null}
                          </Pressable>
                        </>
                      ) : (
                        <Pressable
                          onPress={confirmArchive}
                          disabled={delBusy}
                          className="flex-row items-center p-4 active:opacity-70"
                        >
                          <View className="mr-3 h-10 w-10 items-center justify-center rounded bg-danger-soft">
                            <Ionicons name="trash-outline" size={19} color={colors.danger} />
                          </View>
                          <View className="flex-1 pr-2">
                            <Text className="text-[15px] font-semibold text-danger">Delete wallet</Text>
                            <Text className="mt-0.5 text-[13px] text-muted">
                              Archives it (reversible). The wallet must be empty.
                            </Text>
                          </View>
                          {del.archive.isPending ? <ActivityIndicator color={colors.danger} /> : null}
                        </Pressable>
                      )}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
        </KeyboardAwareScrollView>
      ) : null}
    </Screen>
  );
}
