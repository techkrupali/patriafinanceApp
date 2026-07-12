import { createContext, useCallback, useContext, useState } from 'react';
import { api, clearSession, getStoredUser, getToken, setSession } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [token, setToken] = useState(getToken());

  const login = useCallback(async (username, password) => {
    const res = await api('/users/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    });
    setSession(res.data.token, res.data.user);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api('/users/register', { method: 'POST', body: payload, auth: false });
    setSession(res.data.token, res.data.user);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const refresh = useCallback(async () => {
    const res = await api('/users/get-details');
    const fresh = res.data;
    setSession(null, fresh);
    setUser(fresh);
    return fresh;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
