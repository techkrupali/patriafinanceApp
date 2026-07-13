import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { STORAGE_KEYS } from '../config';
import type { User } from '../api/types';

export type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthState {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  biometricEnabled: boolean;
  /** A persisted session exists in SecureStore (used for biometric quick sign-in). */
  hasStoredSession: boolean;
  hydrate: () => Promise<void>;
  setSession: (user: User, token: string) => Promise<void>;
  /** Persist a token without marking the app authed (e.g. right after register, before OTP). */
  setPendingToken: (token: string, user?: User) => Promise<void>;
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
  ]);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  status: 'loading',
  biometricEnabled: false,
  hasStoredSession: false,

  hydrate: async () => {
    try {
      const [token, userJson, bio] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.token),
        SecureStore.getItemAsync(STORAGE_KEYS.user),
        SecureStore.getItemAsync(STORAGE_KEYS.biometric),
      ]);
      const biometricEnabled = bio === '1';
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

  setPendingToken: async (token, user) => {
    await SecureStore.setItemAsync(STORAGE_KEYS.token, token);
    if (user) {
      await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(user));
    }
    set({ token });
  },

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
    set({ user: null, token: null, status: 'guest', biometricEnabled: false, hasStoredSession: false });
  },

  sessionExpired: async () => {
    if (get().status !== 'authed') return;
    await clearPersisted();
    set({ user: null, token: null, status: 'guest', biometricEnabled: false, hasStoredSession: false });
  },
}));
