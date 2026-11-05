import { create } from 'zustand';

/** PLN-04 "You've used your 2 free rules": what the server said, shown once wherever it happened. */
export interface PlanLimit {
  code: 'plan_limit';
  feature: 'wallets' | 'rules' | string;
  limit: number;
  used: number;
  plan: string;
  title: string;
  body: string;
  /** A paid plan is on offer (else: free one up). */
  upgrade: boolean;
}

interface PlanPromptState {
  limit: PlanLimit | null;
  show: (limit: PlanLimit) => void;
  close: () => void;
}

export const usePlanPrompt = create<PlanPromptState>((set) => ({
  limit: null,
  show: (limit) => set({ limit }),
  close: () => set({ limit: null }),
}));

export function isPlanLimit(data: unknown): data is PlanLimit {
  return typeof data === 'object' && data !== null && (data as { code?: unknown }).code === 'plan_limit';
}
