import { create } from 'zustand';
import type { DeepLink } from '../lib/deepLinks';

/** SYS-08: a link waiting to open — after sign-in and the PIN, or at sign-up for a referral code. */
interface DeepLinkState {
  pending: DeepLink | null;
  setPending: (link: DeepLink | null) => void;
  /** Take a waiting referral code (ONB-11 fills it in). */
  takeReferral: () => string | null;
}

export const useDeepLink = create<DeepLinkState>((set, get) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  takeReferral: () => {
    const p = get().pending;
    if (p?.kind !== 'referral') return null;
    set({ pending: null });
    return p.code;
  },
}));
