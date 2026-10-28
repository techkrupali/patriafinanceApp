import type { EmergencyDetail, EmergencyPurpose, EmergencyRulesPayload } from '../api/types';
import type { RecipientDraft } from '../components/RecipientSheet';

export const MAX_BENEFICIARIES = 3;
export const MAX_TRUSTED_CONTACTS = 5;

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

/** EMG-01 "What is this fund for?" */
export const EMERGENCY_FOR: { value: EmergencyPurpose; label: string }[] = [
  { value: 'medical', label: 'Hospital and medical bills' },
  { value: 'funeral', label: 'Burial and funeral support' },
  { value: 'travel', label: 'Stranded while travelling' },
  { value: 'legal', label: 'Legal help' },
];

/** "Medical and funeral" for the review. */
export function purposesLabel(purposes: EmergencyPurpose[]): string {
  const short: Record<string, string> = { medical: 'Medical', funeral: 'funeral', travel: 'travel', legal: 'legal help', other: 'other' };
  const words = purposes.map((p, i) => (i === 0 ? short[p].charAt(0).toUpperCase() + short[p].slice(1) : short[p]));
  return words.length <= 1 ? words[0] ?? '' : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** EMG-04 "Up to" and "How often", EMG-03 "Requests expire after". */
export const FAST_LIMITS = [50_000, 100_000, 150_000, 250_000];
export const FAST_EVERY_DAYS = [7, 14, 30, 60];
export const EXPIRY_HOURS = [6, 24, 48, 72];

/** EMG-05: someone without the app, reached by SMS. Phone in E.164. */
export interface TrustedContactDraft {
  name: string;
  phone: string;
  relation: string;
}

/**
 * Who opens the fund and how (EMG-03…05), with the client's own rules: dual
 * approval is two keyholders agreeing; the custom PIN; death emergency unlock;
 * up to three beneficiaries in order. The custom PIN lives apart — never drafted.
 */
export interface EmergencyRulesState {
  /** Keyholders besides you (Patriai users). */
  keyholders: number[];
  /** Yeses a release needs, you included. */
  required: number;
  expiryHours: number;
  /** "Pay the hospital directly": released money goes to a bank account, not a person. */
  payDirectly: boolean;
  fastOn: boolean;
  fastLimit: number;
  fastEvery: number;
  manual: boolean;
  reason: string;
  highBalance: boolean;
  beneficiaries: RecipientDraft[];
  docUnlock: boolean;
  crisis: boolean;
  note: string;
  trustedContacts: TrustedContactDraft[];
  trustedCanRequest: boolean;
  trustedCanUpload: boolean;
  trustedCanSeeBalance: boolean;
}

export interface EmergencyPins {
  pin: string;
  pinConfirm: string;
}

export const EMPTY_RULES: EmergencyRulesState = {
  keyholders: [],
  required: 2,
  expiryHours: 6,
  payDirectly: false,
  fastOn: true,
  fastLimit: 150_000,
  fastEvery: 30,
  manual: false,
  reason: '',
  highBalance: false,
  beneficiaries: [],
  docUnlock: false,
  crisis: false,
  note: '',
  trustedContacts: [],
  trustedCanRequest: true,
  trustedCanUpload: true,
  trustedCanSeeBalance: false,
};

/**
 * "2 of 3", kept within what the keyholders can give. `invited` counts keyholders
 * invited by phone, who hold a key once they join.
 */
export function requiredYeses(state: EmergencyRulesState, invited = 0): number {
  return Math.max(1, Math.min(state.keyholders.length + invited + 1, state.required));
}

/** "Open it yourself": a reason and the custom PIN (required when there isn't one yet). */
export function validateManual(state: EmergencyRulesState, pins: EmergencyPins, { pinRequired }: { pinRequired: boolean }): string | null {
  if (!state.manual) return null;
  if (!state.reason.trim()) return 'Say when you would open it yourself, like "Hospital bills".';
  if (pinRequired || pins.pin) {
    if (!/^\d{4}$/.test(pins.pin)) return 'Create a 4-digit custom PIN.';
    if (pins.pin !== pins.pinConfirm) return "The custom PINs don't match.";
  }
  return null;
}

/** Client-side checks, mirroring the server. */
export function validateRules(
  state: EmergencyRulesState,
  pins: EmergencyPins,
  { pinRequired, invited = 0 }: { pinRequired: boolean; invited?: number },
): string | null {
  if (!state.keyholders.length && !state.docUnlock && !state.manual) {
    return invited > 0
      ? 'Keyholders invited by phone hold a key once they join. Until then, turn on your custom PIN or the death emergency unlock.'
      : 'Choose a way the fund can open: another keyholder, your custom PIN or a death certificate.';
  }
  const manual = validateManual(state, pins, { pinRequired });
  if (manual) return manual;
  if (state.docUnlock && state.beneficiaries.length === 0 && state.keyholders.length === 0) {
    return 'Add a beneficiary or a keyholder who can submit the death certificate.';
  }
  return null;
}

export function rulesPayload(
  state: EmergencyRulesState,
  pins: EmergencyPins,
  purposes: EmergencyPurpose[],
  invited = 0,
): Omit<EmergencyRulesPayload, 'purpose'> & { purpose: EmergencyPurpose } {
  return {
    purpose: purposes[0] ?? 'other',
    purposes,
    dual_approval: state.keyholders.length > 0,
    keyholders: state.keyholders,
    required_keyholders: requiredYeses(state, invited),
    request_expiry_hours: state.expiryHours,
    pay_directly: state.payDirectly,
    fast_release_limit: state.fastOn ? String(state.fastLimit) : null,
    fast_release_every_days: state.fastEvery,
    unlock_on_document: state.docUnlock,
    manual_unlock: state.manual,
    unlock_reason: state.manual ? state.reason.trim() : undefined,
    emergency_pin: state.manual && pins.pin ? pins.pin : undefined,
    override_national_crisis: state.crisis,
    override_high_balance: state.highBalance,
    beneficiary_note: state.note.trim() || undefined,
    beneficiaries: rankBeneficiaries(state.beneficiaries).map((r) => ({
      user_id: r.user.id,
      relationship: r.relationship || undefined,
      role: r.role,
      withdrawal_limit: r.withdrawalLimit || undefined,
      access_type: r.accessType,
    })),
    trusted_contacts: state.trustedContacts.map((c) => ({ name: c.name.trim(), phone: c.phone, relation: c.relation.trim() || undefined })),
    trusted_can_request: state.trustedCanRequest,
    trusted_can_upload: state.trustedCanUpload,
    trusted_can_see_balance: state.trustedCanSeeBalance,
  };
}

/** The saved rules, as the edit screen holds them. */
export function rulesFromDetail(e: EmergencyDetail): EmergencyRulesState {
  const person = (p: { id: number; name: string; username: string | null; avatar_url: string | null }) => ({
    id: p.id,
    full_name: p.name,
    username: p.username,
    avatar_url: p.avatar_url,
  });
  const keyholders = (e.rules.keyholders ?? (e.rules.approver ? [e.rules.approver] : [])).map((k) => k.id);
  return {
    keyholders,
    required: e.rules.required_keyholders || Math.min(2, keyholders.length + 1),
    expiryHours: e.rules.request_expiry_hours ?? 48,
    payDirectly: Boolean(e.rules.pay_directly),
    fastOn: Boolean(e.rules.fast_release),
    fastLimit: e.rules.fast_release ? parseFloat(e.rules.fast_release.limit) : 150_000,
    fastEvery: e.rules.fast_release?.every_days ?? 30,
    manual: e.rules.manual_unlock,
    reason: e.rules.unlock_reason ?? '',
    highBalance: e.rules.override_high_balance,
    beneficiaries: e.beneficiaries
      .filter((b) => b.user)
      .map((b) => ({
        user: person(b.user!),
        relationship: b.relationship ?? '',
        role: b.role,
        withdrawalLimit: b.withdrawal_limit ? String(parseFloat(b.withdrawal_limit)) : '',
        accessType: b.access_type,
      })),
    docUnlock: e.rules.unlock_on_document,
    crisis: e.rules.override_national_crisis,
    note: e.beneficiary_note ?? '',
    // The owner sees the full numbers; that's who edits.
    trustedContacts: (e.trusted_contacts ?? []).map((c) => ({ name: c.name, phone: c.phone, relation: c.relation ?? '' })),
    trustedCanRequest: e.rules.trusted_can_request ?? true,
    trustedCanUpload: e.rules.trusted_can_upload ?? true,
    trustedCanSeeBalance: e.rules.trusted_can_see_balance ?? false,
  };
}

/** "Can start a request · upload proof" — what trusted contacts may do, for summaries. */
export function trustedPowers(state: Pick<EmergencyRulesState, 'trustedCanRequest' | 'trustedCanUpload' | 'trustedCanSeeBalance'>): string {
  const powers = [
    state.trustedCanRequest ? 'start a request' : null,
    state.trustedCanUpload ? 'upload proof' : null,
    state.trustedCanSeeBalance ? 'see the balance' : null,
  ].filter(Boolean);
  return powers.length ? `Can ${powers.join(' · ')}` : 'Can only see whether it has been released';
}
