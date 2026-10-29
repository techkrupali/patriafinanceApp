import { create } from 'zustand';

/**
 * SYS-04 Offline: set by the API client when a request can't reach Patriai,
 * cleared on the next answer. `lastOnline` is when we last heard back, so the
 * app can say "Showing balances from 11:02 pm".
 */
interface NetworkState {
  offline: boolean;
  lastOnline: number;
  setOffline: (offline: boolean) => void;
}

export const useNetwork = create<NetworkState>((set, get) => ({
  offline: false,
  lastOnline: Date.now(),
  setOffline: (offline) => set({ offline, lastOnline: offline ? get().lastOnline : Date.now() }),
}));
