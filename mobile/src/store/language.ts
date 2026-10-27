import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../config';

/** English or Nigerian Pidgin (ISO 639-3 `pcm`), per the prototype's toggle. */
export type Lang = 'en' | 'pcm';

interface LanguageState {
  lang: Lang;
  hydrate: () => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
}

export const useLanguage = create<LanguageState>((set) => ({
  lang: 'en',

  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(STORAGE_KEYS.language);
      if (saved === 'en' || saved === 'pcm') set({ lang: saved });
    } catch {
      // Keep English if storage is unavailable.
    }
  },

  setLang: async (lang) => {
    set({ lang });
    await SecureStore.setItemAsync(STORAGE_KEYS.language, lang).catch(() => {});
  },
}));
