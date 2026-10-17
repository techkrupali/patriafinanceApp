export const TOKEN_KEY = "patriai.admin.token";
export const USER_KEY = "patriai.admin.user";

export class ApiError extends Error {
  status: number;
  errors?: unknown;

  constructor(message: string, status: number, errors?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface Envelope<T> {
  status: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Clear the session, kick back to /login and throw the 401 ApiError. */
function expireSession(message?: string): never {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  throw new ApiError(message ?? "Session expired. Please log in again.", 401);
}

/**
 * Fetch wrapper for the Laravel API. Every endpoint answers with the
 * `{status, message, data}` envelope; this unwraps `data`, throws an
 * ApiError when `status` is false, and kicks back to /login on 401.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // Non-JSON response (proxy error, HTML error page, ...)
  }

  if (res.status === 401) expireSession(body?.message);

  if (!res.ok || !body || body.status === false) {
    throw new ApiError(
      body?.message ?? `Request failed (${res.status})`,
      res.status,
      body?.errors,
    );
  }

  return body.data as T;
}

/**
 * Fetch a private file (e.g. an uploaded document) as a Blob. Same Bearer
 * auth and 401 handling as `api()`; only errors arrive in the JSON envelope.
 * Callers turn the Blob into an object URL — a plain `<img src>` can't send
 * the token.
 */
export async function apiBlob(path: string): Promise<Blob> {
  const token = getToken();

  const res = await fetch(path, {
    headers: {
      // Makes Laravel answer errors as JSON; the file itself streams regardless.
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.ok) return res.blob();

  let body: Envelope<unknown> | null = null;
  try {
    body = (await res.json()) as Envelope<unknown>;
  } catch {
    // Non-JSON error body
  }

  if (res.status === 401) expireSession(body?.message);

  throw new ApiError(
    body?.message ?? `Request failed (${res.status})`,
    res.status,
    body?.errors,
  );
}

/** Build a query string, skipping empty/undefined values. */
export function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") sp.set(key, String(value));
  }
  const out = sp.toString();
  return out ? `?${out}` : "";
}
