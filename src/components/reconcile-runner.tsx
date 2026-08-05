'use client';
import { useEffect, useRef, useState } from 'react';
import { Card } from './ui/card';
import { ReportViewer } from './report-viewer';
import { ReconciliationReport } from '@/engine/reconcile';
import { reportStorageKey, LEGACY_REPORT_KEY } from '@/lib/report-storage';
import type { ReconcileRequest } from './dashboard';
import AgentPlan, { Task } from './ui/agent-plan';

// Deterministic reconcile pipeline stages. The LLM only emits raw reasoning
// text — WE define the stages; the streamed thinking is attached to the
// active "LLM reasoning" subtask. Retrieval completes server-side before the
// stream starts, so it renders as done from the first frame.
const RECONCILE_SYNONYMS = [
  'Reconciling',
  'Cross-checking',
  'Comparing',
  'Matching',
  'Verifying',
  'Balancing',
  'Aligning',
  'Settling',
];

function buildPlanTasks(thinkingText: string): Task[] {
  return [
    {
      id: 'retrieval',
      title: 'Document Retrieval',
      description: 'Fetch metadata and segments for all selected files',
      status: 'completed',
      priority: 'high',
      level: 0,
      dependencies: [],
      subtasks: [
        { id: 'retrieval-1', title: 'Fetch file metadata', description: '', status: 'completed', priority: 'high' },
        { id: 'retrieval-2', title: 'Fetch document segments', description: '', status: 'completed', priority: 'high' },
      ],
    },
    {
      id: 'reasoning',
      title: 'Reconciliation',
      description: 'Model cross-checks documents, derives figures, and flags discrepancies',
      status: 'in-progress',
      priority: 'high',
      level: 0,
      dependencies: [],
      subtasks: [
        {
          id: 'reasoning-1',
          title: 'Analyzing documents',
          description: thinkingText || 'Waiting for model output…',
          status: 'in-progress',
          priority: 'high',
        },
        { id: 'reasoning-2', title: 'Comparing line items across documents', description: '', status: 'pending', priority: 'high' },
        { id: 'reasoning-3', title: 'Computing billed vs payable totals', description: '', status: 'pending', priority: 'high' },
        { id: 'reasoning-4', title: 'Flagging discrepancies', description: '', status: 'pending', priority: 'medium' },
        { id: 'reasoning-5', title: 'Summarizing findings', description: '', status: 'pending', priority: 'medium' },
        { id: 'reasoning-6', title: 'Preparing report', description: '', status: 'pending', priority: 'medium' },
      ],
    },
    {
      id: 'report',
      title: 'Report Generation',
      description: 'Validate output and persist the reconciliation report',
      status: 'pending',
      priority: 'medium',
      level: 0,
      dependencies: [],
      subtasks: [
        { id: 'report-1', title: 'Parsing model output', description: '', status: 'pending', priority: 'medium' },
        { id: 'report-2', title: 'Saving report', description: '', status: 'pending', priority: 'medium' },
      ],
    },
  ];
}

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
  const [planTasks, setPlanTasks] = useState<Task[] | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [synonymIdx, setSynonymIdx] = useState(0);
  const lastNonce = useRef(0);

  // Rotate the header synonym while a run is in progress
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSynonymIdx(i => (i + 1) % RECONCILE_SYNONYMS.length);
    }, 3000);
    return () => clearInterval(id);
  }, [running]);

  const run = async (fileIds: string[], requestedModelId: string) => {
    if (fileIds.length < 2) {
      setError('Need at least 2 parsed documents to reconcile.');
      return;
    }
    setRunning(true);
    setError('');
    setReport(null);
    setPlanTasks(buildPlanTasks(''));
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
          let msg: { type?: string; text?: string; stage?: string; chars?: number; report?: ReconciliationReport; message?: string };
          try {
            msg = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (msg.type === 'stage' && msg.stage) {
            // Light up the matching subtask: mark all subtasks up to and
            // including `stage` as completed except the stage itself, which
            // stays in-progress until the next stage fires (or the report lands)
            setPlanTasks(prev => {
              if (!prev) return prev;
              return prev.map(t => {
                if (t.id !== 'reasoning') return t;
                const targetIdx = t.subtasks.findIndex(s => s.id === msg.stage);
                if (targetIdx === -1) return t;
                return {
                  ...t,
                  subtasks: t.subtasks.map((s, i) => i < targetIdx
                    ? { ...s, status: 'completed' }
                    : i === targetIdx
                      ? { ...s, status: 'in-progress' }
                      : s),
                };
              });
            });
          } else if (msg.type === 'thinking' && msg.text) {
            // Append the streamed text to the subtask that is CURRENTLY
            // in-progress (follows the stage events), not always the first
            // one. Do NOT rebuild the plan, or per-step stage progress
            // would be wiped on every chunk.
            setPlanTasks(prev => {
              if (!prev) return prev;
              const reason = prev.find(t => t.id === 'reasoning');
              if (!reason) return prev;
              const activeIdx = reason.subtasks.findIndex(s => s.status === 'in-progress');
              const targetIdx = activeIdx === -1 ? 0 : activeIdx;
              const old = reason.subtasks[targetIdx]?.description || '';
              const next = old === 'Waiting for model output…' ? msg.text! : old + msg.text!;
              return prev.map(t => t.id !== 'reasoning' ? t : {
                ...t,
                subtasks: t.subtasks.map((s, i) => i === targetIdx
                  ? { ...s, description: next.slice(-8000) }
                  : s),
              });
            });
          } else if (msg.type === 'progress' && typeof msg.chars === 'number') {
            // Live character count while the model writes the report —
            // keeps the final "Preparing report" stage visibly moving
            setPlanTasks(prev => {
              if (!prev) return prev;
              return prev.map(t => t.id !== 'reasoning' ? t : {
                ...t,
                subtasks: t.subtasks.map((s, i) => i === 5
                  ? { ...s, description: `Writing report JSON… ${msg.chars!.toLocaleString()} chars` }
                  : s),
              });
            });
          } else if (msg.type === 'report' && msg.report) {
            setReport(msg.report);
            setPlanTasks(prev => {
              if (!prev) return prev;
              return prev.map(t => t.id === 'reasoning' || t.id === 'report'
                ? { ...t, status: 'completed', subtasks: t.subtasks.map(s => ({ ...s, status: 'completed' })) }
                : t);
            });
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

      {/* Live reconcile pipeline (streamed during reconciliation) */}
      {(running || planTasks) && (
        <details className="group mb-8" open={thinkingOpen} onToggle={e => setThinkingOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-h3 mb-2 flex items-center gap-2 select-none">
            <span className="text-xs text-secondary transition-transform group-open:rotate-90">▶</span>
            {running ? (
              <span className="inline-flex items-center gap-1" aria-live="polite">
                <span key={synonymIdx} className="animate-fade-up inline-block">
                  {RECONCILE_SYNONYMS[synonymIdx]}<span className="animate-pulse">…</span>
                </span>
              </span>
            ) : (
              'Reconcile Progress'
            )}
            {running && (
              <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" aria-label="working" />
            )}
          </summary>
          {planTasks && (
            <AgentPlan tasks={planTasks} defaultExpanded={['reasoning']} />
          )}
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
