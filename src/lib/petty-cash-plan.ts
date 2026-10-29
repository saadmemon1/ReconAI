// The plan the Report tab shows while the petty-cash matcher runs from the Files tab's Reconcile button.
// The server does not stream progress (b_match.py + c_report.py take ~8 s), so the runner advances the
// stage on a timer and completes the last step when the response lands. Pure, so it is unit-tested.
import type { Task } from '@/components/ui/agent-plan';

export const PETTY_CASH_STEPS = [
  { id: 'petty-read', title: 'Reading the statement, receipts and ledger' },
  { id: 'petty-qr', title: 'Decoding the invoices’ ZATCA QR codes' },
  { id: 'petty-match', title: 'Matching receipts to card rows' },
  { id: 'petty-tieout', title: 'Tying out the ledger' },
  { id: 'petty-report', title: 'Building the report' },
] as const;

/**
 * `stage` is the index of the step in progress (0-based); a stage past the last step means everything is
 * done. `failed` marks the current step as failed instead of in progress. The first step names the model
 * honestly: the receipt reading happened once in the healer run and is reused, never re-run from the app.
 */
export function pettyCashPlan(modelLabel: string, stage: number, failed = false): Task[] {
  const done = stage >= PETTY_CASH_STEPS.length;
  const reading = modelLabel ? `Receipt reading: ${modelLabel}, cached from the healer run` : 'Receipt reading: cached from the healer run';
  return [
    {
      id: 'petty',
      title: 'Petty-cash reconciliation',
      description: 'Statement rows matched to receipts and tied to the ledger from the parsed documents',
      status: done ? 'completed' : 'in-progress',
      priority: 'high',
      level: 0,
      dependencies: [],
      subtasks: PETTY_CASH_STEPS.map((step, i) => ({
        id: step.id,
        // The model is in the first step's title so the "cached" note is visible without expanding the step.
        title: i === 0 && modelLabel ? `${step.title} · ${modelLabel}, cached` : step.title,
        description: i === 0 ? reading : '',
        status: i < stage ? 'completed' : i === stage ? (failed ? 'failed' : 'in-progress') : 'pending',
        priority: 'high',
      })),
    },
  ];
}
