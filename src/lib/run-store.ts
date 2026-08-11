// Live per-workspace run state, kept OUTSIDE the component tree so a run
// survives ReconcileRunner remounts (tab switches, workspace switches).
// The run() closure writes here; any (re)mounted runner subscribes and sees
// the same live state — thinking logs, plan stages, error, or finished
// report — as if it had never unmounted.
//
// Persistence stays localStorage-only by design (no DB): the store seeds
// itself from the per-workspace report key on first access, and every report
// written through setRunState is mirrored back to localStorage. In-memory
// state covers switches within the page; a page refresh still falls back to
// the last persisted report (the accepted limitation).

import type { ReconciliationReport } from '@/engine/reconcile';
import type { Task } from '@/components/ui/agent-plan';
import { reportStorageKey, LEGACY_REPORT_KEY } from '@/lib/report-storage';

export interface RunState {
  running: boolean;
  error: string;
  report: ReconciliationReport | null;
  planTasks: Task[] | null;
  thinkingOpen: boolean;
}

const EMPTY_STATE: RunState = {
  running: false,
  error: '',
  report: null,
  planTasks: null,
  thinkingOpen: false,
};

/** Stable snapshot for server rendering — the store is client-only. */
export const EMPTY_RUN_STATE: RunState = { ...EMPTY_STATE };

const states = new Map<string, RunState>();
const listeners = new Set<() => void>();

/** Seed a workspace's entry from localStorage (with legacy-key migration). */
function initFromStorage(kbId: string): RunState {
  const state: RunState = { ...EMPTY_STATE };
  if (typeof window === 'undefined') return state;
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
    if (saved) state.report = JSON.parse(saved);
  } catch {
    // Corrupt/missing storage — start empty, same as before.
  }
  return state;
}

export function getRunState(kbId: string): RunState {
  let state = states.get(kbId);
  if (!state) {
    state = initFromStorage(kbId);
    states.set(kbId, state);
  }
  return state;
}

export function setRunState(
  kbId: string,
  updater: (prev: RunState) => RunState
): void {
  const prev = getRunState(kbId);
  const next = updater(prev);
  states.set(kbId, next);
  // Mirror completed reports back to localStorage (fast paint on refresh).
  if (next.report && next.report !== prev.report) {
    try {
      localStorage.setItem(reportStorageKey(kbId), JSON.stringify(next.report));
    } catch {
      // Storage full/blocked — the in-memory state still has the report.
    }
  }
  for (const fn of listeners) fn();
}

export function subscribeRunState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
