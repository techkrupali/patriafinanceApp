import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Switch, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorText } from './ErrorText';
import { colors } from '../theme';
import { useRemoveMember, useUpdateMember } from '../api/hooks';
import { initials } from '../lib/format';
import { ROLE_OPTIONS, roleLabel } from '../lib/governance';
import { selection } from '../lib/haptics';
import type { WalletMember } from '../api/types';

interface MemberManageModalProps {
  walletId: number;
  member: WalletMember | null;
  onClose: () => void;
}

/** Owner/co-owner sheet to change a member's role, toggle approver rights, or remove them. */
export function MemberManageModal({ walletId, member, onClose }: MemberManageModalProps) {
  const insets = useSafeAreaInsets();
  const update = useUpdateMember(walletId);
  const remove = useRemoveMember(walletId);
  const [role, setRole] = useState<string>('contributor');
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setCanApprove(member.can_approve);
      setError(null);
    }
  }, [member]);

  const memberId = member?.id;
  const dirty = member ? role !== member.role || canApprove !== member.can_approve : false;

  const save = () => {
    if (!member || memberId === undefined) return;
    setError(null);
    update.mutate(
      { memberId, body: { role, can_approve: canApprove } },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e.message),
      },
    );
  };

  const confirmRemove = () => {
    if (!member || memberId === undefined) return;
    Alert.alert('Remove member', `Remove ${member.name} from this wallet?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          remove.mutate(memberId, {
            onSuccess: () => onClose(),
            onError: (e) => setError(e.message),
          }),
      },
    ]);
  };

  const busy = update.isPending || remove.isPending;

  return (
    <Modal visible={member !== null} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-[32px] bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />

          {member ? (
            <>
              <View className="flex-row items-center">
                <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-lav-soft">
                  <Text className="text-sm font-bold text-navy">{initials(member.name)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-extrabold text-ink" numberOfLines={1}>
                    {member.name}
                  </Text>
                  <Text className="text-xs text-faded" numberOfLines={1}>
                    {member.email}
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>

              <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">Role</Text>
              <View className="mt-2" style={{ gap: 8 }}>
                {ROLE_OPTIONS.map((r) => {
                  const active = role === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => {
                        selection();
                        setRole(r.value);
                      }}
                      className={`flex-row items-center rounded-2xl border p-3 active:opacity-90 ${
                        active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                      }`}
                    >
                      <View className="flex-1">
                        <Text className="text-[14px] font-bold text-ink">{r.label}</Text>
                        <Text className="text-xs text-muted">{r.hint}</Text>
                      </View>
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={active ? colors.brand : colors.faded}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-4 flex-row items-center rounded-2xl bg-lav-faint p-4">
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.navy} style={{ marginRight: 10 }} />
                <View className="flex-1 pr-2">
                  <Text className="text-[14px] font-semibold text-ink">Can approve</Text>
                  <Text className="text-xs text-muted">Let this member approve pending spends</Text>
                </View>
                <Switch
                  value={canApprove}
                  onValueChange={setCanApprove}
                  trackColor={{ false: colors.border, true: colors.brand }}
                  thumbColor={colors.white}
                />
              </View>

              <ErrorText message={error} className="mt-4" />

              <Pressable
                onPress={save}
                disabled={busy || !dirty}
                className={`mt-5 items-center justify-center rounded-2xl bg-navy py-4 ${
                  busy || !dirty ? 'opacity-50' : 'active:opacity-90'
                }`}
                style={{ minHeight: 52 }}
              >
                {update.isPending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text className="text-base font-semibold text-white">Save changes</Text>
                )}
              </Pressable>

              <Pressable
                onPress={confirmRemove}
                disabled={busy}
                className="mt-2 flex-row items-center justify-center rounded-2xl py-3.5 active:opacity-70"
              >
                {remove.isPending ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <>
                    <Ionicons name="person-remove-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
                    <Text className="text-sm font-semibold text-danger">Remove from wallet</Text>
                  </>
                )}
              </Pressable>

              <Text className="mt-2 text-center text-[11px] text-faded">Currently a {roleLabel(member.role)}</Text>
            </>
          ) : null}
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
