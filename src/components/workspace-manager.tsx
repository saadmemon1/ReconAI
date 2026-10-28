'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Check, ChevronsUpDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface KB {
  id: string;
  name: string;
  description?: string;
}

export function WorkspaceManager({ selectedKB, onSelect }: { 
  selectedKB: string | null; 
  onSelect: (id: string | null) => void 
}) {
  const { fetchDocAI } = useAuth();
  const [kbs, setKBs] = useState<KB[]>([]);
  const [newName, setNewName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KB | null>(null);
  const [loading, setLoading] = useState(true);

  const loadKBs = async () => {
    try {
      const res = await fetchDocAI('/knowledge-bases');
      const data = await res.json();
      const list = data.knowledge_bases || data.items || [];
      setKBs(list);
      // Auto-open the most recent workspace (API returns newest-first) when
      // nothing is selected — e.g. fresh login or page reload.
      if (!selectedKB && list.length > 0) onSelect(list[0].id);
      setLoading(false);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadKBs(); }, []);

  const createKB = async () => {
    if (!newName.trim()) return;
    const res = await fetchDocAI('/knowledge-bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    const newId = data.id || data.knowledge_base?.id;
    setNewName('');
    setCreateOpen(false);
    if (newId) onSelect(newId); // auto-switch to the new workspace
    loadKBs();
  };

  const deleteKB = async () => {
    if (!deleteTarget) return;
    await fetchDocAI(`/knowledge-bases/${deleteTarget.id}?confirm_permanent=true`, { method: 'DELETE' });
    if (selectedKB === deleteTarget.id) onSelect(null);
    setDeleteTarget(null);
    loadKBs();
  };

  const selectedName = kbs.find(k => k.id === selectedKB)?.name;

  // The workspace picker sits at the top of the sidebar; creating and deleting live in its menu, so the page itself carries no
  // workspace controls (and no delete button next to the report).
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
            {(selectedName ?? '?').slice(0, 2).toUpperCase()}
          </span>
          {/* the icon-only rail on narrow screens keeps just the initials */}
          <span className="hidden min-w-0 flex-1 flex-col md:flex">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Workspace</span>
            <span className="truncate text-sm font-semibold">{selectedName || 'Select a workspace'}</span>
          </span>
          <ChevronsUpDown className="hidden size-4 shrink-0 text-muted-foreground md:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-1.5">
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workspaces</div>
          {kbs.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">No workspaces yet.</p>}
          {kbs.map(kb => (
            <DropdownMenuItem key={kb.id} onClick={() => onSelect(kb.id)} className="gap-2">
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{kb.name}</span>
              <Check className={cn('size-4 shrink-0 text-primary', kb.id !== selectedKB && 'invisible')} />
            </DropdownMenuItem>
          ))}
          <div className="my-1.5 border-t border-border" />
          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4 shrink-0" /> New workspace
          </DropdownMenuItem>
          {selectedKB && (
            <DropdownMenuItem
              onClick={() => { const target = kbs.find(k => k.id === selectedKB); if (target) setDeleteTarget(target); }}
              className="gap-2 text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
            >
              <Trash2 className="size-4 shrink-0" /> Delete this workspace…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workspace?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> and ALL files inside it.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteKB}>Delete workspace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              A workspace groups documents for reconciliation. You can upload files to it right after.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input 
              placeholder="Workspace name" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createKB()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createKB} disabled={!newName.trim()}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
