import { create } from 'zustand';

/** Someone to ask for money: on Patriai (by @tag, phone or email), or not yet (name and phone). */
export type AskPerson =
  | { kind: 'user'; name: string; identifier: string; sub?: string; avatarUrl?: string | null }
  | { kind: 'outside'; name: string; phone: string };

/**
 * REQ-01 and SPL-01 pick people on SND-03 (Who are you asking?): the one for
 * a request, or the people a bill is split with.
 */
interface RequestDraftState {
  payer: AskPerson | null;
  people: AskPerson[];
  setPayer: (p: AskPerson | null) => void;
  addPerson: (p: AskPerson) => void;
  removePerson: (index: number) => void;
  reset: () => void;
}

export const useRequestDraft = create<RequestDraftState>((set) => ({
  payer: null,
  people: [],
  setPayer: (payer) => set({ payer }),
  addPerson: (p) =>
    set((s) => ({
      people: s.people.some((q) => (q.kind === 'user' && p.kind === 'user' ? q.identifier === p.identifier : q.kind === 'outside' && p.kind === 'outside' && q.phone === p.phone)) ? s.people : [...s.people, p],
    })),
  removePerson: (index) => set((s) => ({ people: s.people.filter((_, i) => i !== index) })),
  reset: () => set({ payer: null, people: [] }),
}));

/** What the API takes for a person. */
export function askedOf(p: AskPerson): { identifier: string } | { name: string; contact: string } {
  return p.kind === 'user' ? { identifier: p.identifier } : { name: p.name, contact: p.phone };
}
