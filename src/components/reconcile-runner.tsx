'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import { ModelSelector } from './model-selector';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ReportViewer } from './report-viewer';
import { ReconciliationReport } from '@/engine/reconcile';
import { reportStorageKey, LEGACY_REPORT_KEY } from '@/lib/report-storage';

interface FileItem {
  id: string;
  filename: string;
}

export function ReconcileRunner({ kbId }: { kbId: string }) {
  const { fetchDocAI } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modelId, setModelId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ReconciliationReport | null>(null);

  useEffect(() => {
    // Workspace switch: reset report + file selection for the new workspace
    setReport(null);
    setSelectedIds(new Set());

    fetchDocAI(`/files?kb_id=${kbId}`)
      .then(r => r.json())
      .then(d => {
        const allFiles = d.files || d.items || [];
        // Only show parsed files in Reconcile tab
        let parsedIds: string[] = [];
        try {
          parsedIds = JSON.parse(localStorage.getItem('reconai-parsed-files') || '[]');
        } catch {}
        const parsedSet = new Set(parsedIds);
        setFiles(allFiles.filter((f: FileItem) => parsedSet.has(f.id)));
      })
      .catch(() => {});
  }, [kbId]);

  useEffect(() => {
    try {
      // Per-workspace report: load this workspace's report (with legacy migration)
      const key = reportStorageKey(kbId);
      let saved = localStorage.getItem(key);
      if (saved === null) {
        // First run after upgrade: adopt the old global report if present, then drop it
        saved = localStorage.getItem(LEGACY_REPORT_KEY);
        if (saved !== null) {
          localStorage.setItem(key, saved);
          localStorage.removeItem(LEGACY_REPORT_KEY);
        }
      }
      if (saved) setReport(JSON.parse(saved));
    } catch {}
  }, [kbId]);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const ready = selectedIds.size >= 2 && modelId;

  const run = async () => {
    if (!ready) return;
    setRunning(true);
    setError('');

    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: Array.from(selectedIds),
          modelId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Reconciliation failed');
      }

      const data = await res.json();
      const r = data.report;
      setReport(r);
      localStorage.setItem(reportStorageKey(kbId), JSON.stringify(r));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <h2 className="text-h3 mb-4">Reconcile Documents</h2>
      
      <Card className="p-6 mb-6">
        <p className="text-sm text-secondary mb-4">
          Select documents to reconcile. The AI will classify each document (PO/Receipt/Invoice) and group related ones automatically.
        </p>
        
        <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
          {files.length === 0 ? (
            <p className="text-sm text-secondary">No files parsed yet. Upload and parse files first.</p>
          ) : (
            files.map(f => (
              <label 
                key={f.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => toggle(f.id)}
                  className="w-4 h-4 rounded border-border cursor-pointer"
                />
                <span className="text-sm">{f.filename}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-end gap-4">
          <div>
            <label className="text-sm font-medium block mb-2">AI Model</label>
            <ModelSelector value={modelId} onChange={setModelId} />
          </div>
          <Button 
            onClick={run} 
            disabled={!ready || running}
          >
            {running ? 'Reconciling...' : `Reconcile ${selectedIds.size} Documents`}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive mt-4">{error}</p>
        )}
      </Card>

      {report && <ReportViewer report={report} />}
    </div>
  );
}
