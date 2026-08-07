'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './auth-provider';

/**
 * Live DocAI credit balance. Renders as a plain text row ("1,250 credits
 * remaining") — the parent popup provides the icon and layout so it stays
 * uniform with the other menu rows.
 */
export function CreditDisplay() {
  const { fetchDocAI } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);

  const loadCredits = useCallback(async () => {
    try {
      const res = await fetchDocAI('/billing/credits');
      const d = await res.json();
      setCredits(d.credits?.balance_credits ?? 0);
    } catch {}
  }, [fetchDocAI]);

  useEffect(() => { loadCredits(); }, [loadCredits]);

  // Listen for credits-refresh events (dispatched after parse/job completion)
  useEffect(() => {
    const handler = () => loadCredits();
    window.addEventListener('credits-refresh', handler);
    return () => window.removeEventListener('credits-refresh', handler);
  }, [loadCredits]);

  if (credits === null) return null;
  return <span>{credits.toLocaleString()} credits remaining</span>;
}
