import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import type { AutomationRule, RuleWords } from './types';

/** AUT-03…05 a rule being built. Money in naira. */
export interface RuleDraft {
  name?: string;
  trigger: 'balance' | 'event' | 'schedule' | 'salary' | 'roundup';
  event?: 'goal_reached' | 'request_made';
  watch_wallet_id?: number | null;
  threshold?: number | null;
  frequency?: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number;
  day_of_month?: number;
  percent?: number;
  from_wallet_id?: number | null;
  to_wallet_id?: number | null;
  amount?: number | null;
  fill_to?: boolean;
  action?: 'move' | 'sweep' | 'notify';
  min_balance?: number | null;
  before_day?: number | null;
  max_per?: 'day' | 'week' | 'month';
  notify_user_ids?: number[];
  roundup_to?: number;
}

/** AUT-06 review. */
export interface RulePreview {
  name: string;
  words: RuleWords;
  last_month: string | null;
  needs_agreement: string | null;
  agreement_line: string | null;
}

/** AUT-08 one run. */
export interface RuleRun {
  id: number;
  status: 'ran' | 'skipped' | 'failed';
  label: string;
  at: string | null;
  note: string | null;
  amount: string | null;
}

export interface RuleDetail {
  automation: AutomationRule;
  made_by: string | null;
  mine: boolean;
  can_agree: boolean;
  runs: RuleRun[];
}

/** AUT-10 "Rules need your help". */
export interface RulesHelp {
  failed: { rule_id: number; name: string; title: string; body: string; from_wallet_id: number; to_wallet_id: number }[];
  salary_day: { day: number; line: string; rules: { rule_id: number; name: string; line: string }[] } | null;
  count: number;
}

function useRefreshRules() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.automations });
    void qc.invalidateQueries({ queryKey: ['rule-detail'] });
    void qc.invalidateQueries({ queryKey: ['rules-help'] });
    void qc.invalidateQueries({ queryKey: keys.home });
  };
}

export function useRulePreview() {
  return useMutation({ mutationFn: (d: RuleDraft) => api<RulePreview>('/automations/preview', { method: 'POST', body: d }) });
}

export function useBuildRule(ruleId?: number) {
  const refresh = useRefreshRules();
  return useMutation({
    mutationFn: (d: RuleDraft) =>
      api<{ automation: AutomationRule }>(ruleId ? `/automations/${ruleId}/builder` : '/automations/builder', { method: ruleId ? 'PUT' : 'POST', body: d }),
    onSuccess: refresh,
  });
}

export function useParseRule() {
  return useMutation({
    mutationFn: (text: string) =>
      api<{ draft: RuleDraft | null; understood: string[]; missing: string[]; preview: RulePreview | null }>('/automations/parse', { method: 'POST', body: { text } }),
  });
}

export function useRuleDetail(id: number) {
  return useQuery({ queryKey: ['rule-detail', id], queryFn: () => api<RuleDetail>(`/automations/${id}/detail`), enabled: id > 0 });
}

export function useAgreeRule(id: number) {
  const refresh = useRefreshRules();
  return useMutation({ mutationFn: (yes: boolean) => api(`/automations/${id}/agree`, { method: 'POST', body: { yes } }), onSuccess: refresh });
}

export function useRulesHelp() {
  return useQuery({ queryKey: ['rules-help'], queryFn: () => api<RulesHelp>('/automations/help') });
}

export function useSaveRuleOrder() {
  const refresh = useRefreshRules();
  return useMutation({ mutationFn: (ids: number[]) => api<RulesHelp>('/automations/order', { method: 'PUT', body: { ids } }), onSuccess: refresh });
}
