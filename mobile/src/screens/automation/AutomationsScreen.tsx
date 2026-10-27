import React from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtTabScreen, PtSwitch } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCard, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { LoadError } from '../../components/LoadError';
import { useApprovalRules, useAutomations, useDeleteAutomation, useRunAutomation, useUpdateAutomation } from '../../api/hooks';
import { formatNaira, formatYmd, shortDay } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import type { ApprovalRuleSummary, AutomationRule } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

function whenLine(r: AutomationRule): string {
  if (r.frequency === 'weekly') return `it's ${DAYS[r.day_of_week ?? 0] || 'the set day'}`;
  if (r.frequency === 'monthly') return `it's the ${ordinal(r.day_of_month ?? 1)} of the month`;
  return "it's a new day";
}

function thenLine(r: AutomationRule): string {
  const keep = r.min_balance ? `, keeping ${formatNaira(r.min_balance)} in ${r.from_wallet.name}` : '';
  return `move ${formatNaira(r.amount)} from ${r.from_wallet.name} to ${r.to_wallet.name}${keep}`;
}

function metaLine(r: AutomationRule): string {
  if (!r.enabled) return 'Paused';
  if (r.last_run_at) return `Last ran ${formatYmd(r.last_run_at.slice(0, 10)).replace(/ \d{4}$/, '')} · moved ${formatNaira(r.amount)}`;
  return r.next_run_on ? `Next run ${shortDay(r.next_run_on)}` : r.next_run_hint;
}

/** "Ngozi and Emeka approve anything over ₦100,000" */
function approvalLine(a: ApprovalRuleSummary): string {
  const names = a.approvers;
  const joined = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const scope = a.threshold ? `anything over ${formatNaira(a.threshold)}` : 'every payment';
  if (a.goal_locked) return `${joined || 'You'} all say yes to any payment until the goal is reached`;
  if (names.length > 1 && a.approval_mode === 'any') return `Any one of ${joined} approves ${scope}`;
  if (names.length > 2 && a.approval_mode === 'majority') return `Most of ${joined} approve ${scope}`;
  if (a.approval_mode === 'all') return `${joined || 'You'} approve${names.length === 1 ? 's' : ''} ${scope}`;
  if (names.length > 1 && a.required_approvals < names.length) {
    return `${a.required_approvals} of ${names.length} approvers (${joined}) say yes to ${scope}`;
  }
  return `${joined || 'You'} approve${names.length === 1 ? 's' : ''} ${scope}`;
}

/** One automation: name, on/off switch, When/Then, last or next run. Tap for Run now / Delete. */
function RuleCard({ rule }: { rule: AutomationRule }) {
  const update = useUpdateAutomation(rule.id);
  const run = useRunAutomation();
  const remove = useDeleteAutomation();

  const actions = () => {
    selection();
    Alert.alert(rule.name, undefined, [
      {
        text: 'Run now',
        onPress: () =>
          run.mutate(rule.id, {
            onSuccess: (d) => {
              notifySuccess();
              Alert.alert(
                d.result.status === 'ran' ? 'Rule ran' : 'Skipped',
                d.result.status === 'ran' ? `Moved ${formatNaira(d.result.amount ?? rule.amount)} to ${rule.to_wallet.name}.` : d.result.reason || 'Nothing to do.',
              );
            },
            onError: (e) => Alert.alert('Could not run', e.message),
          }),
      },
      {
        text: 'Delete rule',
        style: 'destructive',
        onPress: () => remove.mutate(rule.id, { onError: (e) => Alert.alert('Could not delete', e.message) }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={actions} accessibilityRole="button" style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 22, color: pt.ink }}>{rule.name}</Text>
        </Pressable>
        <PtSwitch
          label={`${rule.name} on`}
          value={rule.enabled}
          disabled={update.isPending}
          onChange={(v) => update.mutate({ enabled: v }, { onError: (e) => Alert.alert('Could not update', e.message) })}
        />
      </View>
      <Pressable onPress={actions} accessibilityRole="button" style={{ gap: 4 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.ink }}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.brand }}>When</Text> {whenLine(rule)}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.ink }}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.brand }}>Then</Text> {thenLine(rule)}
        </Text>
      </Pressable>
      <Text style={{ fontFamily: ptFont.medium, fontSize: 12, lineHeight: 16, color: pt.inkMuted }}>{metaLine(rule)}</Text>
    </View>
  );
}

/**
 * Rules tab (prototype AUT-01): automations that run on their own, each with
 * an on/off switch, and each wallet's approval rule. Also opened from other
 * screens as "Automations", with a back button.
 */
export function AutomationsScreen({ navigation, route }: RootScreenProps<'Automations'>) {
  const isTab = route?.name !== 'Automations';
  const rules = useAutomations();
  const approvals = useApprovalRules();
  const list = rules.data ?? [];
  const running = list.filter((r) => r.enabled).length;

  return (
    <PtTabScreen
      title="Rules"
      onBack={isTab ? undefined : () => navigation.goBack()}
      action={<PtButton title="New rule" variant="secondary" size="sm" onPress={() => navigation.navigate('CreateAutomation')} />}
      refreshing={rules.isRefetching}
      onRefresh={() => void rules.refetch()}
    >
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted, marginTop: -8 }}>
        Systems, not memory. These run on their own and log everything they do.
      </Text>

      {rules.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 32 }} />
      ) : rules.error ? (
        <LoadError message={(rules.error as Error).message} onRetry={() => void rules.refetch()} />
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <PtSectionTitle title={`Automations · ${running} running`} />
            {list.length === 0 ? (
              <PtCard padded>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
                  No rules yet. Move money on a schedule: an allowance every Monday, savings on payday, a top-up each month.
                </Text>
              </PtCard>
            ) : (
              list.map((r) => <RuleCard key={r.id} rule={r} />)
            )}
          </View>

          <View style={{ gap: 8 }}>
            <PtSectionTitle title="Approval rules" />
            <PtCard>
              {(approvals.data ?? []).length === 0 ? (
                <PtRow
                  title="No approval rules yet"
                  subtitle="Turn on approvals in a shared wallet's settings so payments need a yes."
                  last
                />
              ) : (
                (approvals.data ?? []).map((a, i, all) => (
                  <PtRow
                    key={a.wallet_id}
                    title={a.wallet_name}
                    subtitle={approvalLine(a)}
                    chevron
                    last={i === all.length - 1}
                    onPress={() => navigation.navigate('WalletSettings', { walletId: a.wallet_id })}
                  />
                ))
              )}
            </PtCard>
          </View>
        </>
      )}
    </PtTabScreen>
  );
}
