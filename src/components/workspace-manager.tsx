'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
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

  const deleteKB = async (id: string) => {
    if (!confirm('Permanently delete this workspace and ALL files? This is irreversible.')) return;
    await fetchDocAI(`/knowledge-bases/${id}?confirm_permanent=true`, { method: 'DELETE' });
    if (selectedKB === id) onSelect(null);
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

      <Button variant="secondary" onClick={() => setCreateOpen(true)}>
        New Workspace
      </Button>

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
