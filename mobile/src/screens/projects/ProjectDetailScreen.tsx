import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { ErrorText } from '../../components/ErrorText';
import { colors, gradients, shadow } from '../../theme';
import {
  useApproveMilestone,
  useCancelProject,
  useProject,
  useRejectMilestone,
  useRemoveMilestone,
  useRemoveVendor,
  useSubmitMilestone,
} from '../../api/hooks';
import { statusIconColor } from '../../lib/governance';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import {
  canRemoveMilestone,
  canReviewMilestone,
  canSubmitMilestone,
  milestoneStatusVisual,
  projectStatusVisual,
} from '../../lib/projects';
import type { Milestone } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type SheetKind = 'submit' | 'reject';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</Text>
      <Text className="mt-1 text-[15px] font-extrabold text-white" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MilestoneCard({
  milestone,
  isOwner,
  isVendor,
  onApprove,
  onReject,
  onRemove,
  onSubmit,
  busy,
}: {
  milestone: Milestone;
  isOwner: boolean;
  isVendor: boolean;
  onApprove: (m: Milestone) => void;
  onReject: (m: Milestone) => void;
  onRemove: (m: Milestone) => void;
  onSubmit: (m: Milestone) => void;
  busy: boolean;
}) {
  const status = milestoneStatusVisual(milestone.status);
  const showApprove = isOwner && canReviewMilestone(milestone.status);
  const showRemove = isOwner && canRemoveMilestone(milestone.status);
  const showSubmit = isVendor && canSubmitMilestone(milestone.status);

  return (
    <Card className="py-4">
      <View className="flex-row items-center">
        <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-lav-soft">
          <Text className="text-xs font-bold text-navy">{milestone.sequence}</Text>
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={2}>
            {milestone.title}
          </Text>
        </View>
        <Text className="text-[15px] font-extrabold text-ink">{formatMoney(milestone.amount)}</Text>
      </View>

      <View className="mt-2 flex-row items-center">
        <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
          <Ionicons name={status.icon} size={12} color={statusIconColor(status)} style={{ marginRight: 4 }} />
          <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
        </View>
      </View>

      {milestone.description ? (
        <Text className="mt-2.5 text-[13px] leading-5 text-muted">{milestone.description}</Text>
      ) : null}

      {milestone.proof ? (
        <View className="mt-3 rounded-2xl bg-lav-faint p-3.5">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">Vendor’s proof of work</Text>
          <Text className="mt-1 text-[13px] leading-5 text-ink">{milestone.proof}</Text>
        </View>
      ) : null}

      {milestone.status === 'released' && milestone.released_transaction_reference ? (
        <View className="mt-3 flex-row items-center">
          <Ionicons name="checkmark-done-circle" size={14} color={colors.brand} style={{ marginRight: 5 }} />
          <Text className="text-[12px] font-semibold text-brand">
            Paid · Ref {milestone.released_transaction_reference}
          </Text>
        </View>
      ) : null}

      {/* Role-based actions */}
      {showApprove ? (
        <View className="mt-4 flex-row" style={{ gap: 8 }}>
          <View className="flex-1">
            <Button
              title="Approve & pay"
              icon="checkmark"
              iconPosition="left"
              onPress={() => onApprove(milestone)}
              loading={busy}
            />
          </View>
          <View className="flex-1">
            <Button
              title="Reject"
              variant="danger"
              icon="close"
              iconPosition="left"
              onPress={() => onReject(milestone)}
            />
          </View>
        </View>
      ) : null}

      {showRemove ? (
        <Button
          title="Remove milestone"
          variant="ghost"
          icon="trash-outline"
          iconPosition="left"
          onPress={() => onRemove(milestone)}
          loading={busy}
          className="mt-3"
        />
      ) : null}

      {showSubmit ? (
        <Button
          title={milestone.status === 'rejected' ? 'Resubmit work' : 'Submit work'}
          icon="cloud-upload-outline"
          iconPosition="left"
          onPress={() => onSubmit(milestone)}
          className="mt-4"
        />
      ) : null}
    </Card>
  );
}

export function ProjectDetailScreen({ navigation, route }: RootScreenProps<'ProjectDetail'>) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const query = useProject(projectId);

  const approve = useApproveMilestone(projectId);
  const reject = useRejectMilestone(projectId);
  const remove = useRemoveMilestone(projectId);
  const submit = useSubmitMilestone(projectId);
  const removeVendor = useRemoveVendor(projectId);
  const cancelProject = useCancelProject(projectId);

  const [copied, setCopied] = useState(false);
  const [sheet, setSheet] = useState<{ kind: SheetKind; milestone: Milestone } | null>(null);
  const [sheetText, setSheetText] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  // Only the milestone being approved/removed should show a spinner, not all cards.
  const [busyMilestoneId, setBusyMilestoneId] = useState<number | null>(null);

  const data = query.data;
  const project = data?.project;
  const wallet = data?.wallet;
  const milestones = data?.milestones ?? [];
  const role = data?.my_role ?? project?.my_role ?? null;
  const isOwner = role === 'owner';
  const isVendor = role === 'vendor';
  const vendorContact = data?.vendor;
  const status = project ? projectStatusVisual(project.status) : null;

  // The owner can cancel an active project only while nothing is in-flight
  // (submitted/approved) or already released from escrow.
  const hasBlockingMilestones = milestones.some(
    (m) => m.status === 'submitted' || m.status === 'approved' || m.status === 'released',
  );
  const canCancel = isOwner && project?.status === 'active' && !hasBlockingMilestones;

  const copyAccount = async () => {
    if (!wallet?.virtual_account) return;
    selection();
    await Clipboard.setStringAsync(wallet.virtual_account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const confirmApprove = (m: Milestone) => {
    Alert.alert(
      'Approve milestone',
      `This releases ${formatMoney(m.amount)} from escrow to the vendor. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & pay',
          onPress: () => {
            setBusyMilestoneId(m.id);
            approve.mutate(m.id, {
              onError: (e) => Alert.alert('Could not approve', e.message),
              onSettled: () => setBusyMilestoneId(null),
            });
          },
        },
      ],
    );
  };

  const confirmRemove = (m: Milestone) => {
    Alert.alert(
      'Remove milestone',
      `Remove “${m.title}”? The reserved ${formatMoney(m.amount)} returns to your available escrow.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setBusyMilestoneId(m.id);
            remove.mutate(m.id, {
              onError: (e) => Alert.alert('Could not remove', e.message),
              onSettled: () => setBusyMilestoneId(null),
            });
          },
        },
      ],
    );
  };

  const confirmRemoveVendor = () => {
    Alert.alert('Remove vendor', 'Unassign the vendor from this project?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeVendor.mutate(undefined, {
            onError: (e) => Alert.alert('Could not remove vendor', e.message),
          }),
      },
    ]);
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancel project',
      'Cancel this project? Any funds in escrow stay in the project wallet for you to withdraw. This can’t be undone.',
      [
        { text: 'Keep project', style: 'cancel' },
        {
          text: 'Cancel project',
          style: 'destructive',
          onPress: () =>
            cancelProject.mutate(undefined, {
              onSuccess: () => navigation.goBack(),
              onError: (e) => Alert.alert('Could not cancel', e.message),
            }),
        },
      ],
    );
  };

  const openSheet = (kind: SheetKind, milestone: Milestone) => {
    selection();
    setSheetText('');
    setSheetError(null);
    setSheet({ kind, milestone });
  };

  const sheetBusy = submit.isPending || reject.isPending;

  const confirmSheet = () => {
    if (!sheet) return;
    setSheetError(null);
    if (sheet.kind === 'submit') {
      if (!sheetText.trim()) {
        setSheetError('Describe the work you’ve completed.');
        return;
      }
      submit.mutate(
        { milestoneId: sheet.milestone.id, proof: sheetText.trim() },
        {
          onSuccess: () => setSheet(null),
          onError: (e) => setSheetError(e.message),
        },
      );
    } else {
      reject.mutate(
        { milestoneId: sheet.milestone.id, note: sheetText.trim() || undefined },
        {
          onSuccess: () => setSheet(null),
          onError: (e) => setSheetError(e.message),
        },
      );
    }
  };

  const isSubmit = sheet?.kind === 'submit';

  return (
    <Screen withBottomInset>
      <Header title={project?.title ?? 'Project'} />

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : query.error ? (
        <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : project && status ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
          }
        >
          {/* Escrow hero */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">Escrow balance</Text>
              <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
                <Ionicons name={status.icon} size={12} color={statusIconColor(status)} style={{ marginRight: 4 }} />
                <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
              </View>
            </View>
            <Text className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight text-white">
              {formatMoney(project.wallet_balance)}
            </Text>

            <View className="mt-5 flex-row" style={{ gap: 10 }}>
              <Stat label="Available" value={formatMoney(project.available)} />
              <Stat label="Reserved" value={formatMoney(project.reserved)} />
              <Stat label="Released" value={formatMoney(project.released)} />
            </View>

            {wallet?.virtual_account ? (
              <Pressable
                onPress={() => void copyAccount()}
                className="mt-5 flex-row items-center self-start rounded-2xl bg-white/10 px-3.5 py-2 active:opacity-80"
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

          {project.description ? (
            <Text className="mt-4 text-[14px] leading-5 text-muted">{project.description}</Text>
          ) : null}

          {/* Fund escrow (owner) */}
          {isOwner ? (
            <Button
              title="Fund escrow"
              icon="add"
              iconPosition="left"
              onPress={() => navigation.navigate('Fund', { walletId: project.wallet_id })}
              className="mt-5"
            />
          ) : null}

          {/* Vendor */}
          <Text className="mt-8 text-lg font-bold text-ink">Vendor</Text>
          {vendorContact ? (
            <Card className="mt-3 flex-row items-center py-4">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-lav-soft">
                <Ionicons name="construct-outline" size={19} color={colors.navy} />
              </View>
              <View className="flex-1 pr-2">
                <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                  {vendorContact.name}
                </Text>
                <Text className="text-xs text-faded" numberOfLines={1}>
                  {vendorContact.email}
                </Text>
              </View>
              {isOwner ? (
                <Pressable
                  onPress={confirmRemoveVendor}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-danger-soft active:opacity-70"
                >
                  <Ionicons name="person-remove-outline" size={17} color={colors.danger} />
                </Pressable>
              ) : null}
            </Card>
          ) : isOwner ? (
            <Pressable
              onPress={() => {
                selection();
                navigation.navigate('AssignVendor', { projectId });
              }}
              className="mt-3 flex-row items-center rounded-3xl border border-dashed border-border bg-white p-4 active:opacity-80"
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-lav">
                <Ionicons name="person-add-outline" size={19} color={colors.navy} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-ink">Assign vendor</Text>
                <Text className="mt-0.5 text-[13px] text-muted">Add the person you’ll pay from escrow</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faded} />
            </Pressable>
          ) : (
            <Card className="mt-3">
              <Text className="text-sm text-muted">No vendor has been assigned yet.</Text>
            </Card>
          )}

          {/* Milestones */}
          <View className="mt-8 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">
              Milestones{milestones.length > 0 ? ` · ${milestones.length}` : ''}
            </Text>
            {isOwner && project.status === 'active' ? (
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('AddMilestone', { projectId });
                }}
                hitSlop={6}
                className="flex-row items-center rounded-full bg-lav px-3.5 py-1.5 active:opacity-80"
              >
                <Ionicons name="add" size={16} color={colors.navy} style={{ marginRight: 4 }} />
                <Text className="text-[12px] font-bold text-navy">Add</Text>
              </Pressable>
            ) : null}
          </View>

          <View className="mt-3" style={{ gap: 12 }}>
            {milestones.length === 0 ? (
              <EmptyState
                title="No milestones yet"
                message={
                  isOwner
                    ? 'Add a milestone to reserve escrow and set up a payment for the vendor.'
                    : 'The owner hasn’t added any milestones yet.'
                }
                icon="flag-outline"
              />
            ) : (
              milestones.map((m) => (
                <MilestoneCard
                  key={m.id}
                  milestone={m}
                  isOwner={isOwner}
                  isVendor={isVendor}
                  onApprove={confirmApprove}
                  onReject={(ms) => openSheet('reject', ms)}
                  onRemove={confirmRemove}
                  onSubmit={(ms) => openSheet('submit', ms)}
                  busy={busyMilestoneId === m.id}
                />
              ))
            )}
          </View>

          {/* Cancel project (owner, active, nothing in-flight/released) */}
          {canCancel ? (
            <Button
              title="Cancel project"
              variant="danger"
              icon="close-circle-outline"
              iconPosition="left"
              onPress={confirmCancel}
              loading={cancelProject.isPending}
              className="mt-8"
            />
          ) : null}
        </ScrollView>
      ) : null}

      {/* Submit-proof / reject-note sheet */}
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
          <View className="flex-1 justify-end bg-black/50">
            <View className="rounded-t-[32px] bg-white px-6 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
              <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-lav" />
              <View className="mb-4 flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-xl font-extrabold text-ink">
                    {isSubmit ? 'Submit your work' : 'Reject submission'}
                  </Text>
                  <Text className="mt-1 text-sm text-muted" numberOfLines={2}>
                    {sheet?.milestone.title} · {sheet ? formatMoney(sheet.milestone.amount) : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSheet(null)}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>

              <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {isSubmit ? 'Proof of work' : 'Reason (optional)'}
              </Text>
              <View className="rounded-2xl border border-border bg-lav-faint px-4 py-3">
                <TextInput
                  value={sheetText}
                  onChangeText={setSheetText}
                  placeholder={
                    isSubmit
                      ? 'Describe what you delivered, add links or references…'
                      : 'Let the vendor know what needs fixing…'
                  }
                  placeholderTextColor={colors.faded}
                  multiline
                  className="min-h-[96px] text-[15px] text-ink"
                  style={{ textAlignVertical: 'top' }}
                  maxLength={500}
                />
              </View>

              <ErrorText message={sheetError} className="mt-3" />

              <Button
                title={isSubmit ? 'Submit work' : 'Reject & return to vendor'}
                icon={isSubmit ? 'cloud-upload-outline' : 'close'}
                iconPosition="left"
                onPress={confirmSheet}
                loading={sheetBusy}
                className="mt-4"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
    </Screen>
  );
}
