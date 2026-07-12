import * as SecureStore from 'expo-secure-store';
import { API_URL, STORAGE_KEYS } from '../config';
import { useAuth } from '../store/auth';

export class ApiError extends Error {
  statusCode: number;
  errors?: Record<string, string[]>;

  constructor(message: string, statusCode: number, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
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

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }

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
    const message =
      firstValidationError(json?.errors) ??
      json?.message ??
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json?.errors);
  }

  return json.data as T;
}
