'use client';
import { useAuth } from './auth-provider';
import { CreditDisplay } from './credit-display';
import { WorkspaceManager } from './workspace-manager';
import { FileManager } from './file-manager';
import { ReconcileRunner } from './reconcile-runner';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Separator } from './ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { LogOut } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

type Tab = 'files' | 'report';

export interface ReconcileRequest {
  fileIds: string[];
  modelId: string;
  nonce: number;
}

export function Dashboard() {
  const { signOut, user, orgName } = useAuth();
  const [tab, setTab] = useState<Tab>('files');
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [reconcileRequest, setReconcileRequest] = useState<ReconcileRequest | null>(null);

  // Avatar initials: from the user's name, else the email's first letter.
  const displayName = user?.name?.trim() || user?.email || '';
  const initials = (displayName || '?')
    .split(/\s+/)
    .map(part => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2);

  const handleReconcile = (fileIds: string[], modelId: string) => {
    setReconcileRequest({ fileIds, modelId, nonce: Date.now() });
    setTab('report');
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      // --tabbar-h = height of the sticky tab bar (h-8 button 32px + py-3 24px).
      // The findings table's sticky filter bar/header in report-viewer offset
      // below it via this var — single source of truth if the bar resizes.
      style={{ '--tabbar-h': '56px' } as CSSProperties}
    >
      {/* Header */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <h1 className="text-h2">ReconAI</h1>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 rounded-full cursor-pointer"
                aria-label="Account menu"
                title="Account"
              />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials || '?'}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          {/* side="left": opens beside the avatar over the header's empty right
              side — the cramped gap under the avatar ends right at the sticky
              tab bar's top edge, so a bottom-anchored popup would overlap it */}
          <DropdownMenuContent align="center" side="left" className="w-56">
            <div className="px-3 py-2.5">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName || 'Account'}
              </p>
              {orgName && (
                <p className="mt-0.5 truncate text-xs text-secondary">{orgName}</p>
              )}
            </div>
            <Separator className="my-1" />
            <DropdownMenuItem
              className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
              onClick={() => setSignOutOpen(true)}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Sign-out confirmation — opened from the account menu; keeps the
          single-click-can't-sign-you-out guarantee */}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
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
            {/* Tabs — sticky: pinned to the top of the viewport while scrolling
                so the active tab stays visible. -mt-3/mb-3 cancel out the py-3
                so the resting layout is pixel-identical to before. */}
            <div className="sticky top-0 z-30 bg-background py-3 -mt-3 mb-3 flex gap-2">
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
              {tab === 'files' && <FileManager kbId={selectedKB} onWorkspacesChanged={() => setWsRefreshKey(k => k + 1)} onSwitchWorkspace={setSelectedKB} onReconcile={handleReconcile} />}
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
