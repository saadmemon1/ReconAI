'use client';
import { useAuth } from './auth-provider';
import { CreditDisplay } from './credit-display';
import { KBManager } from './kb-manager';
import { FileManager } from './file-manager';
import { ReconcileRunner } from './reconcile-runner';
import { Button } from './ui/button';
import { useState } from 'react';

type Tab = 'files' | 'reconcile';

export function Dashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('files');
  const [selectedKB, setSelectedKB] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <h1 className="text-h2">ReconAI</h1>
        <div className="flex items-center gap-4">
          <CreditDisplay />
          <Button variant="ghost" onClick={signOut}>Sign Out</Button>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* KB Selection */}
        <section className="mb-8">
          <KBManager selectedKB={selectedKB} onSelect={setSelectedKB} />
        </section>

        {selectedKB && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <Button 
                variant={tab === 'files' ? 'default' : 'ghost'}
                onClick={() => setTab('files')}
              >
                Files
              </Button>
              <Button 
                variant={tab === 'reconcile' ? 'default' : 'ghost'}
                onClick={() => setTab('reconcile')}
              >
                Reconcile
              </Button>
            </div>

            {tab === 'files' && <FileManager kbId={selectedKB} />}
            {tab === 'reconcile' && <ReconcileRunner kbId={selectedKB} />}
          </>
        )}
      </div>
    </div>
  );
}
