'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
import { resolveUploadTarget, Workspace } from '@/lib/workspace-utils';
import { isFileParsed, FileWithProcessing } from '@/lib/file-status';
import { ModelSelector } from './model-selector';

interface FileItem extends FileWithProcessing {
  id: string;
  filename: string;
  created_at: string;
}

// DocAI only accepts PDFs and images (confirmed with the platform)
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff', 'image/bmp',
]);
const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.tiff,.bmp';

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type);
}

export function FileManager({ kbId, onWorkspacesChanged, onReconcile }: { 
  kbId: string; 
  onWorkspacesChanged?: () => void;
  onReconcile?: (fileIds: string[], modelId: string) => void;
}) {
  const { fetchDocAI } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [modelId, setModelId] = useState('');
  const [parsing, setParsing] = useState<string[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'existing' | 'new'>('existing');
  const [uploadWorkspaceId, setUploadWorkspaceId] = useState<string>(kbId);
  const [uploadNewName, setUploadNewName] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);

  const [parsedIds, setParsedIds] = useState<Set<string>>(new Set());

  const markParsed = (fileIds: string[]) => {
    setParsedIds(prev => {
      const next = new Set(prev);
      fileIds.forEach(id => next.add(id));
      return next;
    });
  };

  const loadFiles = async () => {
    const res = await fetchDocAI(`/files?kb_id=${kbId}&include=processing`);
    const data = await res.json();
    const fileList: FileItem[] = data.files || data.items || [];
    // Sort: parsed files at top, non-parsed at bottom
    fileList.sort((a, b) => Number(isFileParsed(b)) - Number(isFileParsed(a)));
    setFiles(fileList);
    // Sync parsed state from the authoritative server response
    setParsedIds(new Set(fileList.filter(isFileParsed).map(f => f.id)));
  };

  useEffect(() => {
    // Workspace switch: clear selection + job statuses for the previous workspace
    setSelectedIds(new Set());
    setJobStatuses({});
    loadFiles();
  }, [kbId]);

  // Load workspaces when upload dialog opens
  const openUploadDialog = async () => {
    try {
      const res = await fetchDocAI('/knowledge-bases');
      const data = await res.json();
      setWorkspaces(data.knowledge_bases || data.items || []);
    } catch {}
    setUploadWorkspaceId(kbId);
    setUploadMode('existing');
    setUploadNewName('');
    setUploadFiles([]);
    setRejectedCount(0);
    setUploadOpen(true);
  };

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

  const doUpload = async () => {
    if (uploadFiles.length === 0) return;
    setUploading(true);

    // Decide target workspace
    const target = resolveUploadTarget(workspaces, uploadMode, uploadWorkspaceId, uploadNewName);
    if (!target.name) {
      setUploading(false);
      return;
    }

    let targetId = target.id;
    // Create workspace if new mode
    if (!targetId) {
      const createRes = await fetchDocAI('/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: target.name }),
      });
      const createData = await createRes.json();
      targetId = createData.id || createData.knowledge_base?.id;
      if (!targetId) {
        setUploading(false);
        return;
      }
      onWorkspacesChanged?.();
    }

    // Upload files
    const uploadedIds: string[] = [];
    for (const file of uploadFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('knowledge_base_id', targetId);
      formData.append('filename', file.name);
      const res = await fetchDocAI('/files', { method: 'POST', body: formData });
      // Try to capture the new file id from the upload response
      try {
        const d = await res.json();
        const id = d?.id || d?.file?.id || d?.files?.[0]?.id;
        if (id) uploadedIds.push(id);
      } catch {}
    }

    // If any upload response lacked an id, find them by filename in the refreshed list
    const refreshed = await fetchDocAI(`/files?kb_id=${targetId}&include=processing`).then(r => r.json());
    const allFiles: FileItem[] = refreshed.files || refreshed.items || [];
    const byName = new Map(allFiles.map(f => [f.filename, f.id]));
    for (const file of uploadFiles) {
      if (byName.has(file.name)) uploadedIds.push(byName.get(file.name)!);
    }

    setUploading(false);
    setUploadOpen(false);
    setUploadFiles([]);

    // Auto-parse freshly uploaded files — users upload to reconcile, not to store
    if (uploadedIds.length > 0) {
      loadFiles();
      bulkParse(uploadedIds);
    } else {
      loadFiles();
    }
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
      for (let i = 0; i < data.jobs.length && i < toParse.length; i++) {
        const j = data.jobs[i];
        const jobId = j.job?.job_id || j.id;
        if (jobId) {
          jobs.push({ jobId, fileId: toParse[i] });
        }
      }
    }
    
    for (const { jobId, fileId } of jobs) {
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
          <Button variant="secondary" disabled={uploading} onClick={openUploadDialog}>
            Upload File
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 mb-4 p-3 bg-muted rounded-lg border border-border">
          <div className="flex items-center gap-3">
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
          <div className="flex items-center gap-2">
            {selectedIds.size >= 2 && (
              <>
                <ModelSelector value={modelId} onChange={setModelId} />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={unparsedSelected > 0 || !modelId}
                  onClick={() => onReconcile?.([...selectedIds], modelId)}
                  className={unparsedSelected === 0 && modelId ? 'bg-success text-white hover:bg-success/80' : ''}
                >
                  Reconcile {selectedIds.size} Documents
                </Button>
                {unparsedSelected > 0 && (
                  <span className="text-xs text-secondary">Only parsed files can be reconciled</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-secondary">No files in this workspace. Upload a file to begin.</p>
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-2 text-sm text-secondary cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={selectedIds.size === files.length && files.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-border cursor-pointer"
            />
            Select all ({files.length} files)
          </label>
          
          {files.map((f, fi) => {
            const isParsed = parsedIds.has(f.id);
            const isParsing = parsing.includes(f.id);
            return (
            <div key={f.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(fi, 8) * 30}ms` }}>
            <Card className={`p-3 flex items-center justify-between ${
              selectedIds.has(f.id) ? 'border-foreground bg-muted' : ''
            }`}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => toggleSelect(f.id)}
                  className="w-4 h-4 rounded border-border cursor-pointer"
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
            </div>
          )})}
        </div>
      )}

      {/* Upload dialog: ask existing workspace or create new */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription>
              Choose where to upload: an existing workspace or a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-3">
            <Button 
              variant={uploadMode === 'existing' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setUploadMode('existing')}
            >
              Existing Workspace
            </Button>
            <Button 
              variant={uploadMode === 'new' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setUploadMode('new')}
            >
              New Workspace
            </Button>
          </div>

          {uploadMode === 'existing' ? (
            <div className="space-y-3">
              <Label>Workspace</Label>
              <Select value={uploadWorkspaceId} onValueChange={v => v && setUploadWorkspaceId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {workspaces.find(w => w.id === uploadWorkspaceId)?.name || 'Select a workspace'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {workspaces.length === 0 && (
                    <p className="px-3 py-2 text-sm text-secondary">No workspaces yet. Create one.</p>
                  )}
                  {workspaces.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>New Workspace Name</Label>
              <Input 
                placeholder="Workspace name" 
                value={uploadNewName} 
                onChange={e => setUploadNewName(e.target.value)} 
              />
            </div>
          )}

          <div className="space-y-3 pt-2">
            <Label>Files</Label>
            <input
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              onChange={e => {
                const picked = Array.from(e.target.files || []);
                const accepted = picked.filter(isAcceptedFile);
                setRejectedCount(picked.length - accepted.length);
                setUploadFiles(accepted);
              }}
              className="block w-full text-sm text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
            />
            {uploadFiles.length > 0 && (
              <p className="text-xs text-secondary">{uploadFiles.length} file(s) selected</p>
            )}
            {rejectedCount > 0 && (
              <p className="text-xs text-destructive">
                {rejectedCount} file(s) skipped — only PDF and image files (PNG, JPG, GIF, WEBP, TIFF, BMP) are supported.
              </p>
            )}
            <p className="text-xs text-secondary">
              Supported formats: PDF, PNG, JPG, GIF, WEBP, TIFF, BMP only.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button 
              onClick={doUpload} 
              disabled={uploading || uploadFiles.length === 0 || (uploadMode === 'new' && !uploadNewName.trim())}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
