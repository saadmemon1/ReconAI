'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';
import { ModelSelector } from './model-selector';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ReportViewer } from './report-viewer';
import { ReconciliationReport } from '@/engine/reconcile';
import { reportStorageKey, LEGACY_REPORT_KEY } from '@/lib/report-storage';
import { isFileParsed, FileWithProcessing } from '@/lib/file-status';

interface FileItem extends FileWithProcessing {
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
  const [thinking, setThinking] = useState<string[]>([]);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const thinkingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Workspace switch: the component is remounted via key={kbId} in the
    // dashboard, which resets report + file selection naturally.

    // Only show parsed files in Reconcile tab (server-side status
    // from ?include=processing → processing.latest_parse_job.status === 'completed')
    fetchDocAI(`/files?kb_id=${kbId}&include=processing`)
      .then(r => r.json())
      .then(d => {
        const allFiles: FileItem[] = d.files || d.items || [];
        setFiles(allFiles.filter(isFileParsed));
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
    setReport(null);
    setThinking([]);
    setThinkingOpen(true); // auto-open while streaming

    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: Array.from(selectedIds),
          modelId,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        // Non-streaming error (validation/400): plain JSON
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || 'Reconciliation failed');
      }

      if (!contentType.includes('text/event-stream')) {
        // Legacy path: plain JSON response
        const data = await res.json();
        const r = data.report;
        if (!r) throw new Error('Reconciliation returned no report');
        setReport(r);
        localStorage.setItem(reportStorageKey(kbId), JSON.stringify(r));
        return;
      }

      // SSE stream: live LLM thinking logs, then the final report
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const line = evt.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let msg: any;
          try {
            msg = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (msg.type === 'thinking' && msg.text) {
            setThinking(prev => [...prev, msg.text]);
          } else if (msg.type === 'report' && msg.report) {
            setReport(msg.report);
            localStorage.setItem(reportStorageKey(kbId), JSON.stringify(msg.report));
          } else if (msg.type === 'error') {
            throw new Error(msg.message || 'Reconciliation failed');
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
      setThinkingOpen(false); // collapse when done — report starts at KPIs
    }
  };

  // Auto-scroll the live thinking log
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking]);

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

      {/* Live LLM thinking log (streamed during reconciliation) */}
      {(running || thinking.length > 0) && (
        <details className="group" open={thinkingOpen} onToggle={e => setThinkingOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-h3 mb-2 flex items-center gap-2 select-none">
            LLM Thinking
            {running && (
              <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" aria-label="thinking" />
            )}
            {!running && <span className="text-xs text-secondary font-normal">({thinking.length} chunks)</span>}
          </summary>
          <div
            ref={thinkingRef}
            className="bg-muted/50 rounded-lg p-4 max-h-72 overflow-y-auto font-mono text-xs text-secondary leading-relaxed whitespace-pre-wrap"
          >
            {thinking.length === 0 ? (
              <span className="italic">Waiting for model output…</span>
            ) : (
              thinking.map((chunk, i) => <span key={i}>{chunk}</span>)
            )}
          </div>
        </details>
      )}

      {report && <ReportViewer report={report} />}
    </div>
  );
}
