'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AuthState {
  authenticated: boolean;
  user: { email?: string; name?: string } | null;
  orgId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, name: string, org: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  fetchDocAI: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    authenticated: false,
    user: null as { email?: string; name?: string } | null,
    orgId: null as string | null,
    loading: true,
  });

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.authenticated) {
          setState({ authenticated: true, user: data.user || null, orgId: data.orgId, loading: false });
        } else {
          setState(s => ({ ...s, loading: false }));
        }
      })
      .catch(() => setState(s => ({ ...s, loading: false })));
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      setState({ authenticated: true, user: { email }, orgId: data.orgId, loading: false });
      return true;
    }
    return false;
  };

  const signUp = async (email: string, password: string, name: string, org: string) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, organization: org }),
    });
    if (res.ok) {
      const data = await res.json();
      setState({ authenticated: true, user: { email, name }, orgId: data.orgId, loading: false });
      return true;
    }
    return false;
  };

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    setState({ authenticated: false, user: null, orgId: null, loading: false });
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
