'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface FileItem {
  id: string;
  filename: string;
  created_at: string;
}

const PARSED_KEY = 'reconai-parsed-files';

export function FileManager({ kbId }: { kbId: string }) {
  const { fetchDocAI } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [parsing, setParsing] = useState<string[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsedIds, setParsedIds] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PARSED_KEY);
      if (saved) setParsedIds(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  const markParsed = (fileIds: string[]) => {
    setParsedIds(prev => {
      const next = new Set(prev);
      fileIds.forEach(id => next.add(id));
      localStorage.setItem(PARSED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const loadFiles = async () => {
    const res = await fetchDocAI(`/files?kb_id=${kbId}`);
    const data = await res.json();
    setFiles(data.files || data.items || []);
  };

  useEffect(() => { loadFiles(); }, [kbId]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('knowledge_base_id', kbId);
      formData.append('filename', file.name);
      await fetchDocAI('/files', { method: 'POST', body: formData });
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadFiles();
  };

  const deleteFile = async (fileId: string) => {
    await fetchDocAI(`/files/${fileId}`, { method: 'DELETE' });
    loadFiles();
  };

  const viewFile = (fileId: string) => {
    window.open(`/api/docai/files/${fileId}/content`, '_blank');
  };

  // Bulk parse: send all selected IDs at once, track jobs per file
  const bulkParse = async (fileIds: string[]) => {
    const toParse = fileIds.filter(id => !parsedIds.has(id));
    if (toParse.length === 0) return;
    
    setParsing(prev => [...prev, ...toParse]);
    
    const res = await fetchDocAI('/files/parse/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        file_ids: toParse,
        options: { backend: 'auto' }
      }),
    });
    
    const data = await res.json();
    const jobs: { jobId: string; fileId: string }[] = [];
    
    if (data.jobs) {
      for (const j of data.jobs) {
        const jobId = j.job?.job_id || j.id;
        if (jobId) {
          // DocAI may return one job per file or per batch — poll each file
          toParse.forEach(fid => jobs.push({ jobId, fileId: fid }));
        }
      }
    }
    
    for (const { fileId } of jobs) {
      const jobId = jobs[0].jobId; // same job for bulk
      const poll = setInterval(async () => {
        const statusRes = await fetchDocAI(`/files/${fileId}/jobs/${jobId}`);
        const statusData = await statusRes.json();
        const status = statusData.status || statusData.job?.status || statusData.job_status;
        setJobStatuses(prev => ({ ...prev, [fileId]: status }));
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          clearInterval(poll);
          setParsing(prev => prev.filter(id => id !== fileId));
          if (status === 'completed') {
            markParsed([fileId]);
            window.dispatchEvent(new Event('credits-refresh'));
          }
          loadFiles();
        }
      }, 2000);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} selected file(s)?`)) return;
    for (const id of selectedIds) {
      await deleteFile(id);
    }
    setSelectedIds(new Set());
    loadFiles();
  };

  const unparsedSelected = [...selectedIds].filter(id => !parsedIds.has(id)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h3">Files</h2>
        <div className="flex gap-2">
          <input 
            ref={fileInputRef}
            type="file" 
            multiple
            onChange={uploadFile} 
            className="hidden" 
            id="file-upload"
          />
          <Button variant="secondary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload File'}
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-muted rounded-lg border border-border">
          <span className="text-sm text-secondary">{selectedIds.size} selected</span>
          {unparsedSelected > 0 && (
            <Button variant="secondary" size="sm" onClick={() => bulkParse([...selectedIds])}>
              Parse {unparsedSelected} Selected
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive" onClick={bulkDelete}>
            Delete {selectedIds.size} Selected
          </Button>
        </div>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-secondary">No files in this knowledge base. Upload a file to begin.</p>
      ) : (
        <div className="space-y-2">
          {/* Select all */}
          <label className="flex items-center gap-3 p-2 text-sm text-secondary cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={selectedIds.size === files.length && files.length > 0}
              onChange={toggleAll}
              className="rounded border-border"
            />
            Select all ({files.length} files)
          </label>
          
          {files.map(f => {
            const isParsed = parsedIds.has(f.id);
            const isParsing = parsing.includes(f.id);
            return (
            <Card key={f.id} className={`p-3 flex items-center justify-between ${
              selectedIds.has(f.id) ? 'border-foreground bg-muted' : ''
            }`}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => toggleSelect(f.id)}
                  className="rounded border-border"
                />
                <div>
                  <p className="text-sm font-medium">
                    {f.filename}
                    {isParsed && <Badge variant="outline" className="ml-2 text-xs text-success">Parsed</Badge>}
                  </p>
                  {jobStatuses[f.id] && (
                    <span className="text-xs text-secondary">
                      Parse: {jobStatuses[f.id]}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => viewFile(f.id)}>
                  View
                </Button>
                {isParsed ? (
                  <Button variant="ghost" size="sm" disabled className="text-success">
                    Parsed ✓
                  </Button>
                ) : (
                  <Button 
                    variant="ghost" size="sm"
                    onClick={() => bulkParse([f.id])}
                    disabled={isParsing}
                  >
                    {isParsing ? 'Parsing...' : 'Parse'}
                  </Button>
                )}
                <Button 
                  variant="ghost" size="sm"
                  className="text-destructive"
                  onClick={() => { deleteFile(f.id); loadFiles(); }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          )})}
        </div>
      )}
    </div>
  );
}
