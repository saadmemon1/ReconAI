'use client';
import { useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { ThreeDotGrid } from './ui/three-dot-grid';

export function AuthForm() {
  const { submitApiKey } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await submitApiKey(apiKey);

    if (!result.ok) setError(result.error || 'Authentication failed');
    setLoading(false);
  };

  return (
    <ThreeDotGrid dotColor="#334155">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-display text-center mb-8">ReconAI</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="apiKey" className="mb-1.5">DocAI API Key</Label>
            <Input
              id="apiKey" type="password" value={apiKey}
              onChange={e => setApiKey(e.target.value)} required
              autoComplete="off"
            />
            <p className="mt-1.5 text-xs text-secondary">
              Get your API key from platform.providus.ai.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '...' : 'Continue'}
          </Button>
        </form>
        </Card>
      </ThreeDotGrid>
  );
}
