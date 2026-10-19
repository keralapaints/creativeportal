import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, post, tokenStore } from '../api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [booting, setBooting] = useState(true);

  const loadMeta = useCallback(async () => {
    const m = await api('/meta');
    setMeta(m);
  }, []);

  useEffect(() => {
    const boot = async () => {
      if (!tokenStore.get()) { setBooting(false); return; }
      try {
        const { user: u } = await api('/auth/me');
        setUser(u);
        await loadMeta();
      } catch {
        tokenStore.clear();
      } finally {
        setBooting(false);
      }
    };
    boot();
    const onLogout = () => { setUser(null); };
    window.addEventListener('cd:logout', onLogout);
    return () => window.removeEventListener('cd:logout', onLogout);
  }, [loadMeta]);

  const finish = async ({ token, user: u }) => {
    tokenStore.set(token);
    setUser(u);
    await loadMeta();
  };

  const login = async (email, password) => finish(await post('/auth/login', { email, password }));
  const setup = async (payload) => finish(await post('/auth/setup', payload));
  const logout = () => { tokenStore.clear(); setUser(null); };

  return (
        <AuthCtx.Provider value={{ user, setUser, meta, booting, login, setup, logout, refreshMeta: loadMeta }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
