// Types for data/<client>/report.json (written by scripts/abujhd/c_report.py) and the pure helpers the
// petty-cash report components share. Nothing here touches the DOM.

import type { ReportSection } from './report-nav';

export type Box = [number, number, number, number]; // x0, y0, x1, y1 in the matcher's 0-1000 page space

// A statement row the matcher could not position on the page carries a null box and crop (a_refine.py sets both
// to None when the row has no y); the pane skips such boxes. Receipt citations always have a box.
export interface StatementCitation { page: number; box: Box | null; crop: string | null }
export interface ReceiptCitation { page: number; group_id: string; box: Box; crop: string }
export interface LedgerCitation { sheet: string; row: number; cell: string; code: string; date: string; amount: number | null; relation: string }

export interface StatementRow {
  ref: string;
  date: string;
  time: string | null;
  amount: number;
  merchant: string;
  kind: 'purchase' | 'atm' | 'load';
  /** The statement's own text when a display name replaced `merchant` (see applyDisplay). */
  merchant_raw?: string;
  orange: boolean;
  status: string;
  reason: string;
  receipt_ids: string[];
  citations: { statement: StatementCitation; receipts: ReceiptCitation[]; ledger: LedgerCitation | null };
  // Absent on reports built before the evidence-gated matcher.
  basis?: Basis;
  evidence?: EvidenceItem[];
  /** What the card paid (all linked payments) and what the linked invoice(s) say; difference = paid − invoiced, null when no total was read. */
  paid?: number | null;
  invoiced?: number | null;
  difference?: number | null;
  /** The difference was accepted by the rounding rule a person set (not matched, not decided case by case). */
  rounding_rule?: { max: number; applies: 'card_less' | 'either'; by: string | null; at: string | null } | null;
}

export interface ReceiptGroup {
  id: string;
  page: number;
  pages: number[];
  box: Box;
  crop: string | null;
  status: string;
  reason: string | null;
  merchant: string | null;
  date: string | null;
  total: number | null;
  amounts: number[];
  confidence: number | null;
  notes: string | null;
  refs: string[];
  review: Array<[string, number]>;
  citations: ReceiptCitation[];
  /** The masked card number printed on the slip (c_report._card); absent on reports built before it was read. */
  card?: { first6: string | null; last4: string } | null;
  // The evidence trail (b_match.py receipt_evidence): absent on reports built before the evidence-gated matcher.
  basis?: Basis;
  evidence?: EvidenceItem[];
  /** Where the total came from: a decoded QR code, a named person, the AI re-reading the page, an override with no author, or the AI read. */
  amount_source?: 'qr' | 'ai_qr' | 'human' | 'ai_check' | 'unattributed' | 'ai';
  /** Why the amount was withheld from matching (low AI confidence, or marked unreadable); the withheld amounts are kept for display. */
  unreadable?: string | null;
  withheld_amounts?: number[] | null;
  /** A payment verdict waiting for a person: proposed by the AI, or recorded with no author. Not applied to the figures. */
  proposal?: (Author & { status: string; reason: string | null }) | null;
  /** Who decided a CASH / OTHER_CARD / PART status. */
  decided_by?: Author | null;
  qr?: ZatcaQr | null;
  vat?: VatStatus;
  /** The VAT arithmetic on the parsed (or QR, or entered) total and VAT: VAT = total x 15/115 within a couple of halalas. */
  vat_check?: { status: 'ok' | 'zero' | 'mismatch' | 'missing'; total?: number; vat?: number; expected?: number; why?: string };
  /** The seller's VAT number: from the QR, printed on the invoice, or carried from the same vendor's other invoices (`from`, `via`). */
  /** A number printed beside a VAT-number label that is not valid as read: prefilled in the Edit form for a person to correct. */
  vat_no_candidate?: string | null;
  /** Who read the candidate off the page when it was not the parser (e.g. the AI re-reading the page): shown beside the prefilled number. */
  vat_no_candidate_by?: { by: string | null; reason: string | null } | null;
  /** The VAT-number label is printed but the parse holds no digits after it. */
  vat_no_dropped?: boolean;
  seller_vat?: { no: string | null; source: 'person' | 'qr' | 'parsed' | 'vendor' | 'vendor_ambiguous' | 'ambiguous' | null; from?: string[]; via?: string[]; read_as?: string; candidates?: string[] };
}

export interface Author { by: string | null; reason: string | null; at: string | null; proposed: boolean }
/** agreed: independent sources agree exactly; proposed: a person must accept; human: a named person decided; needs_evidence: something is missing. */
export type Basis = 'agreed' | 'rule' | 'proposed' | 'human' | 'needs_evidence';
/** machine: bank statement, decoded QR, ledger cell; rule: a matching rule over machine facts; ai: an AI read or proposal. */
export type Strength = 'machine' | 'rule' | 'human' | 'ai' | 'unattributed' | 'missing' | 'conflict';
export interface EvidenceItem { what: string; text: string; strength: Strength; reason?: string; receipt?: string }
export interface ZatcaQr {
  seller: string; vat_no: string; time: string; total: number | null; vat: number | null; page: number; box: number[];
  /** 1: tags 1-5 only. 2: e-invoicing phase 2, signed by the seller's device (tags 6-9). Absent on QR files decoded before they were read. */
  phase?: 1 | 2;
  /** Phase 2: the device's signature of the invoice hash verified, or could not be checked from the QR alone (never "invalid"). */
  signature?: 'verified' | 'not_checked' | null;
  signature_scheme?: string | null;
  /** The QR text was entered by a person from a phone scan, not decoded from the scan. */
  entered?: Author | null;
}
export interface VatStatus {
  status: 'reclaimable' | 'no_vat' | 'check' | 'not_verified' | 'excluded';
  amount: number | null;
  /** Where the VAT figure came from: a person's entry, the ZATCA QR code, or the parsed invoice. */
  source: 'person' | 'qr' | 'parsed' | 'ai_page' | null;
  seller_vat?: string | null;
  why: string;
  /** A page check of the QR code (overrides.json "vat"), with its author: a finding, never the verdict. */
  finding?: { text: string; by: string | null; reason: string | null; proposed: boolean };
}

export interface LedgerLine {
  code: string;
  date: string;
  text: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  month: string;
  row: number;
  cell: string;
  status: string | null;
}

interface Pair { statement: number; ledger: number; diff: number }

export interface PettyReport {
  meta: {
    client: string;
    month: string;
    month_label: string;
    built_at: string;
    sheet: string;
    files: Record<string, string>;
    page_images: { receipts: string[]; statement: string[] };
    /** config.json's optional display section, per workspace: absent, the report renders as built. */
    display?: ReportDisplay;
    /** What produced this report: input file hashes, the scripts' commit, the QR decoder, the confidence threshold. */
    audit?: {
      inputs: Record<string, string>; pipeline: string | null; qr_decoder: string | null; confidence_min: number | null;
      vat_tolerance?: number | null;
      /** Rules a person set in the app (overrides.json "rules"). */
      rules?: { rounding?: { max: number; applies: 'card_less' | 'either'; by?: string; at?: string } };
    };
  };
  kpis: {
    card_spend: number; purchase_count: number; atm_count: number; purchases_amount: number; evidenced_amount: number;
    rollup: number; open_gap: number; missing_count: number; missing_amount: number;
    /** Card closing minus ledger closing for the month; absent on reports built before it existed. */
    card_closing?: number | null; ledger_closing?: number | null; gap?: number | null; inquiry_count?: number;
  };
  counts: { rows: Record<string, number>; receipts: Record<string, number> };
  rows: StatementRow[];
  receipts: ReceiptGroup[];
  ledger: LedgerLine[];
  tieout: { loads_vs_topups: Pair; atm_vs_withdrawals: Pair; purchases_vs_rollup: Pair & { purchases_only: number; rollup_codes: string[] } };
  /** Decoded ZATCA codes no receipt could be tied to: listed, never dropped. */
  loose_qr?: Array<{ page: number; box: number[]; zatca: Omit<ZatcaQr, 'page' | 'box'> }>;
}

/** Per-workspace presentation: clean names for statement merchants (keyed by the statement text) and for receipts (keyed by
 *  receipt id), and the polished layout. */
export interface ReportDisplay { polished?: boolean; merchants?: Record<string, string>; receipts?: Record<string, string> }

/** The report with its display names applied; the statement text stays on `merchant_raw` for the tooltip. */
export function applyDisplay(report: PettyReport): PettyReport {
  const d = report.meta.display;
  if (!d?.merchants && !d?.receipts) return report;
  const m = d.merchants ?? {}, g = d.receipts ?? {};
  return {
    ...report,
    rows: report.rows.map(r => (Object.hasOwn(m, r.merchant) ? { ...r, merchant: m[r.merchant], merchant_raw: r.merchant } : r)),
    receipts: report.receipts.map(x => (Object.hasOwn(g, x.id) ? { ...x, merchant: g[x.id] } : x)),
  };
}

// ---------- status vocabulary: a word, a glyph and a tone; colour never carries the meaning alone ----------
export type Tone = 'ok' | 'bad' | 'review' | 'warn' | 'muted';
export const TONE_VAR: Record<Tone, string> = {
  ok: 'var(--status-ok)',
  bad: 'var(--status-bad)',
  review: 'var(--status-review)',
  warn: 'var(--status-warn)',
  muted: 'var(--muted-foreground)',
};
const STATUS: Record<string, { word: string; glyph: string; tone: Tone }> = {
  MATCHED: { word: 'Matched', glyph: '✓', tone: 'ok' },
  LINKED: { word: 'Linked', glyph: '✓', tone: 'ok' },
  TIED: { word: 'Tied to ledger', glyph: '✓', tone: 'ok' },
  MISSING_RECEIPT: { word: 'Missing receipt', glyph: '✕', tone: 'bad' },
  ORPHAN: { word: 'No card row', glyph: '✕', tone: 'bad' },
  REVIEW: { word: 'Needs a decision', glyph: '?', tone: 'review' },
  UNEXPLAINED: { word: 'Not in ledger', glyph: '!', tone: 'warn' },
  AMOUNT_MISMATCH: { word: 'Amounts differ', glyph: '!', tone: 'warn' },
  OTHER_MONTH: { word: 'Another month', glyph: '!', tone: 'warn' },
  ROLLUP: { word: 'Roll-up of card spend', glyph: '·', tone: 'muted' },
  NO_CARD_TXN: { word: 'No card transaction', glyph: '!', tone: 'warn' },
  DUPLICATE: { word: 'Duplicate copy', glyph: '=', tone: 'muted' },
  ATM_CASH: { word: 'ATM cash', glyph: '·', tone: 'muted' },
  INQUIRY: { word: 'Balance inquiry', glyph: '·', tone: 'muted' },
  CASH: { word: 'Paid in cash', glyph: '·', tone: 'muted' },
  OTHER_CARD: { word: 'Other card', glyph: '!', tone: 'warn' },
};
export function statusMeta(status: string | null): { word: string; glyph: string; tone: Tone } {
  return (status && Object.hasOwn(STATUS, status) && STATUS[status]) || { word: status ?? '—', glyph: '·', tone: 'muted' };
}

// ---------- filters, counts, sort ----------
export const ROW_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'MATCHED', label: 'Matched' },
  { key: 'REVIEW', label: 'Needs a decision' },
  { key: 'MISSING_RECEIPT', label: 'Missing receipt' },
  { key: 'AMOUNT_MISMATCH', label: 'Amounts differ' },
  { key: 'UNEXPLAINED', label: 'Not in ledger' },
  { key: 'ATM_CASH', label: 'ATM cash' },
  { key: 'TIED', label: 'Tied to ledger' },
];
export const RECEIPT_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'LINKED', label: 'Linked' },
  { key: 'REVIEW', label: 'Needs a decision' },
  { key: 'ORPHAN', label: 'No card row' },
  { key: 'CASH', label: 'Paid in cash' },
  { key: 'OTHER_CARD', label: 'Other card' },
  { key: 'OTHER_MONTH', label: 'Another month' },
  { key: 'DUPLICATE', label: 'Duplicate copy' },
];

/** Counts per status plus ALL; computed over the unfiltered list so chip counts never shrink. */
export function countByStatus(items: Array<{ status: string }>): Record<string, number> {
  const out: Record<string, number> = { ALL: items.length };
  for (const it of items) out[it.status] = (out[it.status] ?? 0) + 1;
  return out;
}

export function filterRows(rows: StatementRow[], status: string, query: string): StatementRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    r =>
      (status === 'ALL' || r.status === status) &&
      (!q || r.merchant.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q) || r.amount.toFixed(2).includes(q))
  );
}

export function filterReceipts(groups: ReceiptGroup[], status: string): ReceiptGroup[] {
  return status === 'ALL' ? groups : groups.filter(g => g.status === status);
}

export type SortKey = 'date' | 'amount';
export function sortRows(rows: StatementRow[], key: SortKey, dir: 'asc' | 'desc'): StatementRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const d = key === 'amount' ? a.amount - b.amount : (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''));
    return d * sign;
  });
}

// ---------- formatting and geometry ----------
export function money(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}
export function pct(num: number, den: number): string {
  return den ? `${Math.round((num / den) * 100)}%` : '0%';
}
/** A 0-1000 box as percentage offsets inside its page element. */
export function boxStyle([x0, y0, x1, y1]: Box): { left: string; top: string; width: string; height: string } {
  return { left: `${x0 / 10}%`, top: `${y0 / 10}%`, width: `${(x1 - x0) / 10}%`, height: `${(y1 - y0) / 10}%` };
}
export function imageUrl(kbId: string, path: string): string {
  return `/api/petty-cash/${kbId}/${path}`;
}

/** Accounting style: negatives in parentheses, as on a printed reconciliation. */
export function acct(n: number): string {
  return n < 0 ? `(${money(-n)})` : money(n);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09-07" → "7 Sep 2026", the same in every browser (Intl writes "Sept" in some). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** "2026-09" → "30 Sep 2026". */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------- the reconciliation statement: card closing vs ledger closing, item by item ----------
// gap = (card opening - ledger opening) + (card loads - ledger debits) + (ledger credits - card spend), and the ledger credits split
// into the roll-up plus entries outside it. The roll-up's excess over card spend is explained by receipts booked in it that never
// touched the card (cash beyond the ATM cash, other cards); whatever is left is unreconciled. Openings are derived from closings
// and the month's movements, so the items always add to the gap.

export type ReconBasis = 'documents' | 'review' | 'open';
/** Where a finding or a reconciling item is fixed: the report section, and for the transactions page which table and filter. */
export interface Go { label: string; section: ReportSection; tab?: 'transactions' | 'receipts' | 'ledger'; filter?: string }
export interface ReconItem {
  key: 'opening' | 'money_in' | 'other_credits' | 'other_card' | 'unpaid' | 'cash' | 'no_receipt' | 'differences';
  label: string; detail: string; amount: number; basis: ReconBasis;
  /** One plain sentence: what this line is, in words a non-accountant reads. */
  plain: string;
  /** done: nothing to do; action: someone has to act on it. */
  state: 'done' | 'action';
  go?: Go;
}
export interface Reconciliation {
  cardClosing: number; ledgerClosing: number; difference: number;
  items: ReconItem[]; explained: number; unreconciled: number;
  cardOpening: number; ledgerOpening: number; cardIn: number; ledgerIn: number; cardOut: number;
  rollup: number; rollupCodes: string[]; otherCredits: LedgerLine[];
  atmCash: number; cash: { count: number; amount: number }; otherCard: { count: number; amount: number };
  /** Receipts with no verdict yet (REVIEW or ORPHAN): while any remain, the cash and other-card figures may be incomplete. */
  undecided: number;
}

/** A receipt's amount: its read total, else its first total candidate (a reviewer's corrected total lands there). */
export function receiptAmount(g: ReceiptGroup): number | null {
  return g.total ?? g.amounts[0] ?? null;
}

const cents = (n: number) => Math.round(n * 100);
const sum = (ns: number[]) => ns.reduce((a, b) => a + cents(b), 0);

/** Net of what the invoices say minus what the card paid, once per payment (a split payment's rows share their receipts). */
function invoiceOverCard(report: PettyReport): { cents: number; count: number; byRule: number } {
  const seen = new Set<string>();
  let total = 0, count = 0, byRule = 0;
  for (const r of report.rows) {
    if (r.kind !== 'purchase' || !r.receipt_ids.length || r.difference == null || r.difference === 0) continue;
    const key = [...r.receipt_ids].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    total -= cents(r.difference);
    count += 1;
    if (r.rounding_rule) byRule += 1;
  }
  return { cents: total, count, byRule };
}

/** Null for reports built before card and ledger closings were recorded. */
export function reconcile(report: PettyReport): Reconciliation | null {
  const { card_closing: cardClose, ledger_closing: ledgerClose } = report.kpis;
  if (cardClose == null || ledgerClose == null) return null;
  const rows = report.rows;
  const lines = report.ledger.filter(l => l.month === report.meta.month);
  const rollupCodes = report.tieout.purchases_vs_rollup.rollup_codes;
  const inRollup = (l: LedgerLine) => rollupCodes.includes(l.code);
  const byStatus = (s: string) => report.receipts.filter(g => g.status === s);

  const cardIn = sum(rows.filter(r => r.kind === 'load').map(r => r.amount));
  const cardOut = sum(rows.filter(r => r.kind !== 'load').map(r => r.amount));
  const ledgerIn = sum(lines.map(l => l.debit ?? 0));
  const ledgerOut = sum(lines.map(l => l.credit ?? 0));
  const rollup = sum(lines.filter(inRollup).map(l => l.credit ?? 0));
  const otherCredits = lines.filter(l => !inRollup(l) && (l.credit ?? 0) !== 0);
  const cardOpen = cents(cardClose) - cardIn + cardOut;
  const ledgerOpen = cents(ledgerClose) - ledgerIn + ledgerOut;
  const atm = sum(rows.filter(r => r.status === 'ATM_CASH').map(r => r.amount));
  const cash = byStatus('CASH'), other = byStatus('OTHER_CARD');
  const cashAmt = sum(cash.map(g => receiptAmount(g) ?? 0)), otherAmt = sum(other.map(g => receiptAmount(g) ?? 0));
  const diff = cents(cardClose) - cents(ledgerClose);

  const unpaid = byStatus('ORPHAN');
  const unpaidAmt = sum(unpaid.map(g => receiptAmount(g) ?? 0));
  const noReceipt = rows.filter(r => r.status === 'MISSING_RECEIPT');
  const noReceiptAmt = sum(noReceipt.map(r => r.amount));
  const over = invoiceOverCard(report);
  // Each line is something the ledger booked that the card did not pay (adds to the gap) or the card paid that the ledger did not book
  // (takes from it). The words say which, so nobody has to read a sign.
  const items: ReconItem[] = [
    { key: 'opening', label: 'Starting balances differ', detail: `card ${money(cardOpen / 100)}, ledger ${money(ledgerOpen / 100)}`, amount: cardOpen - ledgerOpen, basis: 'documents',
      plain: 'The card and the ledger started the month a little apart.', state: 'done' },
    { key: 'money_in', label: 'Money loaded onto the card', detail: `${money(cardIn / 100)} loaded, ${money(ledgerIn / 100)} booked`, amount: cardIn - ledgerIn, basis: 'documents',
      plain: cardIn === ledgerIn ? 'Every top-up on the card is booked in the ledger.' : 'Top-ups on the card and in the ledger do not agree.', state: cardIn === ledgerIn ? 'done' : 'action',
      go: { label: 'See the top-ups', section: 'transactions', tab: 'transactions', filter: 'TIED' } },
    { key: 'other_card', label: 'Paid with someone else\u2019s card', detail: `${other.length} receipts`, amount: otherAmt, basis: 'review',
      plain: 'Booked as petty cash, but another card paid. The card holder may need paying back.', state: 'action', go: { label: 'See the payments', section: 'payments' } },
    { key: 'unpaid', label: 'Receipts the card didn\u2019t pay', detail: `${unpaid.length} receipts`, amount: unpaidAmt, basis: 'review',
      plain: 'Booked, but not on the card and no sign of cash or another card. Ask how each was paid.', state: 'action', go: { label: 'Review them', section: 'review' } },
    { key: 'cash', label: 'Cash taken out at ATMs', detail: `${money(atm / 100)} withdrawn, ${cash.length} cash receipts for ${money(cashAmt / 100)}`, amount: cashAmt - atm, basis: 'review',
      plain: atm > cashAmt ? `Cash left the card at ATMs; receipts show ${money(cashAmt / 100)} of it spent. The rest needs receipts or counting.` : 'Cash receipts are covered by ATM withdrawals.',
      state: atm > cashAmt ? 'action' : 'done', go: { label: 'See the cash', section: 'payments' } },
    { key: 'no_receipt', label: 'Card payments with no receipt', detail: `${noReceipt.length} payments`, amount: -noReceiptAmt, basis: 'documents',
      plain: 'The card paid, but no receipt was submitted, so the ledger has nothing for them.', state: noReceipt.length ? 'action' : 'done',
      go: { label: 'Find the receipts', section: 'transactions', tab: 'transactions', filter: 'MISSING_RECEIPT' } },
    { key: 'differences', label: 'Invoices a little above the card payment', detail: `${over.count} payments${over.byRule ? `, ${over.byRule} accepted by your rounding rule` : ''}`,
      amount: over.cents, basis: 'documents',
      plain: over.count - over.byRule
        ? `Shops rounding down the halalas, mostly. ${over.count - over.byRule} still need a decision.`
        : 'Shops rounding down the halalas; all accepted by your rounding rule.',
      state: over.count - over.byRule ? 'action' : 'done', go: { label: 'Decide the rest', section: 'review' } },
    { key: 'other_credits', label: 'Ledger entries with no receipt', detail: otherCredits.map(l => `${l.code} ${money(l.credit)}`).join(' · ') || 'none', amount: ledgerOut - rollup, basis: 'documents',
      plain: 'Booked in the ledger outside the month\u2019s total, with no receipt or card payment.', state: otherCredits.length ? 'action' : 'done',
      go: { label: 'See the ledger', section: 'transactions', tab: 'ledger' } },
  ];
  const explained = items.reduce((a, i) => a + i.amount, 0);
  return {
    cardClosing: cardClose, ledgerClosing: ledgerClose, difference: diff / 100,
    items: items.map(i => ({ ...i, amount: i.amount / 100 })), explained: explained / 100, unreconciled: (diff - explained) / 100,
    cardOpening: cardOpen / 100, ledgerOpening: ledgerOpen / 100, cardIn: cardIn / 100, ledgerIn: ledgerIn / 100, cardOut: cardOut / 100,
    rollup: rollup / 100, rollupCodes, otherCredits,
    atmCash: atm / 100, cash: { count: cash.length, amount: cashAmt / 100 }, otherCard: { count: other.length, amount: otherAmt / 100 },
    undecided: byStatus('REVIEW').length + byStatus('ORPHAN').length,
  };
}

// ---------- findings: what the month's check found, ranked by risk ----------
// Severity is by kind, not by amount: money that left the books' sight (cash with no known source, spend on other cards) is high;
// things that may double-count or hide detail are medium; small differences are low. The unexplained remainder scales with its
// share of card spend.

export type Severity = 'high' | 'medium' | 'low';
/** One line of evidence under a finding; `select` opens its sources (statement row, receipt page, ledger cell) in the evidence pane. */
export interface Evidence { label: string; amount: number | null; note?: string; date?: string; select?: Selection; explain?: string }
export interface Finding { key: string; severity: Severity; title: string; amount: number | null; why: string; action: string; evidence: Evidence[]; go?: Go }

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
/** Reviewed receipts lead with the reviewer's words (they name the shop; the extracted merchant is sometimes the buyer or a heading). */
const receiptEvidence = (gs: ReceiptGroup[], reviewed = false): Evidence[] =>
  gs.map(g => ({
    ...(reviewed && g.reason
      ? { label: `p${g.page} · ${g.reason}`, note: g.merchant ?? undefined }
      : { label: `${g.merchant ?? g.id} · p${g.page}`, note: g.reason ?? undefined }),
    amount: receiptAmount(g), select: { kind: 'receipt', id: g.id, source: 'receipt' },
  }));
const ledgerEvidence = (lines: LedgerLine[]): Evidence[] =>
  lines.map(l => ({ label: `${l.code} · ${l.cell}`, amount: l.credit ?? l.debit, note: l.text, select: { kind: 'ledger', code: l.code, source: 'ledger' } }));

export function findings(report: PettyReport, rec: Reconciliation): Finding[] {
  const out: Finding[] = [];
  const byStatus = (s: string) => report.receipts.filter(g => g.status === s);
  const codes = rec.rollupCodes.join(', ');
  const item = (k: ReconItem['key']) => rec.items.find(i => i.key === k);

  const unpaid = byStatus('ORPHAN');
  if (unpaid.length) out.push({
    key: 'unpaid', severity: 'high', title: `${unpaid.length} receipts the card didn\u2019t pay`, amount: sum(unpaid.map(g => receiptAmount(g) ?? 0)) / 100,
    why: 'They are in the receipt pack, but not on the card statement, and nothing on them says cash or another card.',
    action: 'Ask the card holder how each was paid, then mark it cash or another card in the review queue.',
    evidence: receiptEvidence(unpaid), go: item('unpaid')?.go,
  });

  const cashGap = (cents(rec.cash.amount) - cents(rec.atmCash)) / 100;
  const atmEvidence: Evidence[] = report.rows.filter(r => r.status === 'ATM_CASH')
    .map(r => ({ date: r.date, label: 'ATM withdrawal', amount: r.amount, note: r.merchant, select: { kind: 'row', ref: r.ref, source: 'statement' } }));
  if (cashGap > 0) out.push({
    key: 'cash', severity: 'high', title: 'More cash spent than was withdrawn', amount: cashGap,
    why: `Cash receipts total ${money(rec.cash.amount)} but only ${money(rec.atmCash)} was taken out at ATMs. The rest came from somewhere the books don\u2019t show.`,
    action: 'Ask the card holder where the cash came from, then book it or pay them back.',
    evidence: [...atmEvidence, ...receiptEvidence(byStatus('CASH'), true)], go: { label: 'See the cash', section: 'payments' },
  });
  if (cashGap < 0) out.push({
    key: 'cash', severity: 'medium', title: 'ATM cash with no receipt', amount: -cashGap,
    why: `${money(rec.atmCash)} was taken out at ATMs; cash receipts show ${money(rec.cash.amount)} of it spent.${unpaid.length ? ' Some of the receipts the card didn\u2019t pay may have been paid with this cash.' : ''}`,
    action: 'Find the cash receipts, or count the cash still on hand.',
    evidence: [...atmEvidence, ...receiptEvidence(byStatus('CASH'), true)], go: { label: 'See the cash', section: 'payments' },
  });

  if (rec.otherCard.amount) out.push({
    key: 'other_card', severity: 'high', title: `${rec.otherCard.count} receipts paid with someone else\u2019s card`, amount: rec.otherCard.amount,
    why: 'Booked as petty cash, but another card paid. The same spend could be claimed again through that card.',
    action: 'Confirm whose card paid, and either pay them back or move the cost to that card\u2019s account.',
    evidence: receiptEvidence(byStatus('OTHER_CARD'), true), go: { label: 'See the payments', section: 'payments' },
  });

  const missing = report.rows.filter(r => r.status === 'MISSING_RECEIPT').sort((a, b) => a.date.localeCompare(b.date));
  if (missing.length) out.push({
    key: 'missing', severity: 'medium', title: `${missing.length} card payments have no receipt`, amount: sum(missing.map(r => r.amount)) / 100,
    why: 'Money left the card with no invoice behind it. The VAT on it can\u2019t be reclaimed, and an auditor will ask.',
    action: 'Get the receipt for each one, or a signed expense note.',
    evidence: missing.map(r => ({ date: r.date, label: r.merchant, amount: r.amount, note: `card ref ${r.ref}`, select: { kind: 'row', ref: r.ref, source: 'statement' } })),
    go: item('no_receipt')?.go,
  });

  const vatOpen = report.receipts.filter(g => g.vat && (g.vat.status === 'not_verified' || g.vat.status === 'check'));
  if (vatOpen.length) out.push({
    key: 'vat', severity: 'medium', title: `${vatOpen.length} invoices need a VAT check`, amount: null,
    why: 'ReconAI could not find the seller\u2019s VAT number or the total on these, or the VAT does not add up. Until then their VAT is not claimed.',
    action: 'Open each one and enter the VAT number (or paste the QR text from your phone).',
    evidence: receiptEvidence(vatOpen), go: { label: 'Open the VAT register', section: 'vat' },
  });

  const unreadable = byStatus('REVIEW');
  if (unreadable.length) out.push({
    key: 'review', severity: 'medium', title: `${unreadable.length} ${unreadable.length === 1 ? 'receipt' : 'receipts'} ReconAI could not settle`, amount: null,
    why: 'Unreadable, or more than one card payment could be it. ReconAI does not guess.',
    action: 'Read the receipt and pick its payment in the review queue.', evidence: receiptEvidence(unreadable), go: { label: 'Review them', section: 'review' },
  });

  const dups = byStatus('DUPLICATE');
  if (dups.length) out.push({
    key: 'duplicates', severity: 'medium', title: `${dups.length} receipts were scanned twice`, amount: sum(dups.map(g => receiptAmount(g) ?? 0)) / 100,
    why: 'The same invoice is in the pack twice. ReconAI counts each once; check the ledger did too.',
    action: codes ? `Check that ledger entry ${codes} counts each of these once.` : 'Check that each invoice is booked once.',
    evidence: receiptEvidence(dups), go: { label: 'See the copies', section: 'transactions', tab: 'receipts', filter: 'DUPLICATE' },
  });

  if (rec.otherCredits.length) out.push({
    key: 'other_credits', severity: 'medium', title: `${rec.otherCredits.length} ledger entries with no receipt`, amount: sum(rec.otherCredits.map(l => l.credit ?? 0)) / 100,
    why: 'Booked as petty cash, with no receipt and no card payment behind them.',
    action: 'Ask the accountant what each entry is for, and get its receipt.',
    evidence: ledgerEvidence(rec.otherCredits), go: { label: 'See the ledger', section: 'transactions', tab: 'ledger' },
  });

  if (rec.unreconciled !== 0) {
    const share = rec.cardOut ? Math.abs(rec.unreconciled) / rec.cardOut : 1;
    out.push({
      key: 'unreconciled', severity: share >= 0.05 ? 'high' : share >= 0.01 ? 'medium' : 'low', title: 'Still unexplained after everything above', amount: rec.unreconciled,
      why: codes ? `The ledger books the month as one total (${codes}). After every item above, this much of the difference has no receipt or card payment behind it.` : 'Difference between card and ledger that no item explains.',
      action: codes ? `Ask the accountant for the list of entries behind ${codes}, so each can be matched to a receipt.` : 'Find the ledger entries behind this amount.',
      evidence: ledgerEvidence(report.ledger.filter(l => l.month === report.meta.month && rec.rollupCodes.includes(l.code))),
      go: { label: 'See the reconciliation', section: 'reconciliation' },
    });
  }

  // the matcher's own difference (paid minus invoiced), once per payment: a split payment's rows share it
  const seenPay = new Set<string>();
  const differ = report.rows.filter(r => r.status === 'AMOUNT_MISMATCH' && !r.rounding_rule && r.difference != null && r.difference !== 0).flatMap(r => {
    const key = [...r.receipt_ids].sort().join('|');
    if (seenPay.has(key)) return [];
    seenPay.add(key);
    return [{ r, diff: Math.abs(r.difference!) }];
  });
  if (differ.length) out.push({
    key: 'differ', severity: 'low', title: `${differ.length} card payments differ slightly from the invoice`, amount: sum(differ.map(d => d.diff)) / 100,
    why: `The largest difference is ${money(Math.max(...differ.map(d => d.diff)))}. Usually the shop dropped the halalas.`,
    action: 'Set a rounding rule once, or accept each one in the review queue.',
    evidence: differ.map(({ r, diff }) => ({
      date: r.date, label: r.merchant, amount: diff, note: `card ${money(r.amount)}`, explain: differenceReason(r, report),
      select: { kind: 'row', ref: r.ref, source: 'receipt' },
    })),
    go: { label: 'Set a rounding rule', section: 'review' },
  });

  if (rec.rollupCodes.length) out.push({
    // a process finding: the roll-up total is the whole month, not money at risk, so it carries no amount
    key: 'lump_sum', severity: 'low', title: 'The ledger books the month as one total', amount: null,
    why: `Entry ${codes} books ${money(rec.rollup)} in one line, so the ledger can\u2019t be checked receipt by receipt.`,
    action: 'Book petty cash line by line next month, or attach the list behind the total.', evidence: ledgerEvidence(report.ledger.filter(l => l.month === report.meta.month && rec.rollupCodes.includes(l.code))),
  });

  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0));
  return out;
}

export function severityCounts(fs: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of fs) c[f.severity]++;
  return c;
}

// ---------- how each riyal was paid: the petty-cash card, cash, other cards ----------
// The petty-cash card's number is the one most often printed on slips that matched its statement rows; the statement itself
// prints none. Other cards come from receipts the reviewer marked OTHER_CARD, grouped by the number on the slip.

export interface PaymentSource {
  key: string;
  kind: 'card' | 'cash' | 'other_card';
  label: string;
  /** Masked as printed: "513213 •••••• 6879"; null when no slip shows it. */
  number: string | null;
  network: string | null;
  count: string;
  amount: number;
  /** What ties the amount to the books, in a sentence. */
  tie: string;
  evidence: Evidence[];
}
export interface PaymentSources { sources: PaymentSource[]; found: number; rollup: number; notFound: number }

const maskedNumber = (c: { first6: string | null; last4: string }) => `${c.first6 ?? '••••••'} •••••• ${c.last4}`;
const network = (first6: string | null | undefined) =>
  !first6 ? null : first6.startsWith('4') ? 'Visa' : /^(5[1-5]|2[2-7])/.test(first6) ? 'Mastercard' : null;

export function paymentSources(report: PettyReport, rec: Reconciliation): PaymentSources {
  const slips = report.receipts.filter(g => g.card && g.refs.length > 0);   // slips matched to petty-cash card rows
  const byLast4 = new Map<string, ReceiptGroup[]>();
  for (const g of slips) byLast4.set(g.card!.last4, [...(byLast4.get(g.card!.last4) ?? []), g]);
  const ranked = [...byLast4.entries()].sort((a, b) => b[1].length - a[1].length);
  const [ownLast4, ownSlips] = ranked[0] ?? [null, []];
  const own = ownSlips.find(g => g.card!.first6)?.card ?? ownSlips[0]?.card ?? null;
  const misreads = ranked.slice(1).flatMap(([, gs]) => gs);
  const purchases = report.rows.filter(r => r.kind === 'purchase');
  const atmRows = report.rows.filter(r => r.kind === 'atm');
  const slipEvidence = (g: ReceiptGroup): Evidence => ({
    label: `p${g.page} · ${g.merchant ?? g.id}`, amount: receiptAmount(g), note: `slip shows ${maskedNumber(g.card!)}`,
    select: { kind: 'receipt', id: g.id, source: 'receipt' },
  });

  const sources: PaymentSource[] = [{
    key: 'petty', kind: 'card', label: 'Petty-cash card', number: own ? maskedNumber(own) : null, network: network(own?.first6),
    count: `${purchases.length} purchases · ${atmRows.length} ATM withdrawals`, amount: rec.cardOut,
    tie: [
      `Every payment is on the card statement: ${money(sum(purchases.map(r => r.amount)) / 100)} in purchases and ${money(sum(atmRows.map(r => r.amount)) / 100)} withdrawn as cash.`,
      own ? `The number is printed on ${ownSlips.length} matched slips.` : 'No matched slip prints the card number.',
      misreads.length ? `${misreads.length} more ${misreads.length === 1 ? 'slip reads' : 'slips read'} ${[...new Set(misreads.map(g => g.card!.last4))].join(', ')}, most likely a misread of ${ownLast4}.` : '',
    ].filter(Boolean).join(' '),
    evidence: [...ownSlips, ...misreads].map(slipEvidence),
  }];

  const cash = report.receipts.filter(g => g.status === 'CASH');
  if (cash.length || atmRows.length) {
    const beyond = (cents(rec.cash.amount) - cents(rec.atmCash)) / 100;
    sources.push({
      key: 'cash', kind: 'cash', label: 'Cash', number: null, network: null, count: `${cash.length} cash receipts`, amount: rec.cash.amount,
      tie: beyond > 0
        ? `${money(rec.atmCash)} came from ATM withdrawals on the petty-cash card; the other ${money(beyond)} has no recorded source.`
        : `Funded by ${money(rec.atmCash)} of ATM withdrawals on the petty-cash card${beyond < 0 ? `; ${money(-beyond)} of that cash has no receipt` : ''}.`,
      evidence: [
        ...atmRows.map(r => ({ date: r.date, label: 'ATM withdrawal', amount: r.amount, note: r.merchant, select: { kind: 'row', ref: r.ref, source: 'statement' } as Selection })),
        ...cash.map(g => ({ label: `p${g.page} · ${g.merchant ?? g.id}`, amount: receiptAmount(g), note: g.reason ?? undefined, select: { kind: 'receipt', id: g.id, source: 'receipt' } as Selection })),
      ],
    });
  }

  const others = new Map<string, ReceiptGroup[]>();
  for (const g of report.receipts.filter(x => x.status === 'OTHER_CARD')) {
    const k = g.card?.last4 ?? '';
    others.set(k, [...(others.get(k) ?? []), g]);
  }
  for (const [last4, gs] of [...others.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : 0))) {
    const c = gs.find(g => g.card)?.card ?? null;
    sources.push({
      key: `other-${last4 || 'unknown'}`, kind: 'other_card', label: last4 ? 'Other card' : 'Other card, number not shown',
      number: c ? maskedNumber(c) : null, network: network(c?.first6), count: `${gs.length} ${gs.length === 1 ? 'receipt' : 'receipts'}`,
      amount: sum(gs.map(g => receiptAmount(g) ?? 0)) / 100,
      tie: last4 ? 'Not on the petty-cash card statement; the slip names this card.' : 'Not on the petty-cash card statement; the receipt says card but prints no number.',
      evidence: gs.map(g => ({ label: `p${g.page} · ${g.merchant ?? g.id}`, amount: receiptAmount(g), note: g.reason ?? undefined, select: { kind: 'receipt', id: g.id, source: 'receipt' } })),
    });
  }

  const found = (sum(purchases.map(r => r.amount)) + cents(rec.cash.amount) + cents(rec.otherCard.amount)) / 100;
  return { sources, found, rollup: rec.rollup, notFound: rec.unreconciled };
}

// ---------- notes: why each transaction has its status, in a sentence ----------

const VAT = 0.15;
/** Why the card and its receipt disagree, or "No information" when the receipt shows no reason. */
export function differenceReason(row: StatementRow, report: PettyReport): string {
  const gs = row.receipt_ids.map(id => report.receipts.find(g => g.id === id)).filter((g): g is ReceiptGroup => Boolean(g));
  const amounts = gs.map(receiptAmount);
  if (!gs.length || amounts.some(a => a == null)) return 'No information: the receipt total could not be read.';
  const card = cents(row.amount), receipt = sum(amounts as number[]), d = card - receipt;
  const r = money(receipt / 100), c = money(card / 100), gap = money(Math.abs(d) / 100);
  if (Math.abs(card - Math.round(receipt / (1 + VAT))) <= 5)
    return `VAT not included: the receipt is ${r} with 15% VAT; the card paid ${c}, the amount before VAT.`;
  if (Math.abs(card - Math.round(receipt * (1 + VAT))) <= 5)
    return `VAT added at the till: the receipt shows ${r} before VAT; the card paid ${c}, the amount with 15% VAT.`;
  if (d < 0 && d > -100 && card % 100 === 0 && receipt % 100 !== 0)
    return `Rounded down to the whole riyal: the receipt is ${r}, the card paid ${c}. The ${gap} difference is rounding.`;
  return `No information: the card paid ${gap} ${d > 0 ? 'more' : 'less'} than the receipt (${r}), and the receipt shows no reason.`;
}

/** The transactions table's note: what the row was matched or tied to, or why not. */
export function rowNote(row: StatementRow, report: PettyReport): string {
  const g = row.receipt_ids.length ? report.receipts.find(x => x.id === row.receipt_ids[0]) : undefined;
  const led = row.citations.ledger;
  const at = led ? `${led.code} (${led.cell})` : 'the ledger';
  const named = g ? `receipt p${g.page}` : 'its receipt';   // the row already shows the merchant
  switch (row.status) {
    case 'MATCHED': {
      const split = /split payment: ([\d.+ ]+)/.exec(row.reason);
      if (split && g) return `One receipt (p${g.page}, ${money(receiptAmount(g))}) paid in ${split[1].split('+').length} card payments: ${split[1].trim()}.`;
      if (!g) return 'Matched to a receipt.';
      const when = g.date && g.date !== row.date ? `receipt dated ${fmtDate(g.date)}` : 'same day';
      return `Matched to ${named}: same amount, ${when}.`;
    }
    case 'AMOUNT_MISMATCH': return differenceReason(row, report);
    case 'MISSING_RECEIPT': return 'No receipt in the pack has this amount within a day of the payment.';
    case 'ATM_CASH': return `Cash withdrawal. The ledger has no withdrawal line; the cash is taken as spent on the cash receipts booked in roll-up ${at}.`;
    case 'TIED': return `Card top-up, booked in the ledger as ${at}.`;
    case 'REVIEW': {
      // say which receipt and why it was not matched: an unreadable candidate is a different problem from two candidates
      const cands = report.receipts.filter(x => x.review?.some(([ref]) => ref === row.ref));
      const faded = cands.find(x => x.unreadable);
      if (faded) return `The receipt on page ${faded.page} looks like this payment, but it is too faded to read, so ReconAI did not match it. Read the paper receipt and enter its total (Edit, in the review queue), or ask for a clearer copy.`;
      if (cands.length > 1) return `${cands.length} receipts (pages ${cands.map(x => x.page).join(', ')}) could be this payment. Pick the right one in the review queue.`;
      if (cands.length === 1) return `The receipt on page ${cands[0].page} could be this payment, but not every detail agrees. Confirm it in the review queue.`;
      return 'ReconAI could not settle this payment on its own. Open it in the review queue.';
    }
    case 'UNEXPLAINED': return 'No information: no ledger line matches this row.';
    default: return 'No information.';
  }
}

// ---------- what the citation pane shows for a selection ----------
export type Source = 'statement' | 'receipt' | 'ledger';
export type Selection =
  | { kind: 'row'; ref: string; source: Source; index?: number } // index: which receipt citation is primary
  | { kind: 'receipt'; id: string; source: Source }
  | { kind: 'ledger'; code: string; source: Source }; // a ledger entry with no card row behind it

export interface PaneSources {
  title: string;
  /** For a statement row, its date, which leads the title. */
  date?: string;
  statement: StatementCitation[];
  receipts: ReceiptCitation[];
  ledger: LedgerCitation | null;
  index: number;
}

export function rowByRef(report: PettyReport, ref: string): StatementRow | undefined {
  return report.rows.find(r => r.ref === ref);
}

function ledgerCite(report: PettyReport, l: LedgerLine, relation: string): LedgerCitation {
  return { sheet: report.meta.sheet, row: l.row, cell: l.cell, code: l.code, date: l.date, amount: l.credit ?? l.debit, relation };
}

export function paneSources(report: PettyReport, sel: Selection): PaneSources | null {
  if (sel.kind === 'ledger') {
    const l = report.ledger.find(x => x.month === report.meta.month && x.code === sel.code);
    if (!l) return null;
    return { title: `${l.code} · ${money(l.credit ?? l.debit)}`, statement: [], receipts: [], ledger: ledgerCite(report, l, 'no card payment behind it'), index: 0 };
  }
  if (sel.kind === 'row') {
    const row = rowByRef(report, sel.ref);
    if (!row) return null;
    return {
      title: `${row.date} · ${money(row.amount)} · ${row.merchant}`,
      date: row.date,
      statement: [row.citations.statement],
      receipts: row.citations.receipts,
      ledger: row.citations.ledger,
      index: sel.index ?? 0,
    };
  }
  const g = report.receipts.find(x => x.id === sel.id);
  if (!g) return null;
  const refs = new Set([...g.refs, ...g.review.map(([ref]) => ref)]);
  const rows = report.rows.filter(r => refs.has(r.ref));
  return {
    title: `${g.merchant ?? g.id} · p${g.page}`,
    statement: rows.map(r => r.citations.statement),
    receipts: g.citations,
    ledger: rows[0]?.citations.ledger ?? offCardLedger(report, g),
    index: 0,
  };
}

/** A receipt paid in cash or with another card has no card row; it is booked, as far as the ledger shows, inside the month's roll-up. */
function offCardLedger(report: PettyReport, g: ReceiptGroup): LedgerCitation | null {
  if (g.status !== 'CASH' && g.status !== 'OTHER_CARD') return null;
  const codes = report.tieout.purchases_vs_rollup.rollup_codes;
  const l = report.ledger.find(x => x.month === report.meta.month && codes.includes(x.code));
  return l ? ledgerCite(report, l, 'inside this roll-up, which has no line detail') : null;
}
