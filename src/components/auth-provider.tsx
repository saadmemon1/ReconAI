'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface AuthState {
  authenticated: boolean;
  loading: boolean;
  submitApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  fetchDocAI: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    authenticated: false,
    loading: true,
  });

  const fetchDocAI = useCallback((path: string, options?: RequestInit) => {
    return fetch(`/api/docai${path}`, options);
  }, []);

  // No identity to check under key auth (GET /v1/auth/session 401s with a
  // key). Instead, probe a lightweight authenticated endpoint through the
  // existing proxy — 200 means the stored key is valid, anything else
  // (including "no cookie") means it isn't.
  const checkAuthenticated = useCallback(async () => {
    try {
      const res = await fetchDocAI('/knowledge-bases');
      setState({ authenticated: res.ok, loading: false });
    } catch {
      setState({ authenticated: false, loading: false });
    }
  }, [fetchDocAI]);

  useEffect(() => { checkAuthenticated(); }, [checkAuthenticated]);

  const submitApiKey = async (key: string) => {
    const res = await fetch('/api/auth/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key }),
    });
    if (res.ok) {
      setState({ authenticated: true, loading: false });
      return { ok: true };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || 'Invalid API key' };
  };

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setState({ authenticated: false, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, submitApiKey, signOut, fetchDocAI }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
