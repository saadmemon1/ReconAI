'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
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
      setKBs(data.knowledge_bases || data.items || []);
      // Auto-select first workspace if none selected
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

  return (
    <div className="flex items-center gap-3">
      <Select value={selectedKB} onValueChange={v => onSelect(v)}>
        <SelectTrigger className="w-64">
          <SelectValue>{selectedName || 'Select a workspace'}</SelectValue>
        </SelectTrigger>
        <SelectContent side="bottom" align="start" sideOffset={6} alignItemWithTrigger={false}>
          {kbs.length === 0 && (
            <p className="px-3 py-2 text-sm text-secondary">No workspaces yet.</p>
          )}
          {kbs.map(kb => (
            <SelectItem key={kb.id} value={kb.id}>
              {kb.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedKB && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete workspace"
          title="Delete workspace"
          className="w-9 h-9 text-destructive"
          onClick={() => {
            const target = kbs.find(k => k.id === selectedKB);
            if (target) setDeleteTarget(target);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}

      <Button variant="secondary" onClick={() => setCreateOpen(true)}>
        New Workspace
      </Button>

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
            <Button variant="destructive" onClick={deleteKB}>Delete Workspace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
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
