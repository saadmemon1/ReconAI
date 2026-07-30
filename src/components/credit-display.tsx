'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Badge } from './ui/badge';

export function CreditDisplay() {
  const { fetchDocAI } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetchDocAI('/billing/credits')
      .then(r => r.json())
      .then(d => setCredits(d.credits?.balance_credits ?? 0))
      .catch(() => {});
  }, [fetchDocAI]);

  if (credits === null) return null;
  return (
    <Badge variant="outline" className="text-sm">
      {credits} credits
    </Badge>
  );
}
