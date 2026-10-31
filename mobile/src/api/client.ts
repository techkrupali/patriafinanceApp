import * as SecureStore from 'expo-secure-store';
import { API_URL, STORAGE_KEYS } from '../config';
import { useAuth } from '../store/auth';
import { useNetwork } from '../store/network';

export class ApiError extends Error {
  statusCode: number;
  errors?: Record<string, string[]>;
  /** The envelope's `data` on failure responses (e.g. { code: 'unverified' }). */
  data?: unknown;

  constructor(message: string, statusCode: number, errors?: Record<string, string[]>, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.data = data;
  }
}

interface Envelope<T> {
  status?: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

function firstValidationError(errors?: Record<string, string[]>): string | undefined {
  if (!errors) return undefined;
  for (const key of Object.keys(errors)) {
    const messages = errors[key];
    if (Array.isArray(messages) && messages.length > 0) return messages[0];
  }
  return undefined;
}

/**
 * Typed fetch wrapper for the Patriai API.
 * - Attaches the Bearer token from SecureStore.
 * - Unwraps the { status, message, data } envelope; throws ApiError on failure.
 * - On 401 with a stored token, clears the session and resets the auth store.
 */
export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);

  // FormData (file uploads) must NOT be JSON-stringified, and RN sets its own
  // multipart Content-Type (with boundary) when we leave the header unset.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    });
  } catch {
    // SYS-04: the app shows it's offline and what it last saw.
    useNetwork.getState().setOffline(true);
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }
  useNetwork.getState().setOffline(false);

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // Non-JSON response (e.g. server down / HTML error page).
  }

  if (res.status === 401 && token) {
    await useAuth.getState().sessionExpired();
  }

  if (!res.ok || !json || json.status === false) {
    // SYS-06: a server fault isn't the person's doing, and nothing went through.
    const message =
      res.status >= 500 && res.status !== 503
        ? "That's on us, not you. Nothing was sent or changed. Try again in a moment."
        : firstValidationError(json?.errors) ?? json?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json?.errors, json?.data);
  }

  return json.data as T;
}
