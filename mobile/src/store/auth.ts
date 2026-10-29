import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../config';
import type { User } from '../api/types';

export type AuthStatus = 'loading' | 'authed' | 'guest';

/** Where "Next steps" on the wallet-ready screen sends a brand-new user. */
export type PostOnboardingRoute = 'Kyc' | 'FamilyHub' | 'CreateWallet' | 'Invitations' | 'BusinessSetup';

/** VON-01 "For my family" or "For my business": which home the app opens on. */
export type AppMode = 'family' | 'business';

interface AuthState {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  biometricEnabled: boolean;
  /** A persisted session exists in SecureStore (used for biometric quick sign-in). */
  hasStoredSession: boolean;
  hydrate: () => Promise<void>;
  setSession: (user: User, token: string) => Promise<void>;
  /**
   * Persist a brand-new account's session without entering the app, so the
   * last onboarding screens (ONB-09, ONB-12) can call the API first.
   */
  beginOnboarding: (user: User, token: string) => Promise<void>;
  /** Leave onboarding for the app, optionally opening a next-step screen. */
  finishOnboarding: (next?: PostOnboardingRoute) => void;
  /** Read once by the main tabs after onboarding, then cleared. */
  postAuthRoute: PostOnboardingRoute | null;
  /** Set before signing in (e.g. "I have an invite") to open that screen once inside. */
  setPostAuthRoute: (route: PostOnboardingRoute | null) => void;
  clearPostAuthRoute: () => void;
  mode: AppMode;
  /** Switch between the family app and vendor mode (remembered on this phone). */
  setMode: (mode: AppMode) => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  /** Restore the persisted session after a successful biometric prompt. */
  unlockStoredSession: () => Promise<boolean>;
  /** Update the in-memory + persisted user (e.g. after profile refresh). */
  setUser: (user: User) => Promise<void>;
  /** Clear everything locally (server logout is done by the caller). */
  logout: () => Promise<void>;
  /** Called by the API client on 401. */
  sessionExpired: () => Promise<void>;
}

async function clearPersisted(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.token),
    SecureStore.deleteItemAsync(STORAGE_KEYS.user),
    SecureStore.deleteItemAsync(STORAGE_KEYS.biometric),
    // Also drop the biometric-cached transaction PIN when a session ends.
    SecureStore.deleteItemAsync(STORAGE_KEYS.txnPin),
    SecureStore.deleteItemAsync(STORAGE_KEYS.mode),
  ]);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  status: 'loading',
  biometricEnabled: false,
  hasStoredSession: false,
  postAuthRoute: null,
  mode: 'family',

  hydrate: async () => {
    try {
      const [token, userJson, bio, mode] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.token),
        SecureStore.getItemAsync(STORAGE_KEYS.user),
        SecureStore.getItemAsync(STORAGE_KEYS.biometric),
        SecureStore.getItemAsync(STORAGE_KEYS.mode),
      ]);
      const biometricEnabled = bio === '1';
      set({ mode: mode === 'business' ? 'business' : 'family' });
      const user: User | null = userJson ? JSON.parse(userJson) : null;

      if (token && user && !biometricEnabled) {
        set({ user, token, status: 'authed', biometricEnabled, hasStoredSession: true });
      } else {
        // Either no session, or a session locked behind biometrics.
        set({
          user: null,
          token: null,
          status: 'guest',
          biometricEnabled,
          hasStoredSession: Boolean(token && user),
        });
      }
    } catch {
      set({ user: null, token: null, status: 'guest', biometricEnabled: false, hasStoredSession: false });
    }
  },

  setSession: async (user, token) => {
    await SecureStore.setItemAsync(STORAGE_KEYS.token, token);
    await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user));
    set({ user, token, status: 'authed', hasStoredSession: true });
  },

  beginOnboarding: async (user, token) => {
    await SecureStore.setItemAsync(STORAGE_KEYS.token, token);
    await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user));
    // hasStoredSession stays false until the app is entered, so turning on
    // biometrics mid-onboarding doesn't swap the screen for the app lock.
    set({ user, token });
  },

  finishOnboarding: (next) => {
    if (!get().token) return;
    set({ status: 'authed', hasStoredSession: true, postAuthRoute: next ?? get().postAuthRoute });
  },

  setPostAuthRoute: (route) => set({ postAuthRoute: route }),

  setMode: async (mode) => {
    await SecureStore.setItemAsync(STORAGE_KEYS.mode, mode);
    set({ mode });
  },
  clearPostAuthRoute: () => set({ postAuthRoute: null }),

  setBiometricEnabled: async (enabled) => {
    if (enabled) {
      await SecureStore.setItemAsync(STORAGE_KEYS.biometric, '1');
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.biometric);
    }
    set({ biometricEnabled: enabled });
  },

  unlockStoredSession: async () => {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEYS.token),
      SecureStore.getItemAsync(STORAGE_KEYS.user),
    ]);
    if (!token || !userJson) {
      set({ hasStoredSession: false });
      return false;
    }
    const user: User = JSON.parse(userJson);
    set({ user, token, status: 'authed', hasStoredSession: true });
    return true;
  },

  setUser: async (user) => {
    await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    await clearPersisted();
    set({ user: null, token: null, status: 'guest', biometricEnabled: false, hasStoredSession: false, mode: 'family' });
  },

  sessionExpired: async () => {
    if (get().status !== 'authed') return;
    await clearPersisted();
    set({ user: null, token: null, status: 'guest', biometricEnabled: false, hasStoredSession: false });
  },
}));

/** Length of the signed-in person's transaction PIN (6 for phone sign-ups, 4 for older accounts). */
export function useTxnPinLength(): number {
  return useAuth((s) => s.user?.pin_length ?? 4);
}
