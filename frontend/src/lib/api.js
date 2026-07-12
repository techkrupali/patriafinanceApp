const BASE = '/api/v1';

export function getToken() {
  return localStorage.getItem('token');
}

export function setSession(token, user) {
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/**
 * API wrapper. Backend contract: { status: boolean, message, data?, ... }.
 * Throws Error(message) on { status: false } or network failure; the full
 * payload is attached as err.payload.
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Network error — is the server running?');
  }

  if (res.status === 401 && auth) {
    clearSession();
    if (!location.hash.includes('login')) location.hash = '#/login';
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Unexpected server response');
  }

  if (json && json.status === false) {
    const err = new Error(json.message || 'Request failed');
    err.payload = json;
    throw err;
  }
  return json;
}
