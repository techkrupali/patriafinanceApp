import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config';

/**
 * ME-07 Face ID and app lock, kept on this phone: lock the app after a while
 * away (SYS-05), and ask for the typed PIN on payments over an amount even
 * with Face ID on. ME-13 bigger text and reduce motion live here too.
 */
interface AppLockPrefs {
  /** Minutes away before the app locks; null = off. */
  lockAfter: 0 | 1 | 5 | 15 | null;
  /** Naira; payments over this always ask for the typed PIN. null = Face ID for any amount. */
  pinOver: number | null;
  biggerText: boolean;
  reduceMotion: boolean;
}

interface AppLockState extends AppLockPrefs {
  /** The app was locked by SYS-05 and waits for the PIN or Face ID. */
  locked: boolean;
  hydrate: () => Promise<void>;
  save: (prefs: Partial<AppLockPrefs>) => Promise<void>;
  lock: () => void;
  unlock: () => void;
}

// ME-07: the app locks after 1 minute away unless the person picks another time.
const DEFAULTS: AppLockPrefs = { lockAfter: 1, pinOver: 100_000, biggerText: true, reduceMotion: false };

export const useAppLock = create<AppLockState>((set, get) => ({
  ...DEFAULTS,
  locked: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEYS.appLock);
      if (raw) set({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppLockPrefs>) });
    } catch {
      // Defaults if storage is unavailable.
    }
  },

  save: async (prefs) => {
    set(prefs);
    const { lockAfter, pinOver, biggerText, reduceMotion } = { ...get(), ...prefs };
    await SecureStore.setItemAsync(STORAGE_KEYS.appLock, JSON.stringify({ lockAfter, pinOver, biggerText, reduceMotion })).catch(() => {});
  },

  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
