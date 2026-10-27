import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../config';

/** Home sections a person can switch off (prototype HOM-08 "Customise home"). */
export type HomeSection = 'upcoming' | 'goals' | 'projects';

interface Prefs {
  /** Start every session with balances masked (HOM-02). */
  hideOnOpen: boolean;
  sections: Record<HomeSection, boolean>;
}

const DEFAULTS: Prefs = { hideOnOpen: false, sections: { upcoming: true, goals: true, projects: true } };

interface HomePrefsState extends Prefs {
  /** Masked right now (the eye on the balance card). */
  hidden: boolean;
  hydrate: () => Promise<void>;
  toggleHidden: () => void;
  save: (prefs: Prefs) => Promise<void>;
}

export const useHomePrefs = create<HomePrefsState>((set) => ({
  ...DEFAULTS,
  hidden: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEYS.homePrefs);
      const saved = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
      const prefs: Prefs = {
        hideOnOpen: saved.hideOnOpen ?? DEFAULTS.hideOnOpen,
        sections: { ...DEFAULTS.sections, ...saved.sections },
      };
      set({ ...prefs, hidden: prefs.hideOnOpen });
    } catch {
      // Defaults if storage is unavailable.
    }
  },

  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),

  save: async (prefs) => {
    set({ ...prefs, hidden: prefs.hideOnOpen });
    await SecureStore.setItemAsync(STORAGE_KEYS.homePrefs, JSON.stringify(prefs)).catch(() => {});
  },
}));
