import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { apiFetch } from '@/lib/api';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
};

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (redirectUrl?: string) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          setUser(null);
          return;
        }
        throw new Error('Failed to load user');
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUser();
  }, []);

  const login = (redirectUrl?: string) => {
    const destination = redirectUrl || `${window.location.origin}${window.location.pathname}${window.location.search}`;
    window.location.href = `/auth/login?redirect=${encodeURIComponent(destination)}`;
  };

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/auth/login';
  };

  const value = useMemo(
    () => ({ user, loading, error, login, logout, refresh: fetchUser }),
    [user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
