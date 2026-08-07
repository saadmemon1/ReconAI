'use client';
import { useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { PasswordStrength, usePasswordStrength } from './ui/password-strength';
import { ThreeDotGrid } from './ui/three-dot-grid';

export function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = usePasswordStrength(password);
  const passwordValid = strength.rules.every(r => r.met);
  // "Commonly guessed" patterns (password123, qwerty...) are flagged by the
  // meter as a warning; upstream only rejects too-short passwords, so we
  // warn rather than block on them.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'signup' && !passwordValid) {
      const unmet = strength.rules.filter(r => !r.met).map(r => r.label);
      setError(`Password must meet: ${unmet.join(', ')}.`);
      return;
    }

    setLoading(true);
    
    let result: { ok: boolean; error?: string };
    if (mode === 'signin') {
      result = await signIn(email, password);
    } else {
      result = await signUp(email, password, name, org);
    }
    
    if (!result.ok) setError(result.error || 'Authentication failed');
    setLoading(false);
  };

  return (
    <ThreeDotGrid dotColor="#334155">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-display text-center mb-8">ReconAI</h1>
        
        <div className="flex gap-2 mb-6">
          <Button 
            variant={mode === 'signin' ? 'default' : 'ghost'}
            onClick={() => setMode('signin')}
          >
            Sign In
          </Button>
          <Button 
            variant={mode === 'signup' ? 'default' : 'ghost'}
            onClick={() => setMode('signup')}
          >
            Sign Up
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <div>
                <Label htmlFor="name" className="mb-1.5">Name</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="org" className="mb-1">Organization Name</Label>
                <Input id="org" value={org} onChange={e => setOrg(e.target.value)} required />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="email" className="mb-1.5">Email</Label>
            <Input 
              id="email" type="email" value={email} 
              onChange={e => setEmail(e.target.value)} required 
            />
          </div>
          
          <div>
            <Label htmlFor="password" className="mb-1.5">Password</Label>
            <Input 
              id="password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required 
            />
            {mode === 'signup' && (
              <PasswordStrength value={password} className="mt-2" />
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
        </Card>
      </ThreeDotGrid>
  );
}
