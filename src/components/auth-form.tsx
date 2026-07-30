'use client';
import { useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Label } from './ui/label';

export function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-h1 mb-8">ReconAI</h1>
        
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
          </div>

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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
