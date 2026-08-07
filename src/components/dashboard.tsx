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
import { LogOut, FileText, FileBarChart, Coins } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { NavBar } from './ui/tubelight-navbar';

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
      className="flex min-h-screen bg-background"
      // --tabbar-h = 0: the sidebar occupies the left, not the top — the
      // report's sticky filter pins flush at the viewport top.
      style={{ '--tabbar-h': '0px' } as CSSProperties}
    >
      {/* Sidebar — sticky full-height rail on the LEFT: wordmark + vertical
          tabs persist while scrolling. */}
      <aside className="sticky top-0 z-30 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-background md:w-44">
        <button
          type="button"
          onClick={() => setTab('files')}
          className="flex items-center justify-center px-3 py-5 text-h2 font-semibold cursor-pointer text-foreground transition-opacity hover:opacity-70 md:justify-start md:px-5"
          title="Go to Files"
        >
          <span className="md:hidden">R</span>
          <span className="hidden md:inline">ReconAI</span>
        </button>
        <nav className="flex flex-col gap-1 px-3">
          {selectedKB && (
            <NavBar
              orientation="vertical"
              items={[
                { name: 'Files', url: '#', icon: FileText },
                { name: 'Report', url: '#', icon: FileBarChart },
              ]}
              value={tab === 'files' ? 'Files' : 'Report'}
              onChange={(name) => {
                if (name === 'Report') setReconcileRequest(null); // manual view: don't re-trigger a run
                setTab(name === 'Files' ? 'files' : 'report');
              }}
            />
          )}
        </nav>

        {/* Sidebar bottom: profile button — avatar + name in one row. The
            button's click target runs all the way down to the rail's bottom
            edge (pt-3 pb-6), while the visible row itself floats ~24px above
            it; the account menu opens upward */}
        <div className="mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 rounded-none px-3 pt-7 pb-6"
                  aria-label="Account menu"
                  title="Account"
                />
              }
            >
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">{initials || '?'}</AvatarFallback>
              </Avatar>
              <span className="hidden min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground md:block">
                {displayName || 'Account'}
              </span>
            </DropdownMenuTrigger>
            {/* Cozy 3-section popup: identity / credits / sign out. Every row
                shares the same padding + icon-gutter rhythm; the credits are a
                plain text row (no pill) so nothing sticks out. */}
            <DropdownMenuContent side="top" align="start" className="w-60 p-1.5">
              <div className="rounded-md px-2.5 py-3">
                <p className="truncate text-sm font-medium text-foreground">
                  {displayName || 'Account'}
                </p>
                {orgName && (
                  <p className="mt-0.5 truncate text-xs text-secondary">{orgName}</p>
                )}
              </div>
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5">
                <Coins className="size-4 shrink-0 text-secondary" />
                <span className="text-sm text-foreground">
                  <CreditDisplay />
                </span>
              </div>
              {/* minimal divider above the action — subtle but visible
                  (bg-foreground/15: the old bg-border hairline vanished on
                  HiDPI) */}
              <Separator className="my-2 bg-foreground/15" />
              <DropdownMenuItem
                className="py-2.5 text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                onClick={() => setSignOutOpen(true)}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main column — content scrolls under the sticky rail */}
      <div className="relative min-w-0 flex-1">

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
        <div className="mx-auto w-full max-w-6xl px-8 py-8">
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
              {/* Tabs live in the sidebar rail now (see aside above) */}
              <div key={tab} className="animate-crossfade">
                {tab === 'files' && <FileManager kbId={selectedKB} onWorkspacesChanged={() => setWsRefreshKey(k => k + 1)} onSwitchWorkspace={setSelectedKB} onReconcile={handleReconcile} />}
                {tab === 'report' && <ReconcileRunner key={selectedKB} kbId={selectedKB} reconcileRequest={reconcileRequest} />}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
