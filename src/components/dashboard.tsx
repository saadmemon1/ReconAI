'use client';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';

export function Dashboard() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <h1 className="text-h2">ReconAI</h1>
        <Button variant="ghost" onClick={signOut}>Sign Out</Button>
      </header>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <p className="text-sm text-secondary">
          Dashboard components will be added in upcoming tasks.
        </p>
      </div>
    </div>
  );
}
