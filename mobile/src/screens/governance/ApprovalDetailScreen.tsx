import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { colors, shadow } from '../../theme';
import { useApproval, useCancelApproval, useRespondApproval } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatMoney, timeLabel } from '../../lib/format';
import { approvalActionLabel, approvalStatusVisual, statusIconColor } from '../../lib/governance';
import type { ApprovalResponse } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function ResponseRow({ response }: { response: ApprovalResponse }) {
  const approved = response.decision === 'approve';
  return (
    <View className="flex-row items-start py-3">
      <View
        className={`mr-3 h-8 w-8 items-center justify-center rounded-full ${
          approved ? 'bg-success-soft' : 'bg-danger-soft'
        }`}
      >
        <Ionicons
          name={approved ? 'checkmark' : 'close'}
          size={16}
          color={approved ? colors.brand : colors.danger}
        />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-ink">
          {response.approver?.name ?? 'Someone'} {approved ? 'approved' : 'rejected'}
        </Text>
        {response.note ? <Text className="mt-0.5 text-[13px] text-muted">“{response.note}”</Text> : null}
        <Text className="mt-0.5 text-[11px] text-faded">{timeLabel(response.created_at)}</Text>
      </View>
    </View>
  );
}

export function ApprovalDetailScreen({ route }: RootScreenProps<'ApprovalDetail'>) {
  const insets = useSafeAreaInsets();
  const { approvalId } = route.params;
  const myId = useAuth((s) => s.user?.id);
  const query = useApproval(approvalId);
  const respond = useRespondApproval(approvalId);
  const cancel = useCancelApproval(approvalId);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const approval = query.data;
  const status = approval ? approvalStatusVisual(approval.status) : null;
  const isMine = approval && myId != null && approval.initiator?.id === myId;
  const isPending = approval?.status === 'pending';
  const canRespond = Boolean(approval && isPending && !isMine && !approval.my_responded);
  const canCancel = Boolean(isMine && isPending);
  const responses = approval?.responses ?? [];

  const doApprove = () => {
    setError(null);
    respond.mutate(
      { decision: 'approve' },
      { onError: (e) => setError(e.message) },
    );
  };

  const doReject = () => {
    setError(null);
    respond.mutate(
      { decision: 'reject', note: note.trim() || undefined },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setNote('');
        },
        onError: (e) => {
          setRejectOpen(false);
          setError(e.message);
        },
      },
    );
  };

  const confirmCancel = () => {
    Alert.alert('Cancel request', 'Withdraw this approval request?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () => {
          setError(null);
          cancel.mutate(undefined, { onError: (e) => setError(e.message) });
        },
      },
    ]);
  };

  return (
    <Screen withBottomInset>
      <Header title="Approval" />

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : query.error ? (
        <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : approval && status ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
          }
        >
          {/* Amount hero */}
          <View className="items-center rounded-3xl bg-navy px-6 py-8" style={shadow.hero}>
            <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
              {approvalActionLabel(approval.action)}
            </Text>
            <Text className="mt-2 text-[38px] font-extrabold tracking-tight text-white">
              {formatMoney(approval.amount)}
            </Text>
            <View className={`mt-3 flex-row items-center rounded-full px-3 py-1.5 ${status.bg}`}>
              <Ionicons name={status.icon} size={13} color={statusIconColor(status)} style={{ marginRight: 5 }} />
              <Text className={`text-[11px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
            </View>
            <Text className="mt-3 text-[13px] font-semibold text-brand-glow">
              {approval.approvals_count} of {approval.required_approvals} approvals
            </Text>
          </View>

          {/* Details */}
          <Card className="mt-5 py-1">
            <DetailRow label="Wallet" value={approval.wallet?.name ?? '—'} />
            <Divider />
            <DetailRow label="Requested by" value={approval.initiator?.name ?? '—'} />
            {approval.description ? (
              <>
                <Divider />
                <DetailRow label="Note" value={approval.description} />
              </>
            ) : null}
            {parseFloat(approval.fee) > 0 ? (
              <>
                <Divider />
                <DetailRow label="Fee" value={formatMoney(approval.fee)} />
              </>
            ) : null}
            {approval.expires_at ? (
              <>
                <Divider />
                <DetailRow label="Expires" value={timeLabel(approval.expires_at)} />
              </>
            ) : null}
            <Divider />
            <DetailRow label="Requested" value={timeLabel(approval.created_at)} />
          </Card>

          {/* Resolution */}
          {approval.executed_transaction_reference ? (
            <View className="mt-4 flex-row items-center rounded-2xl bg-success-soft p-4">
              <Ionicons name="checkmark-done-circle" size={20} color={colors.brand} style={{ marginRight: 10 }} />
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-brand">Executed</Text>
                <Text className="text-xs text-muted">Ref · {approval.executed_transaction_reference}</Text>
              </View>
            </View>
          ) : null}
          {approval.fail_reason ? (
            <View className="mt-4 flex-row items-center rounded-2xl bg-danger-soft p-4">
              <Ionicons name="alert-circle" size={20} color={colors.danger} style={{ marginRight: 10 }} />
              <Text className="flex-1 text-[13px] font-semibold text-danger">{approval.fail_reason}</Text>
            </View>
          ) : null}

          {/* Responses timeline */}
          {responses.length > 0 ? (
            <>
              <Text className="mt-7 text-lg font-bold text-ink">Responses</Text>
              <Card className="mt-3 py-1">
                {responses.map((r, i) => (
                  <View key={i}>
                    <ResponseRow response={r} />
                    {i < responses.length - 1 ? <Divider /> : null}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <ErrorText message={error} className="mt-5" />

          {/* Actions */}
          {canRespond ? (
            <View className="mt-6" style={{ gap: 10 }}>
              <Button title="Approve" icon="checkmark" onPress={doApprove} loading={respond.isPending} />
              <Button
                title="Reject"
                variant="danger"
                icon="close"
                iconPosition="left"
                onPress={() => {
                  setNote('');
                  setRejectOpen(true);
                }}
              />
            </View>
          ) : canCancel ? (
            <Button
              title="Cancel request"
              variant="danger"
              icon="ban-outline"
              iconPosition="left"
              onPress={confirmCancel}
              loading={cancel.isPending}
              className="mt-6"
            />
          ) : isPending ? (
            <View className="mt-6 flex-row items-center justify-center rounded-2xl bg-lav-faint p-4">
              <Ionicons name="time-outline" size={16} color={colors.muted} style={{ marginRight: 8 }} />
              <Text className="text-[13px] font-semibold text-muted">
                {approval.my_responded ? 'You have already responded' : 'Waiting on other approvers'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {/* Reject note modal */}
      <Modal visible={rejectOpen} transparent animationType="slide" onRequestClose={() => setRejectOpen(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-[32px] bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />
            <View className="mb-4 flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-extrabold text-ink">Reject this spend?</Text>
                <Text className="mt-1 text-sm text-muted">Add an optional note for the requester.</Text>
              </View>
              <Pressable
                onPress={() => setRejectOpen(false)}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
            <View className="rounded-2xl border border-border bg-lav-faint px-4 py-1">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Reason (optional)"
                placeholderTextColor={colors.faded}
                multiline
                maxLength={200}
                className="min-h-[64px] py-3 text-[15px] text-ink"
                textAlignVertical="top"
              />
            </View>
            <Button
              title="Reject spend"
              variant="danger"
              icon="close"
              iconPosition="left"
              onPress={doReject}
              loading={respond.isPending}
              className="mt-4"
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</Text>
      <Text className="ml-4 flex-1 text-right text-[15px] font-semibold text-ink" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}
