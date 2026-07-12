import { create } from "zustand";
import { TOKEN_KEY, USER_KEY, clearSession } from "@/lib/api";
import type { ApiUser } from "@/lib/types";

interface AuthState {
  token: string | null;
  user: ApiUser | null;
  hydrated: boolean;
  /** Load session from localStorage (client only). */
  hydrate: () => void;
  setSession: (token: string, user: ApiUser) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem(TOKEN_KEY);
    let user: ApiUser | null = null;
    try {
      user = JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as ApiUser | null;
    } catch {
      user = null;
    }
    set({ token, user, hydrated: true });
  },

  setSession: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, hydrated: true });
  },

  clear: () => {
    clearSession();
    set({ token: null, user: null, hydrated: true });
  },
}));
