import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { LoadError } from '../../components/LoadError';
import { AttentionCard } from '../../components/project/ProjectUi';
import { useAutomations, useCancelApproval, useUpdateWallet, useWallet } from '../../api/hooks';
import { PtCard, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { AddLink } from '../../components/wallet/WalletManageUi';
import { Feather } from '@expo/vector-icons';
import { ordinal } from '../../lib/goalPlan';
import { useAuth } from '../../store/auth';
import { formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { ApprovalMode, UpdateWalletPayload } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const LIMITS = [20000, 50000, 100000];
const EXPIRY = [24, 48, 72];
const join = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/**
 * WAL-08 Approval rules: when a payment needs a yes (any amount, over ₦20,000,
 * ₦50,000 or ₦100,000), who decides (any one approver, everyone, most, or
 * named people), how long requests wait, and that the other owners agree to
 * the change ("Ask Emeka to approve the change").
 */
export function ApprovalRulesScreen({ navigation, route }: RootScreenProps<'ApprovalRules'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const detail = useWallet(walletId);
  const update = useUpdateWallet(walletId);
  const d = detail.data;
  const wallet = d?.wallet;
  const gov = d?.governance;
  const pending = gov?.pending_change ?? null;
  const cancel = useCancelApproval(pending?.id ?? 0);
  const canChange = Boolean(gov?.can_change) && wallet?.status !== 'closed' && wallet?.type !== 'joint' && wallet?.type !== 'main';
  const automations = useAutomations();
  // The rules that move money into or out of this wallet ("Save from every salary").
  const moneyRules = (automations.data ?? []).filter((r) => r.from_wallet.id === walletId || r.to_wallet.id === walletId);
  const held = parseFloat(d?.held_amount ?? '0');

  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [mode, setMode] = useState<ApprovalMode>('any');
  const [named, setNamed] = useState<number[]>([]);
  const [expiry, setExpiry] = useState(48);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!d || !wallet || ready) return;
    setEnabled(Boolean(d.approval.enabled));
    setThreshold(d.approval.threshold ? Math.round(parseFloat(d.approval.threshold)) : null);
    setMode(wallet.approval_mode ?? ((d.approval.required_approvals ?? 1) > 1 ? 'all' : 'any'));
    setNamed(wallet.approver_ids ?? []);
    setExpiry(wallet.approval_expiry_hours ?? 48);
    setReady(true);
  }, [d, wallet, ready]);

  const approvers = gov?.approvers ?? [];
  const others = gov?.others ?? [];
  const namedNames = approvers.filter((a) => named.includes(a.user_id)).map((a) => a.name);
  const limitOptions = [
    { value: 0, label: 'Any amount' },
    ...[...new Set([...LIMITS, ...(threshold && !LIMITS.includes(threshold) ? [threshold] : [])])].sort((a, b) => a - b).map((v) => ({ value: v, label: formatNaira(v) })),
  ];

  const save = () => {
    if (mode === 'named' && named.length < 2) {
      showAlert('Name two or more people', 'Pick at least two people who decide together.');
      return;
    }
    const body: UpdateWalletPayload = { approval_enabled: enabled };
    if (enabled) {
      body.approval_threshold = threshold ? String(threshold) : null;
      body.approval_mode = mode;
      if (mode === 'named') body.approver_ids = named;
      body.approval_expiry_hours = expiry;
    }
    update.mutate(body, {
      onSuccess: (res) => {
        notifySuccess();
        if (res.pending_change) {
          showAlert('Sent for approval', `${join(res.pending_change.approver_names ?? others)} will see the change in their approvals. It applies once they say yes.`);
        }
        navigation.goBack();
      },
      onError: (e) => showAlert('Could not save', e.message),
    });
  };

  const cancelPending = () =>
    showAlert('Cancel this change?', pending?.description ?? undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel change', style: 'destructive', onPress: () => cancel.mutate(undefined, { onSuccess: () => void detail.refetch(), onError: (e) => showAlert('Could not cancel', e.message) }) },
    ]);

  return (
    <PtPageScreen
      title="Approval rules"
      subtitle={wallet?.name}
      onBack={() => navigation.goBack()}
      footer={
        canChange && ready && !pending ? (
          <PtButton title={others.length ? `Ask ${join(others)} to approve the change` : 'Save'} onPress={save} loading={update.isPending} />
        ) : undefined
      }
    >
      {detail.isLoading || !d ? (
        detail.error ? <LoadError message={(detail.error as Error).message} onRetry={() => void detail.refetch()} /> : <ActivityIndicator color={pt.brand} />
      ) : wallet?.type === 'joint' || wallet?.type === 'main' ? (
        <PtNote tone="info">
          {wallet?.type === 'main'
            ? 'Your Main wallet pays out without approvals. Rules that move money from it are below.'
            : "Joint rules change together. Suggest a change from the wallet's rules, and your partner approves it."}
        </PtNote>
      ) : (
        <>
          {pending ? (
            <AttentionCard
              tone="gold"
              title={`Waiting for ${join(pending.approver_names ?? others)}`}
              sub={pending.description ?? 'A change to these rules'}
              onPress={pending.initiator?.id === me?.id ? cancelPending : () => navigation.navigate('ApprovalDetail', { approvalId: pending.id })}
              right={
                <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>{pending.initiator?.id === me?.id ? 'Cancel' : 'Review'}</Text>
              }
            />
          ) : null}

          <PtPanel>
            <PtSwitchRow title="Ask before money goes out" subtitle="Payments over the limit wait for a yes" value={enabled} onChange={canChange && !pending ? setEnabled : undefined} disabled={!canChange || Boolean(pending)} />
          </PtPanel>

          {enabled ? (
            <>
              <View style={{ gap: 12 }}>
                <PtGroupLabel>Needs approval when a payment is over</PtGroupLabel>
                <PtPills options={limitOptions} value={threshold ?? 0} onChange={(v) => canChange && !pending && setThreshold(v || null)} />
              </View>

              <View style={{ gap: 10 }}>
                <PtGroupLabel>Who decides</PtGroupLabel>
                {(
                  [
                    { value: 'any', title: 'Any one approver', sub: 'The first yes is enough.' },
                    { value: 'all', title: 'Everyone', sub: 'All approvers must say yes.' },
                    { value: 'majority', title: 'Most approvers', sub: 'More than half.' },
                    { value: 'named', title: 'Named people', sub: namedNames.length ? `${join(namedNames)}, ${namedNames.length === 2 ? 'both' : 'all of them'}.` : 'Pick who decides, all of them.' },
                  ] as const
                ).map((o) => (
                  <PtChoiceCard key={o.value} title={o.title} subtitle={o.sub} selected={mode === o.value} onPress={() => canChange && !pending && setMode(o.value)} />
                ))}
                {mode === 'named' && canChange && !pending ? (
                  <PtPanel>
                    {approvers.map((a, i) => {
                      const on = named.includes(a.user_id);
                      return (
                        <Pressable
                          key={a.user_id}
                          onPress={() => {
                            selection();
                            setNamed((n) => (on ? n.filter((x) => x !== a.user_id) : [...n, a.user_id]));
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === approvers.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
                        >
                          <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }}>
                            {a.user_id === me?.id ? `${a.name} (you)` : a.name}
                          </Text>
                          <PtCheckbox checked={on} />
                        </Pressable>
                      );
                    })}
                    {approvers.length < 2 ? (
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, paddingVertical: 10 }}>Make someone an approver first, from Members.</Text>
                    ) : null}
                  </PtPanel>
                ) : null}
              </View>

            </>
          ) : null}

          <PtPanel>
            {enabled ? <PtReviewRow label="Requests expire after" value={`${expiry} hours`} onEdit={canChange && !pending ? () => setExpiryOpen(true) : undefined} /> : null}
            <PtReviewRow label="Changing these rules" value={others.length ? `Needs ${join(others.map((o) => `${o}'s`))} yes too` : 'Only you'} last />
          </PtPanel>

          {!canChange ? <PtNote tone="info">Only the owner and co-owners change these rules.</PtNote> : null}
        </>
      )}

      {d && (wallet?.reminder_day || held > 0) ? (
        <PtCard>
          {wallet?.reminder_day ? (
            <PtRow left={<Feather name="bell" size={20} color={pt.brand} />} title="Monthly reminder" right={`On the ${ordinal(wallet.reminder_day)}`} last={held <= 0} />
          ) : null}
          {held > 0 ? <PtRow left={<Feather name="lock" size={20} color={pt.brand} />} title="Held for approvals" right={formatNaira(held)} last /> : null}
        </PtCard>
      ) : null}

      {d && (moneyRules.length || (d.my_role === 'owner' && wallet?.status === 'active')) ? (
        <View style={{ gap: 10 }}>
          <PtSectionTitle title="Money rules" />
          {moneyRules.length ? (
            <PtCard>
              {moneyRules.map((r, i) => (
                <PtRow
                  key={r.id}
                  minHeight={64}
                  last={i === moneyRules.length - 1}
                  left={<Feather name="repeat" size={20} color={r.enabled ? pt.brand : pt.inkSubtle} />}
                  title={r.name}
                  subtitle={`${r.from_wallet.name} → ${r.to_wallet.name} · ${r.enabled ? r.next_run_hint : 'Paused'}`}
                  right={
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>
                      {r.trigger === 'salary' ? `${r.percent}%` : r.trigger === 'roundup' ? `↑${formatNaira(r.roundup_to)}` : formatNaira(r.amount)}
                    </Text>
                  }
                />
              ))}
            </PtCard>
          ) : null}
          {d.my_role === 'owner' && wallet?.status === 'active' ? (
            <AddLink label="New rule" onPress={() => navigation.navigate('CreateAutomation', wallet?.type === 'main' ? { fromWalletId: walletId } : { toWalletId: walletId })} />
          ) : null}
        </View>
      ) : null}

      <PtOptionSheet
        visible={expiryOpen}
        title="Requests expire after"
        options={EXPIRY.map((h) => ({ value: h, label: `${h} hours` }))}
        value={expiry}
        onClose={() => setExpiryOpen(false)}
        onPick={(h) => {
          setExpiry(h);
          setExpiryOpen(false);
        }}
      />
    </PtPageScreen>
  );
}
