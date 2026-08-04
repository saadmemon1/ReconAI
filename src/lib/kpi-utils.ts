export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

/** Match Rate: >95% green, 85-95% yellow, <85% red */
export function matchRateTone(rate: number): Tone {
  if (rate >= 95) return 'good';
  if (rate >= 85) return 'warn';
  return 'bad';
}

/** Overbilling: any amount is red (money lost), 0 is green */
export function overbillingTone(amount: number): Tone {
  return amount > 0 ? 'bad' : 'good';
}

/** Unsupported charges: any amount is red (fraud risk), 0 is green */
export function unsupportedChargesTone(amount: number): Tone {
  return amount > 0 ? 'bad' : 'good';
}

/** Invoice vs PO difference as a percentage. null when PO is 0. */
export function invoiceVsPODiff(invoice: number, po: number): number | null {
  if (!po) return null;
  return ((invoice - po) / po) * 100;
}

/** Invoice vs PO: within 5% green, 5-10% yellow, >10% red */
export function invoiceVsPOTone(diffPercent: number | null): Tone {
  if (diffPercent === null) return 'neutral';
  if (Math.abs(diffPercent) <= 5) return 'good';
  if (Math.abs(diffPercent) <= 10) return 'warn';
  return 'bad';
}

/** Total issues: any critical is red, any high is yellow, else green */
export function totalIssuesTone(critical: number, high: number): Tone {
  if (critical > 0) return 'bad';
  if (high > 0) return 'warn';
  return 'good';
}

/** Recommended payable = billed − overbilling − unsupported charges (never negative) */
export function recommendedPayable(billed: number, overbilling: number, unsupported: number): number {
  return Math.max(0, billed - overbilling - unsupported);
}

/** KPI names known to the engine (must match validateReport's list) */
export const KPI_KEYS = [
  'totalPO', 'totalReceipt', 'totalInvoice',
  'matchedLineItems', 'mismatchedLineItems', 'missingLineItems', 'extraLineItems',
  'matchRate', 'overbillingAmount', 'unsupportedCharges', 'evidenceGaps',
] as const;

function toFiniteNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sanitize LLM-produced KPIs for safe downstream use.
 * Only coerces types so the report renders cleanly:
 *  - strings → numbers ("1000" → 1000)
 *  - NaN/Infinity/undefined → 0
 * Values are otherwise preserved EXACTLY as produced — including negative
 * numbers (credit notes, discounts, refunds are legitimate in financial
 * documents and must not be tampered with).
 */
export function sanitizeKPIs(kpis: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};

  for (const key of KPI_KEYS) {
    out[key] = toFiniteNumber(kpis[key]);
  }

  return out;
}

/** Overbilling as a percentage of billed. null when billed is 0. */
export function overbilledPercent(overbilled: number, billed: number): number | null {
  if (!billed) return null;
  return (overbilled / billed) * 100;
}

