// Which workflow and which report section are showing, shared between the sidebar (which picks them) and the report (which
// renders them and says which sections exist). Kept outside the component tree, like run-store, so the two halves of the
// layout can read and write it without threading props through the dashboard.
import { useSyncExternalStore } from 'react';

export type WorkflowKey = 'documents' | 'petty_cash';
export type ReportSection = 'overview' | 'review' | 'findings' | 'payments' | 'reconciliation' | 'vat' | 'transactions' | 'signoff';

export interface ReportNav {
  workflow: WorkflowKey;
  /** The workspace has a petty-cash report to switch to. */
  pettyCash: boolean;
  /** The open report is laid out as sections (config.json display.polished); the sidebar lists them only then. */
  sectioned: boolean;
  section: ReportSection;
  counts: Partial<Record<ReportSection, number>>;
  /** A section the report has no data for (e.g. payments before card numbers were read) is left out of the sidebar. */
  sections: ReportSection[];
}

export const INITIAL_NAV: ReportNav = { workflow: 'documents', pettyCash: false, sectioned: false, section: 'overview', counts: {}, sections: [] };

let nav: ReportNav = INITIAL_NAV;
const listeners = new Set<() => void>();

export function getReportNav(): ReportNav {
  return nav;
}

export function setReportNav(patch: Partial<ReportNav>): void {
  const next = { ...nav, ...patch };
  // counts and sections arrive as fresh objects on every report render; compare by value so an unchanged patch notifies nobody
  if ((Object.keys(patch) as Array<keyof ReportNav>).every(k => JSON.stringify(next[k]) === JSON.stringify(nav[k]))) return;
  nav = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReportNav(): ReportNav {
  return useSyncExternalStore(subscribe, getReportNav, () => INITIAL_NAV);
}
