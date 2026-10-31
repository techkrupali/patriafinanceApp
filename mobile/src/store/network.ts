import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config';

/** The last total balance a person saw, so SYS-04 can show it offline (even after a restart). */
export interface BalanceSnapshot {
  userId: number;
  total: string;
  at: number;
}

/**
 * SYS-04 Offline: set by the API client when a request can't reach Patriai,
 * cleared on the next answer. `lastOnline` is when we last heard back, so the
 * app can say "Showing balances from 11:02 pm".
 */
interface NetworkState {
  offline: boolean;
  lastOnline: number;
  snapshot: BalanceSnapshot | null;
  setOffline: (offline: boolean) => void;
  hydrate: () => Promise<void>;
  remember: (userId: number, total: string) => void;
}

export const useNetwork = create<NetworkState>((set, get) => ({
  offline: false,
  lastOnline: Date.now(),
  snapshot: null,
  setOffline: (offline) => set({ offline, lastOnline: offline ? get().lastOnline : Date.now() }),

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEYS.lastBalance);
      if (raw) set({ snapshot: JSON.parse(raw) as BalanceSnapshot });
    } catch {
      // Nothing saved; offline Home shows no figure.
    }
  },

  remember: (userId, total) => {
    const snapshot = { userId, total, at: Date.now() };
    set({ snapshot });
    void SecureStore.setItemAsync(STORAGE_KEYS.lastBalance, JSON.stringify(snapshot)).catch(() => {});
  },
}));
