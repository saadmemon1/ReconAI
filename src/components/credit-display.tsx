'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './auth-provider';
import { Badge } from './ui/badge';

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
  return (
    <Badge variant="outline" className="text-sm">
      {credits} credits
    </Badge>
  );
}
