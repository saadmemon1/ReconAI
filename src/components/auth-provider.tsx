'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

interface AuthState {
  authenticated: boolean;
  user: { email?: string; name?: string } | null;
  orgId: string | null;
  currentKnowledgeBaseId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string, name: string, org: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  fetchDocAI: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    authenticated: false,
    user: null as { email?: string; name?: string } | null,
    orgId: null as string | null,
    currentKnowledgeBaseId: null as string | null,
    loading: true,
  });

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        setState(s => ({ ...s, authenticated: false, loading: false }));
        return;
      }
      const data = await res.json();
      if (data?.authenticated) {
        setState({
          authenticated: true,
          user: data.user || null,
          orgId: data.orgId || null,
          currentKnowledgeBaseId: data.currentKnowledgeBaseId || null,
          loading: false,
        });
      } else {
        setState(s => ({ ...s, authenticated: false, loading: false }));
      }
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const signIn = async (email: string, password: string) => {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      await checkSession();
      return { ok: true };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || 'Sign in failed' };
  };

  const signUp = async (email: string, password: string, name: string, org: string) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, organization: org }),
    });
    if (res.ok) {
      await checkSession();
      return { ok: true };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error || 'Sign up failed' };
  };

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setState({ authenticated: false, user: null, orgId: null, currentKnowledgeBaseId: null, loading: false });
  };

  const fetchDocAI = (path: string, options?: RequestInit) => {
    return fetch(`/api/docai${path}`, options);
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut, fetchDocAI }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
