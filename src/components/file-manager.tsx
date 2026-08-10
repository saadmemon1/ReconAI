'use client';
import { useEffect, useState, useRef } from 'react';
import { ChevronDown, ChevronUp, FileText, FileImage, Search } from 'lucide-react';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { resolveUploadTarget, Workspace } from '@/lib/workspace-utils';
import { isFileParsed, FileWithProcessing } from '@/lib/file-status';
import { fileKind, formatFileDate, sortFiles, type FileSortKey, type SortDir } from '@/lib/file-table';
import { ModelSelector } from './model-selector';
import { ProgressiveFluxLoader } from './ui/progressive-flux-loader';
import { EvidencePdfViewer } from './ui/evidence-pdf-viewer';
import type { MindmapFileNode } from '@/lib/evidence-utils';

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

export function FileManager({ kbId, onWorkspacesChanged, onSwitchWorkspace, onReconcile }: { 
  kbId: string; 
  onWorkspacesChanged?: () => void;
  onSwitchWorkspace?: (id: string) => void;
  onReconcile?: (fileIds: string[], modelId: string) => void;
}) {
  const { fetchDocAI } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [modelId, setModelId] = useState('');
  const [parsing, setParsing] = useState<string[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Record<string, { status: string; percent: number }>>({});
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[] } | null>(null);
  const [sortKey, setSortKey] = useState<FileSortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
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

  // Latest-value refs: parse-poll intervals and async continuations outlive
  // renders, so they must never capture a stale kbId/loadFiles (that was the
  // "switched back to the old workspace when a doc finished parsing" bug).
  const kbIdRef = useRef(kbId);
  const loadFilesRef = useRef(loadFiles);
  useEffect(() => {
    kbIdRef.current = kbId;
    loadFilesRef.current = loadFiles;
  });
  // Track active parse-poll intervals so they're cleaned up on unmount.
  const pollersRef = useRef<Set<ReturnType<typeof setInterval>>>(new Set());
  useEffect(
    () => () => {
      pollersRef.current.forEach(clearInterval);
      pollersRef.current.clear();
    },
    []
  );

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

  // Visible rows = search filter + current sort. Sort input carries `parsed`
  // (derived from the server's processing block) — the sortFiles contract.
  const visibleFiles = sortFiles(
    files
      .filter(f => f.filename.toLowerCase().includes(search.trim().toLowerCase()))
      .map(f => ({ ...f, parsed: isFileParsed(f) })),
    sortKey,
    sortDir
  );

  const toggleAll = () => {
    if (selectedIds.size === visibleFiles.length && visibleFiles.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleFiles.map(f => f.id)));
    }
  };

  // Clicking a sortable header: same key toggles direction, a new key resets
  // to its default (status desc = parsed first — the locked default).
  const cycleSort = (key: FileSortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'status' ? 'desc' : 'asc');
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

    // Uploading to a workspace other than the current one should switch the
    // app there (creating a new workspace from the dialog previously left
    // the user stranded on the old one).
    if (targetId !== kbId) onSwitchWorkspace?.(targetId);

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
      bulkParse(uploadedIds, targetId);
    } else {
      loadFiles();
    }
  };

  const deleteFile = async (fileId: string) => {
    await fetchDocAI(`/files/${fileId}`, { method: 'DELETE' });
    loadFiles();
  };

  const viewFile = (fileId: string) => {
    setPreviewFileId(fileId);
  };

  // Bulk parse: send all selected IDs at once, track jobs per file.
  // targetKbId lets completion handlers know whether the user has switched
  // workspaces mid-parse — if so, the completion must NOT touch the new
  // workspace's state (that was the "switched back" bug).
  const bulkParse = async (fileIds: string[], targetKbId?: string) => {
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
        const percent = Number(statusData.percent ?? statusData.job?.percent ?? 0) || 0;
        setJobStatuses(prev => ({ ...prev, [fileId]: { status, percent } }));
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          clearInterval(poll);
          pollersRef.current.delete(poll);
          // User switched workspaces while this job ran — don't clobber the
          // new workspace's file list with a stale reload.
          if (targetKbId && kbIdRef.current !== targetKbId) return;
          setParsing(prev => prev.filter(id => id !== fileId));
          setJobStatuses(prev => {
            const next = { ...prev };
            delete next[fileId];
            return next;
          });
          if (status === 'completed') {
            markParsed([fileId]);
            window.dispatchEvent(new Event('credits-refresh'));
          }
          loadFilesRef.current();
        }
      }, 2000);
      pollersRef.current.add(poll);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    for (const id of deleteTarget.ids) {
      await deleteFile(id);
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      deleteTarget.ids.forEach(id => next.delete(id));
      return next;
    });
    setDeleteTarget(null);
    loadFiles();
  };

  const unparsedSelected = [...selectedIds].filter(id => !parsedIds.has(id)).length;

  // Inline single-pane PDF preview (files tab). id 0 is only used as a React
  // key — the viewer keys off fileId; no citations here, so it renders the
  // full-document stack with no highlights.
  const previewNode: MindmapFileNode | null = (() => {
    const pf = files.find(f => f.id === previewFileId);
    return pf
      ? { id: 0, title: pf.filename, role: 'FILE', fileId: pf.id, citations: [] }
      : null;
  })();

  // The preview fills the viewport from its own position down to ~16px above
  // the bottom — measured, so it never overflows regardless of what sits
  // above the panel (no more guessing at the reserve).
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!previewFileId) return;
    const el = previewPanelRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      setPreviewHeight(Math.max(320, window.innerHeight - top - 16));
    };
    // Deferred — synchronous setState in an effect body trips the lint rule.
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [previewFileId]);

  return (
    <div className="flex items-start gap-6">
      <div className="min-w-0 flex-[1.3]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h3">Files</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-secondary" />
            <Input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files..."
              aria-label="Search files"
              className="w-56 pl-8"
            />
          </div>
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
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget({ ids: [...selectedIds] })}>
              Delete {selectedIds.size} Selected
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size >= 2 && (
              <>
                {unparsedSelected === 0 && (
                  <ModelSelector value={modelId} onChange={setModelId} />
                )}
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
      ) : visibleFiles.length === 0 ? (
        <p className="text-sm text-secondary">No files match your search.</p>
      ) : (
        <div className="rounded-lg border border-border shadow-sm">
          <Table wrapperClassName="overflow-auto rounded-lg">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 py-3.5">
                  <input
                    type="checkbox"
                    aria-label="Select all files"
                    checked={selectedIds.size === visibleFiles.length && visibleFiles.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-border cursor-pointer"
                  />
                </TableHead>
                <TableHead
                  className="py-3.5"
                  aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button
                    type="button"
                    onClick={() => cycleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    File
                    {sortKey === 'name' &&
                      (sortDir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
                  </button>
                </TableHead>
                <TableHead
                  className="whitespace-nowrap py-3.5"
                  aria-sort={sortKey === 'date' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button
                    type="button"
                    onClick={() => cycleSort('date')}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Date Added
                    {sortKey === 'date' &&
                      (sortDir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
                  </button>
                </TableHead>
                <TableHead
                  className="py-3.5"
                  aria-sort={sortKey === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <button
                    type="button"
                    onClick={() => cycleSort('status')}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Status
                    {sortKey === 'status' &&
                      (sortDir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />)}
                  </button>
                </TableHead>
                <TableHead className="py-3.5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFiles.map(f => {
                const isParsed = parsedIds.has(f.id);
                const isParsing = parsing.includes(f.id);
                const job = jobStatuses[f.id];
                const KindIcon = fileKind(f.filename) === 'image' ? FileImage : FileText;
                return (
                  <TableRow
                    key={f.id}
                    data-state={selectedIds.has(f.id) ? 'selected' : undefined}
                  >
                    <TableCell className="py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${f.filename}`}
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleSelect(f.id)}
                        className="w-4 h-4 rounded border-border cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="min-w-[140px] py-3.5">
                      <div className="flex items-center gap-2.5">
                        <KindIcon className="size-4 shrink-0 text-secondary" />
                        <span className="truncate text-sm font-medium">{f.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-3.5 text-sm text-secondary tabular-nums">
                      {formatFileDate(f.created_at)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      {job ? (
                        <div className="max-w-[140px]">
                          <ProgressiveFluxLoader
                            value={job.percent}
                            phases={[
                              { at: 0, label: 'queued' },
                              { at: 25, label: 'parsing' },
                              { at: 80, label: 'finalizing' },
                              { at: 100, label: 'done' },
                            ]}
                            showLabel={false}
                            loop={false}
                            className="max-w-none"
                            barClassName="h-2.5"
                          />
                          <span className="sr-only">Parse: {job.status}</span>
                        </div>
                      ) : isParsed ? (
                        <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          Parsed
                        </span>
                      ) : (
                        <span className="text-xs text-secondary">Not parsed</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => viewFile(f.id)}>
                          View
                        </Button>
                        {!isParsed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => bulkParse([f.id])}
                            disabled={isParsing}
                          >
                            {isParsing ? 'Parsing...' : 'Parse'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ ids: [f.id] })}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

      {/* Delete confirmation — one dialog for per-row and bulk deletes; no
          browser confirm() anywhere in the Files tab (user-locked pattern). */}
      <Dialog open={deleteTarget !== null} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget && deleteTarget.ids.length > 1
                ? `Delete ${deleteTarget.ids.length} files?`
                : 'Delete file?'}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget && deleteTarget.ids.length === 1 ? (
                <>
                  This will permanently delete{' '}
                  <strong>{files.find(f => f.id === deleteTarget.ids[0])?.filename}</strong> from this
                  workspace. This action cannot be undone.
                </>
              ) : (
                <>
                  This will permanently delete {deleteTarget?.ids.length} files from this workspace.
                  This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      {/* Inline PDF preview — fills the right half (single pane, no multi-pane
          here). role is a generic label; the viewer's own header still offers
          Open-in-new-tab, zoom, and the close button. */}
      {previewNode && (
        <div
          ref={previewPanelRef}
          className="sticky top-[calc(var(--tabbar-h)+16px)] hidden min-w-0 flex-1 lg:block"
        >
          <EvidencePdfViewer
            file={previewNode}
            onClose={() => setPreviewFileId(null)}
            style={previewHeight ? { height: previewHeight } : undefined}
          />
        </div>
      )}
    </div>
  );
}
