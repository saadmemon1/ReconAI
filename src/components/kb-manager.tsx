'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';

interface KB {
  id: string;
  name: string;
  description?: string;
}

export function KBManager({ selectedKB, onSelect }: { 
  selectedKB: string | null; 
  onSelect: (id: string | null) => void 
}) {
  const { fetchDocAI } = useAuth();
  const [kbs, setKBs] = useState<KB[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const loadKBs = async () => {
    try {
      const res = await fetchDocAI('/knowledge-bases');
      const data = await res.json();
      setKBs(data.knowledge_bases || data.items || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadKBs(); }, []);

  const createKB = async () => {
    if (!newName.trim()) return;
    await fetchDocAI('/knowledge-bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName('');
    loadKBs();
  };

  const deleteKB = async (id: string) => {
    if (!confirm('Permanently delete this knowledge base and ALL files? This is irreversible.')) return;
    await fetchDocAI(`/knowledge-bases/${id}?confirm_permanent=true`, { method: 'DELETE' });
    if (selectedKB === id) onSelect(null);
    loadKBs();
  };

  return (
    <div>
      <h2 className="text-h3 mb-3">Knowledge Bases</h2>
      <div className="flex gap-2 mb-4">
        <Input 
          placeholder="New KB name" value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createKB()}
          className="max-w-xs"
        />
        <Button onClick={createKB} variant="secondary">Create</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {kbs.map(kb => (
          <Card 
            key={kb.id}
            className={`p-3 cursor-pointer flex items-center gap-3 ${
              selectedKB === kb.id ? 'ring-2 ring-foreground' : ''
            }`}
            onClick={() => onSelect(kb.id)}
          >
            <span className="text-sm font-medium">{kb.name}</span>
            <Button 
              variant="ghost" size="sm"
              className="text-destructive h-6 px-1"
              onClick={e => { e.stopPropagation(); deleteKB(kb.id); }}
            >
              Delete
            </Button>
          </Card>
        ))}
        {!loading && kbs.length === 0 && (
          <p className="text-sm text-secondary">No knowledge bases yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
