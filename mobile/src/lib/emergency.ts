import type { EmergencyDetail, EmergencyRulesPayload } from '../api/types';
import type { RecipientDraft } from '../components/RecipientSheet';
import type { EmergencyRulesDraft } from '../navigation/types';

export const MAX_BENEFICIARIES = 3;

const ORDINALS = ['1st', '2nd', '3rd'];

/**
 * Client sheet: "first beneficiary, second fallback beneficiary, up to third".
 * The order decides the role — the 1st is the beneficiary, the rest are fallbacks.
 */
export function beneficiaryRank(index: number): { title: string; role: string; isFallback: boolean } {
  const isFallback = index > 0;
  return {
    title: `${ORDINALS[index] ?? `${index + 1}th`} Beneficiary`,
    role: isFallback ? 'Fallback' : 'Primary',
    isFallback,
  };
}

/** Re-derive each beneficiary's role from its position after adding, removing or reordering. */
export function rankBeneficiaries(list: RecipientDraft[]): RecipientDraft[] {
  return list.map((r, i) => ({ ...r, role: i === 0 ? 'beneficiary' : 'fallback' }));
}

/** The rules form: the draftable answers plus the custom PIN (never saved in a draft). */
export interface EmergencyRulesValue extends EmergencyRulesDraft {
  pin: string;
  pinConfirm: string;
}

export function emptyEmergencyRules(saved?: EmergencyRulesDraft): EmergencyRulesValue {
  return {
    dual: saved?.dual ?? false,
    approver: saved?.approver ?? null,
    docUnlock: saved?.docUnlock ?? false,
    manual: saved?.manual ?? true,
    reason: saved?.reason ?? '',
    crisis: saved?.crisis ?? false,
    highBalance: saved?.highBalance ?? false,
    recipients: rankBeneficiaries(saved?.recipients ?? []),
    note: saved?.note ?? '',
    pin: '',
    pinConfirm: '',
  };
}

/** The answers worth keeping in a draft (no PIN). */
export function rulesDraft(v: EmergencyRulesValue): EmergencyRulesDraft {
  const { pin: _pin, pinConfirm: _confirm, ...draft } = v;
  return draft;
}

/**
 * Client-side checks, mirroring the server. `pinRequired`: creating, or turning
 * manual unlock on when no custom PIN exists yet. Otherwise a blank PIN keeps it.
 */
export function validateEmergencyRules(v: EmergencyRulesValue, { pinRequired }: { pinRequired: boolean }): string | null {
  if (!v.dual && !v.docUnlock && !v.manual) return 'Choose at least one way this wallet can be unlocked.';
  if (v.dual && !v.approver) return 'Choose the additional approver for dual approval.';
  if (v.manual) {
    if (!v.reason.trim()) return 'Add the reason this wallet may be unlocked manually.';
    if (pinRequired || v.pin) {
      if (!/^\d{4}$/.test(v.pin)) return 'Create a 4-digit custom PIN.';
      if (v.pin !== v.pinConfirm) return "The custom PINs don't match.";
    }
  }
  if (v.docUnlock && v.recipients.length === 0 && !(v.dual && v.approver)) {
    return 'Add a beneficiary or an approver who can submit the death certificate or legal notice.';
  }
  return null;
}

export function emergencyRulesPayload(v: EmergencyRulesValue): Omit<EmergencyRulesPayload, 'purpose'> {
  return {
    dual_approval: v.dual,
    approver_user_id: v.dual ? v.approver?.id : undefined,
    unlock_on_document: v.docUnlock,
    manual_unlock: v.manual,
    unlock_reason: v.manual ? v.reason.trim() : undefined,
    emergency_pin: v.manual && v.pin ? v.pin : undefined,
    override_national_crisis: v.crisis,
    override_high_balance: v.highBalance,
    beneficiary_note: v.note.trim() || undefined,
    beneficiaries: rankBeneficiaries(v.recipients).map((r) => ({
      user_id: r.user.id,
      relationship: r.relationship || undefined,
      role: r.role,
      withdrawal_limit: r.withdrawalLimit || undefined,
      access_type: r.accessType,
    })),
  };
}

/** The saved rules, as the edit form expects them. */
export function rulesFromDetail(e: EmergencyDetail): EmergencyRulesValue {
  const person = (p: { id: number; name: string; username: string | null; avatar_url: string | null }) => ({
    id: p.id,
    full_name: p.name,
    username: p.username,
    avatar_url: p.avatar_url,
  });
  return {
    dual: e.rules.dual_approval,
    approver: e.rules.approver ? person(e.rules.approver) : null,
    docUnlock: e.rules.unlock_on_document,
    manual: e.rules.manual_unlock,
    reason: e.rules.unlock_reason ?? '',
    crisis: e.rules.override_national_crisis,
    highBalance: e.rules.override_high_balance,
    recipients: e.beneficiaries
      .filter((b) => b.user)
      .map((b) => ({
        user: person(b.user!),
        relationship: b.relationship ?? '',
        role: b.role,
        withdrawalLimit: b.withdrawal_limit ? String(parseFloat(b.withdrawal_limit)) : '',
        accessType: b.access_type,
      })),
    note: e.beneficiary_note ?? '',
    pin: '',
    pinConfirm: '',
  };
}
