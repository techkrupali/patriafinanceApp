import { create } from 'zustand';

/** Who a payment goes to (SND-03/04): a Patriai user, a bank account, or one of your wallets. */
export type SendRecipient =
  | { kind: 'user'; name: string; identifier: string; sub?: string; savedId?: number; avatarUrl?: string | null }
  | { kind: 'bank'; name: string; bankCode: string; bankName: string; accountNumber: string; sub?: string; savedId?: number; verified?: boolean; saved: boolean }
  | { kind: 'wallet'; name: string; walletId: number; sub?: string }
  /** BEN-04 a group: fixed splits set the amount themselves. */
  | { kind: 'group'; name: string; groupId: number; sub?: string; banks: number; fixedTotal?: number }
  /** REQ-03 paying someone's request, into the wallet they chose. */
  | { kind: 'request'; name: string; code: string; sub?: string };

/**
 * The payment being put together across SND-01 → 03/04 → 06 (02, 07) → 08 → 09:
 * kept here so each screen reads and adds to the same draft.
 */
interface SendDraftState {
  recipient: SendRecipient | null;
  fromWalletId: number | null;
  /** Naira, as typed ("250000"). */
  amount: string;
  /** "What's it for?" — the recipient sees it. */
  note: string;
  categoryId: number | null;
  setRecipient: (r: SendRecipient | null) => void;
  setFrom: (id: number | null) => void;
  setAmount: (a: string) => void;
  setNote: (n: string) => void;
  setCategory: (id: number | null) => void;
  /** A fresh payment, optionally from a given wallet (WAL-02 "Pay from wallet"). */
  start: (fromWalletId?: number | null) => void;
}

export const useSendDraft = create<SendDraftState>((set) => ({
  recipient: null,
  fromWalletId: null,
  amount: '',
  note: '',
  categoryId: null,
  setRecipient: (recipient) => set({ recipient }),
  setFrom: (fromWalletId) => set({ fromWalletId }),
  setAmount: (amount) => set({ amount }),
  setNote: (note) => set({ note }),
  setCategory: (categoryId) => set({ categoryId }),
  start: (fromWalletId = null) => set({ recipient: null, fromWalletId, amount: '', note: '', categoryId: null }),
}));

/** "MO" for "Mama Okafor". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
