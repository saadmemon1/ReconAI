'use client';
import { useAuth } from './auth-provider';
import { CreditDisplay } from './credit-display';
import { WorkspaceManager } from './workspace-manager';
import { FileManager } from './file-manager';
import { ReconcileRunner } from './reconcile-runner';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

type Tab = 'files' | 'report';

export interface ReconcileRequest {
  fileIds: string[];
  modelId: string;
  nonce: number;
}

export function Dashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('files');
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [reconcileRequest, setReconcileRequest] = useState<ReconcileRequest | null>(null);

  const handleReconcile = (fileIds: string[], modelId: string) => {
    setReconcileRequest({ fileIds, modelId, nonce: Date.now() });
    setTab('report');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <h1 className="text-h2">ReconAI</h1>
        <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
            className="w-9 h-9"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOut className="w-4 h-4" />
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out of ReconAI?</DialogTitle>
              <DialogDescription>
                You will need to sign in again to access your workspaces and reports.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSignOutOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  setSignOutOpen(false);
                  signOut();
                }}
              >
                Sign Out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {/* Body */}
      <div className="flex-1 w-full max-w-6xl mx-auto px-8 py-8">
        {/* Workspace Selection */}
        <section className="mb-8">
          <WorkspaceManager 
            key={wsRefreshKey}
            selectedKB={selectedKB} 
            onSelect={(id) => {
              setReconcileRequest(null); // workspace switch: don't re-run a stale request
              setSelectedKB(id);
            }} 
          />
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
                variant={tab === 'report' ? 'default' : 'ghost'}
                onClick={() => {
                  setReconcileRequest(null); // manual view: don't re-trigger a run
                  setTab('report');
                }}
              >
                Report
              </Button>
            </div>

            <div key={tab} className="animate-crossfade">
              {tab === 'files' && <FileManager kbId={selectedKB} onWorkspacesChanged={() => setWsRefreshKey(k => k + 1)} onReconcile={handleReconcile} />}
              {tab === 'report' && <ReconcileRunner key={selectedKB} kbId={selectedKB} reconcileRequest={reconcileRequest} />}
            </div>
          </>
        )}
      </div>

      {/* Credits — floating bottom left */}
      <div className="fixed bottom-4 left-4 z-40">
        <CreditDisplay />
      </div>
    </div>
  );
}
