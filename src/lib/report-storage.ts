export const REPORT_KEY_PREFIX = 'reconai-last-report';
export const LEGACY_REPORT_KEY = 'reconai-last-report';

/**
 * Per-workspace localStorage key for reconciliation reports.
 * Reports are workspace-level artifacts: the user expects to see the report
 * they ran in THIS workspace, not a single global report shared across all.
 */
export function reportStorageKey(kbId: string): string {
  return `${REPORT_KEY_PREFIX}-${kbId}`;
}
