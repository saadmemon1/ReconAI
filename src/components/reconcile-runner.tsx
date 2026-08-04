'use client';
import { useEffect, useRef, useState } from 'react';
import { Card } from './ui/card';
import { ReportViewer } from './report-viewer';
import { ReconciliationReport } from '@/engine/reconcile';
import { reportStorageKey, LEGACY_REPORT_KEY } from '@/lib/report-storage';
import type { ReconcileRequest } from './dashboard';

export function ReconcileRunner({ kbId, reconcileRequest }: {
  kbId: string;
  reconcileRequest: ReconcileRequest | null;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  // Load this workspace's persisted report (with legacy migration).
  // The runner is remounted per workspace via key={kbId}, so the initializer
  // runs fresh on every workspace switch — no effect needed.
  const [report, setReport] = useState<ReconciliationReport | null>(() => {
    try {
      const key = reportStorageKey(kbId);
      let saved = localStorage.getItem(key);
      if (saved === null) {
        saved = localStorage.getItem(LEGACY_REPORT_KEY);
        if (saved !== null) {
          localStorage.setItem(key, saved);
          localStorage.removeItem(LEGACY_REPORT_KEY);
        }
      }
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [thinking, setThinking] = useState<string[]>([]);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const lastNonce = useRef(0);

  // Auto-scroll the live thinking log
  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinking]);

  const run = async (fileIds: string[], requestedModelId: string) => {
    if (fileIds.length < 2) {
      setError('Need at least 2 parsed documents to reconcile.');
      return;
    }
    setRunning(true);
    setError('');
    setReport(null);
    setThinking([]);
    setThinkingOpen(true); // auto-open while streaming

    try {
      // Model comes from the Files tab selector; fall back to DeepSeek V4 Flash
      // (LM Studio support is dormant — see reconcile route's lmstudio branch)
      let modelId = requestedModelId;
      if (!modelId) modelId = 'deepseek/deepseek-v4-flash';

      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds, modelId }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
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
          let msg: { type?: string; text?: string; report?: ReconciliationReport; message?: string };
          try {
            msg = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (msg.type === 'thinking' && msg.text) {
            setThinking(prev => [...prev, msg.text!]);
          } else if (msg.type === 'report' && msg.report) {
            setReport(msg.report);
            localStorage.setItem(reportStorageKey(kbId), JSON.stringify(msg.report));
          } else if (msg.type === 'error') {
            throw new Error(msg.message || 'Reconciliation failed');
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setRunning(false);
      setThinkingOpen(false); // collapse when done — report starts at KPIs
    }
  };

  // Auto-run when a reconcile request arrives from the Files tab
  useEffect(() => {
    if (!reconcileRequest || reconcileRequest.nonce === lastNonce.current) return;
    lastNonce.current = reconcileRequest.nonce;
    run(reconcileRequest.fileIds, reconcileRequest.modelId);
  }, [reconcileRequest]);

  return (
    <div>
      <h2 className="text-h3 mb-4">Report</h2>

      {/* Live LLM thinking log (streamed during reconciliation) */}
      {(running || thinking.length > 0) && (
        <details className="group mb-8" open={thinkingOpen} onToggle={e => setThinkingOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-h3 mb-2 flex items-center gap-2 select-none">
            <span className="text-xs text-secondary transition-transform group-open:rotate-90">▶</span>
            LLM Thinking
            {running && (
              <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" aria-label="thinking" />
            )}
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

      {error && (
        <Card className="p-6 mb-6">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {report ? (
        <ReportViewer report={report} />
      ) : (
        !running && !error && (
          <Card className="p-6">
            <p className="text-sm text-secondary">
              No report yet. Select 2+ parsed files in the Files tab and click{" "}
              <strong>Reconcile N Documents</strong> to generate a report here.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
