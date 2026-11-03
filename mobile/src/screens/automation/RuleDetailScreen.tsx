import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtGroupLabel, PtNote, PtPanel } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useDeleteAutomation, useRunAutomation, useUpdateAutomation } from '../../api/hooks';
import { useAgreeRule, useRuleDetail, type RuleRun } from '../../api/rules';
import { RuleWordCard } from './RuleBuilderScreen';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** "14 Oct, 3:02 pm" */
function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

function RunChip({ run }: { run: RuleRun }) {
  const tone = run.status === 'ran' ? { bg: pt.brandSoft, fg: pt.brand, icon: 'check' as const } : run.status === 'failed' ? { bg: '#FBE3DE', fg: pt.danger, icon: 'x' as const } : { bg: pt.sunken, fg: pt.inkMuted, icon: 'circle' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Feather name={tone.icon} size={run.status === 'skipped' ? 8 : 13} color={tone.fg} />
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: tone.fg }}>{run.label}</Text>
    </View>
  );
}

/**
 * AUT-08 "Keep Household topped up · On · made by Ngozi": WHEN / IF / THEN and
 * every run (Ran, Skipped, Failed). The pencil opens AUT-09: edit, pause, run
 * it now, delete (the run log is kept). Emeka, asked to agree, sees Agree.
 */
export function RuleDetailScreen({ navigation, route }: RootScreenProps<'RuleDetail'>) {
  const { ruleId } = route.params;
  const q = useRuleDetail(ruleId);
  const agree = useAgreeRule(ruleId);
  const update = useUpdateAutomation(ruleId);
  const run = useRunAutomation();
  const remove = useDeleteAutomation();
  const [menu, setMenu] = useState(false);
  const d = q.data;

  if (!d) {
    return (
      <PtPageScreen title="Rule" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const r = d.automation;
  const words = r.words ?? { when: '', if: null, then: '' };
  const waiting = r.waiting_for ?? [];
  const state = !r.enabled ? 'Paused' : waiting.length ? `Waiting for ${waiting.join(' and ')}` : 'On';
  const limit = r.trigger === 'balance' || r.trigger === 'event' ? `Ignores the once-a-${r.frequency === 'daily' ? 'day' : r.frequency === 'monthly' ? 'month' : 'week'} limit` : 'Runs it once, now';

  return (
    <PtPageScreen
      title={r.name}
      subtitle={`${state} · made by ${d.mine ? 'you' : d.made_by ?? '—'}`}
      onBack={() => navigation.goBack()}
      right={
        d.mine ? (
          <Pressable onPress={() => { selection(); setMenu(true); }} accessibilityRole="button" accessibilityLabel="Rule options" hitSlop={8} style={{ padding: 6 }}>
            <Feather name="edit-2" size={22} color={pt.ink} />
          </Pressable>
        ) : undefined
      }
      footer={
        d.can_agree ? (
          <>
            <PtButton
              title="Agree"
              loading={agree.isPending}
              onPress={() => agree.mutate(true, { onSuccess: () => { notifySuccess(); showAlert('Agreed', `${d.made_by}'s rule runs from now.`); }, onError: (e) => showAlert('Not saved', e.message) })}
            />
            <PtButton title="Say no" variant="ghost" onPress={() => agree.mutate(false, { onSuccess: () => { showAlert('Said no', `We've told ${d.made_by}. The rule is paused.`); navigation.goBack(); } })} />
          </>
        ) : undefined
      }
    >
      <RuleWordCard tag="WHEN" text={words.when} />
      {words.if ? <RuleWordCard tag="IF" text={words.if} /> : null}
      <RuleWordCard tag="THEN" text={words.then} />
      {d.can_agree ? <PtNote tone="info">{`${d.made_by} wants this rule. It moves money into a wallet you share, so it waits for your yes.`}</PtNote> : null}

      <PtGroupLabel>Runs</PtGroupLabel>
      {d.runs.length ? (
        <PtPanel>
          {d.runs.map((run, i) => (
            <View key={run.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 12, borderBottomWidth: i === d.runs.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <RunChip run={run} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{run.status === 'ran' ? when(run.at) : when(run.at).split(',')[0]}</Text>
                {run.note ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{run.note}</Text> : null}
              </View>
            </View>
          ))}
        </PtPanel>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>It hasn't run yet. Every run shows here, even after you delete the rule.</Text>
      )}

      {/* AUT-09 */}
      <PtSheet visible={menu} title={r.name} subtitle={`Made by ${d.made_by ?? 'you'} · ran ${r.runs_count ?? 0} time${r.runs_count === 1 ? '' : 's'}`} onClose={() => setMenu(false)}>
        <PtCard>
          <PtRow
            left={<PtIconTile><Feather name="edit-2" size={18} color={pt.brand} /></PtIconTile>}
            title="Edit rule"
            subtitle={waiting.length || (r.notify_user_ids ?? []).length ? 'Changes need a yes from the people sharing it' : 'Change when, if or then'}
            chevron
            onPress={() => { setMenu(false); navigation.navigate('RuleBuilder', { ruleId }); }}
          />
          <PtRow
            left={<PtIconTile><Feather name={r.enabled ? 'pause' : 'play'} size={18} color={pt.brand} /></PtIconTile>}
            title={r.enabled ? 'Pause' : 'Turn back on'}
            subtitle={r.enabled ? 'Until you turn it back on' : 'It starts running again'}
            chevron
            onPress={() => update.mutate({ enabled: !r.enabled }, { onSuccess: () => { setMenu(false); void q.refetch(); }, onError: (e) => showAlert('Not changed', e.message) })}
          />
          <PtRow
            left={<PtIconTile><Feather name="zap" size={18} color={pt.brand} /></PtIconTile>}
            title="Run it now"
            subtitle={limit}
            chevron
            onPress={() =>
              run.mutate(ruleId, {
                onSuccess: (res) => { notifySuccess(); setMenu(false); void q.refetch(); showAlert('Rule ran', res.result.reason ?? (res.result.amount ? `Moved ₦${Number(res.result.amount).toLocaleString('en-NG')}.` : 'Done.')); },
                onError: (e) => showAlert('Did not run', e.message),
              })
            }
          />
          <PtRow
            left={<View style={{ width: 40, height: 40, borderRadius: ptRadius.sm, backgroundColor: '#FBE3DE', alignItems: 'center', justifyContent: 'center' }}><Feather name="trash-2" size={18} color={pt.danger} /></View>}
            title="Delete rule"
            subtitle="The run log is kept"
            chevron
            last
            onPress={() =>
              showAlert(`Delete ${r.name}?`, 'It stops running. Its runs stay in the log.', [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(ruleId, { onSuccess: () => { setMenu(false); navigation.goBack(); } }) },
              ])
            }
          />
        </PtCard>
      </PtSheet>
    </PtPageScreen>
  );
}
