// The review queue: everything the matcher could not settle on its own, one item at a time, with ReconAI's suggestion and the
// reviewer's decision. Decisions live in data/<client>/reviews.json (written by the review route); a decision about a receipt
// (cash, another card, not a receipt) is also written to overrides.json so the next run puts it into the figures.
// Pure: shared by the page and the route, nothing here touches the DOM or the file system.
import {
  differenceReason, money, receiptAmount, type EvidenceItem, type LedgerCitation, type PettyReport, type ReceiptGroup, type Selection, type StatementRow,
} from './petty-cash-report';
import type { Zatca } from './zatca';

export const DECISION_KEYS = ['accept', 'expense_note', 'ask', 'cash', 'other_card', 'not_receipt'] as const;
export type DecisionKey = (typeof DECISION_KEYS)[number];

/** `label` is the button, `done` the state once chosen. */
export const DECISIONS: Record<DecisionKey, { label: string; done: string }> = {
  accept: { label: 'Accept card amount', done: 'Card amount accepted' },
  expense_note: { label: 'Accept with expense note', done: 'Accepted with an expense note' },
  ask: { label: 'Ask the card holder', done: 'Waiting on the card holder' },
  cash: { label: 'Paid in cash', done: 'Paid in cash' },
  other_card: { label: 'Paid with another card', done: 'Paid with another card' },
  not_receipt: { label: 'Not a receipt', done: 'Not a receipt' },
};

/** The receipt verdicts b_match.py reads from overrides.json. */
export const OVERRIDE_STATUS: Partial<Record<DecisionKey, 'CASH' | 'OTHER_CARD' | 'PART'>> = { cash: 'CASH', other_card: 'OTHER_CARD', not_receipt: 'PART' };

export interface ReviewDecision { decision: DecisionKey; note?: string; at: string }
/** `remarks`: the reviewer's own words for the file, shown on the sign-off page. */
export interface Reviews { decisions: Record<string, ReviewDecision>; remarks?: { text: string; by: string; at: string } }
export const EMPTY_REVIEWS: Reviews = { decisions: {} };
/** The author recorded for a decision made in the app. The app signs in with a workspace API key, not a person, so this names the role. */
export const REVIEWER = 'Reviewer (app)';

export type ExceptionKind = 'differ' | 'missing' | 'pick' | 'receipt';
export const KIND_WORD: Record<ExceptionKind, string> = {
  differ: 'Amounts differ',
  missing: 'No receipt',
  pick: 'Several receipts fit',
  receipt: 'Receipt not on the card',
};

/** Which decisions each kind of item can take; the route checks a decision against its item's id the same way. */
export const KIND_OPTIONS: Record<ExceptionKind, DecisionKey[]> = {
  differ: ['accept', 'ask'],
  missing: ['expense_note', 'ask'],
  pick: ['ask'],
  receipt: ['cash', 'other_card', 'not_receipt', 'ask'],
};

export interface ExceptionItem {
  /** "row:<card ref>" or "receipt:<group id>". */
  id: string;
  kind: ExceptionKind;
  date: string | null;
  merchant: string;
  /** Card amount for a statement row, receipt total for a receipt. */
  amount: number | null;
  cardAmount: number | null;
  receiptAmount: number | null;
  /** What the check found, in a sentence. */
  problem: string;
  /** What ReconAI suggests, in a sentence, and the decision that carries it out. */
  suggestion: string;
  suggested: DecisionKey;
  options: DecisionKey[];
  statementCrop: string | null;
  /** The card statement's own line, as read: the crop alone is a full-width strip too small to read on screen. */
  statementLine: { date: string; time: string | null; description: string; ref: string; amount: number } | null;
  receiptCrops: string[];
  ledger: LedgerCitation | null;
  selection: Selection;
  /** Settled before this queue existed by a named person (overrides.json): shown as cleared, not decided here. ReconAI's own
   *  classification is never "earlier": it stays open for a person to confirm. */
  earlier?: { word: string; note: string | null; by: string | null };
  /** How the report knows what it says about this item: each source and its strength (b_match.py's evidence trail). */
  evidence: EvidenceItem[];
  /** The receipts a person can read for this item (Read it yourself): the linked ones, or the unreadable candidate. */
  receiptIds: string[];
  /** What ReconAI read for the first of them: prefills the Edit form. */
  read?: { total: number | null; vat: number | null; vatNo: string | null; vatNoNote?: string | null };
  /** The label when the kind's word would mislead: an unreadable receipt, an AI proposal. */
  label?: string;
  /** A verdict the AI proposed (or one recorded with no author): it counts for nothing until a person accepts it. */
  proposal?: { word: string; by: string | null; reason: string | null };
}

export type QueueState = 'open' | 'asked' | 'cleared';

export function itemState(item: ExceptionItem, reviews: Reviews): QueueState {
  const d = reviews.decisions[item.id];
  if (d) return d.decision === 'ask' ? 'asked' : 'cleared';
  return item.earlier ? 'cleared' : 'open';
}

/** Ids a decision may name; the route rejects anything else before touching a file. */
export function kindOfId(id: string): 'row' | 'receipt' | null {
  if (/^row:[0-9A-Za-z]{1,40}$/.test(id)) return 'row';
  if (/^receipt:p\d{1,4}-g\d{1,3}$/.test(id)) return 'receipt';
  return null;
}

const ROW_KINDS: Record<string, ExceptionKind> = { AMOUNT_MISMATCH: 'differ', MISSING_RECEIPT: 'missing', REVIEW: 'pick' };
const EARLIER: Record<string, string> = { CASH: 'Paid in cash', OTHER_CARD: 'Paid with another card', DUPLICATE: 'Second copy, not counted' };
const PROPOSAL_DECISION: Record<string, DecisionKey> = { CASH: 'cash', OTHER_CARD: 'other_card' };
const cents = (n: number) => Math.round(n * 100);

function rowItem(r: StatementRow, report: PettyReport): ExceptionItem {
  const kind = ROW_KINDS[r.status];
  const gs = r.receipt_ids.map(id => report.receipts.find(g => g.id === id)).filter((g): g is ReceiptGroup => Boolean(g));
  const amounts = gs.map(receiptAmount);
  const receipt = gs.length && amounts.every(a => a != null) ? amounts.reduce((a, b) => a + cents(b as number), 0) / 100 : null;
  const base = {
    id: `row:${r.ref}`, kind, date: r.date, merchant: r.merchant, amount: r.amount, cardAmount: r.amount, receiptAmount: receipt,
    options: KIND_OPTIONS[kind], statementCrop: r.citations.statement.crop,
    statementLine: { date: r.date, time: r.time, description: r.merchant_raw ?? r.merchant, ref: r.ref, amount: r.amount }, receiptCrops: r.citations.receipts.map(c => c.crop),
    ledger: r.citations.ledger, selection: { kind: 'row', ref: r.ref, source: kind === 'missing' ? 'statement' : 'receipt' } as Selection,
    evidence: r.evidence ?? [], receiptIds: r.receipt_ids, read: readOf(gs[0]),
  };
  if (kind === 'differ' && r.rounding_rule) {
    const rr = r.rounding_rule;
    return {
      ...base, problem: `The card paid ${money(r.paid ?? r.amount)}; the invoice says ${receipt == null ? 'no readable total' : money(receipt)}.`,
      suggestion: '', suggested: 'accept',
      earlier: { word: 'Accepted by the rounding rule', note: `Up to ${money(rr.max)} SAR ${rr.applies === 'either' ? 'either way' : 'below the invoice'}, a rule set by ${rr.by ?? 'an author not recorded'}.`, by: rr.by },
    };
  }
  if (kind === 'differ') {
    const why = differenceReason(r, report);
    const gap = receipt == null ? null : Math.abs(cents(r.amount) - cents(receipt)) / 100;
    const explained = !why.startsWith('No information');
    const small = gap != null && gap <= 5;
    return {
      ...base,
      problem: explained ? why : `The card paid ${money(r.amount)}; the receipt shows ${receipt == null ? 'no readable total' : money(receipt)}, and gives no reason for the difference.`,
      suggestion: explained || small
        ? `Accept the card amount: ${explained ? 'the difference is explained' : `the ${money(gap)} difference is too small to chase`}, and the card amount is what left the account.`
        : 'Ask the card holder why the card amount differs from the receipt before accepting it.',
      suggested: explained || small ? 'accept' : 'ask',
    };
  }
  if (kind === 'missing') return {
    ...base, problem: 'No receipt in the pack has this amount within a day of the payment.',
    suggestion: 'Ask the card holder for the receipt. If it cannot be found, accept it with a signed expense note; the VAT on it cannot be reclaimed.',
    suggested: 'ask',
  };
  const unreadable = report.receipts.filter(g => g.unreadable && g.review.some(([ref]) => ref === r.ref));
  if (unreadable.length) {
    const g = unreadable[0];
    return {
      ...base, label: 'Receipt unreadable', receiptCrops: g.crop ? [g.crop] : g.citations.map(c => c.crop), receiptIds: [g.id], read: readOf(g),
      problem: `The receipt that may be this payment (page ${g.page}) cannot be read, so ReconAI did not guess its amount: ${g.unreadable}.`,
      suggestion: 'Ask the card holder for a legible copy of the receipt, or read the original and record its total.', suggested: 'ask',
      evidence: [...base.evidence, ...(g.evidence ?? []).filter(e => e.what === 'amount').map(e => ({ ...e, receipt: g.id }))],
    };
  }
  return {
    ...base, problem: 'More than one receipt could be this payment, so the matcher left the choice to a person.',
    suggestion: 'Open the evidence, compare the candidates, and ask the card holder if it is still unclear.', suggested: 'ask',
  };
}

function receiptItem(g: ReceiptGroup): ExceptionItem {
  const earlier = EARLIER[g.status];
  const proposed = g.proposal && PROPOSAL_DECISION[g.proposal.status];
  if (proposed && g.proposal) {
    const by = g.proposal.by ?? 'an override with no author';
    return {
      ...receiptBase(g),
      problem: `No payment on the petty-cash card matches this receipt (page ${g.page}). ${by} proposed: ${DECISIONS[proposed].done.toLowerCase()}${g.proposal.reason ? `, because ${g.proposal.reason.charAt(0).toLowerCase()}${g.proposal.reason.slice(1)}` : ''}. It is not counted until you confirm it.`,
      suggestion: `Check the receipt. If it shows that, confirm "${DECISIONS[proposed].label.toLowerCase()}"; if not, ask the card holder for proof of payment.`,
      suggested: proposed, label: 'Proposal to confirm',
      proposal: { word: DECISIONS[proposed].done, by: g.proposal.by, reason: g.proposal.reason },
    };
  }
  const classified = earlier && g.decided_by?.proposed && PROPOSAL_DECISION[g.status];
  if (classified) {
    // ReconAI classified the payment from what the receipt shows: counted that way, but open until a person confirms or changes it
    return {
      ...receiptBase(g),
      problem: `Not on the petty-cash card statement (page ${g.page}). ReconAI classified it from the receipt as ${DECISIONS[classified].done.toLowerCase()}${g.decided_by?.reason ? `: ${g.decided_by.reason.charAt(0).toLowerCase()}${g.decided_by.reason.slice(1)}` : ''}. It is counted that way until you change it.`,
      suggestion: `Check the receipt. If it shows that, confirm "${DECISIONS[classified].label.toLowerCase()}"; if not, ask the card holder for proof of payment.`,
      suggested: classified, label: 'ReconAI suggestion',
    };
  }
  return {
    ...receiptBase(g),
    problem: earlier ? `Not on the petty-cash card statement (page ${g.page}).` : `No payment on the petty-cash card matches this receipt (page ${g.page}).`,
    suggestion: g.card
      ? `The slip prints a card ending ${g.card.last4}. If that is not the petty-cash card, mark it as paid with another card.`
      : 'Check how it was paid: if the receipt says cash, mark it as paid in cash; if it is a header or stamp, mark it as not a receipt.',
    suggested: g.card ? 'other_card' : 'ask',
    ...(earlier ? { earlier: { word: g.decided_by?.proposed ? `${earlier}, classified from the receipt` : earlier, note: g.reason, by: g.decided_by?.by ?? null } } : {}),
  };
}

function receiptBase(g: ReceiptGroup) {
  return {
    id: `receipt:${g.id}`, kind: 'receipt' as const, date: g.date, merchant: g.merchant ?? g.id, amount: receiptAmount(g), cardAmount: null,
    receiptAmount: receiptAmount(g), options: KIND_OPTIONS.receipt, statementCrop: null, statementLine: null, receiptCrops: g.crop ? [g.crop] : g.citations.map(c => c.crop),
    ledger: null, selection: { kind: 'receipt', id: g.id, source: 'receipt' } as Selection, evidence: g.evidence ?? [],
    receiptIds: [g.id], read: readOf(g),
  };
}

function readOf(g: ReceiptGroup | undefined): ExceptionItem['read'] {
  if (!g) return undefined;
  return { total: g.total, vat: g.vat?.amount ?? g.vat_check?.vat ?? null, vatNo: g.seller_vat?.no ?? g.vat_no_candidate ?? null, vatNoNote: candidateNote(g) };
}

/** Why the VAT number field is prefilled when the number is not the invoice's confirmed one: a person checks it and saves. */
export function candidateNote(g: ReceiptGroup): string | null {
  if (g.seller_vat?.no || !g.vat_no_candidate) return null;
  return g.vat_no_candidate_by?.by ? `Read off the page by ${g.vat_no_candidate_by.by}: check it against the invoice, then save` : 'As printed beside the VAT label; it may be misread: check it, then save';
}

/** Statement rows the matcher could not settle, then receipts it could not place, each by date. Receipts already settled as cash,
 *  another card or a second copy are included as cleared, so the queue shows the whole review, not only what is left. */
export function exceptionQueue(report: PettyReport): ExceptionItem[] {
  const byDate = (a: ExceptionItem, b: ExceptionItem) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.id.localeCompare(b.id);
  const rows = report.rows.filter(r => Object.hasOwn(ROW_KINDS, r.status)).map(r => rowItem(r, report)).sort(byDate);
  const receipts = report.receipts
    .filter(g => g.status === 'REVIEW' || g.status === 'ORPHAN' || Object.hasOwn(EARLIER, g.status))
    .map(receiptItem).sort(byDate);
  return [...rows, ...receipts];
}

export function queueCounts(items: ExceptionItem[], reviews: Reviews): Record<QueueState, number> & { total: number } {
  const out = { open: 0, asked: 0, cleared: 0, total: items.length };
  for (const it of items) out[itemState(it, reviews)]++;
  return out;
}

/** Records (or, with decision null, withdraws) one decision, returning the new files. A receipt verdict is mirrored into
 *  overrides.json, marked as the queue's own so withdrawing it never removes a verdict someone wrote there by hand. */
export function recordDecision(
  reviews: Reviews, overrides: Record<string, unknown>,
  input: { id: unknown; decision: unknown; note?: unknown }, now: string
): { reviews: Reviews; overrides: Record<string, unknown>; rerun: boolean } | { error: string } {
  const { id, decision, note } = input;
  const kind = typeof id === 'string' ? kindOfId(id) : null;
  if (!kind) return { error: 'Unknown item' };
  if (decision !== null && !(DECISION_KEYS as readonly unknown[]).includes(decision)) return { error: 'Unknown decision' };
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) return { error: 'Note must be text under 500 characters' };
  const d = decision as DecisionKey | null;
  const rowOnly: DecisionKey[] = ['accept', 'expense_note'];
  if (d && (kind === 'row' ? Boolean(OVERRIDE_STATUS[d]) : rowOnly.includes(d))) return { error: 'That decision does not apply to this item' };

  const decisions = { ...reviews.decisions };
  if (d) decisions[id as string] = { decision: d, ...(note ? { note: (note as string).trim() } : {}), at: now };
  else delete decisions[id as string];

  let rerun = false;
  let nextOverrides = overrides;
  if (kind === 'receipt') {
    const gid = (id as string).slice('receipt:'.length);
    type Fix = { source?: string; proposed?: boolean; by?: string; replaced?: Fix };
    const fixes = { ...((overrides.receipts as Record<string, Fix>) ?? {}) };
    const prev = fixes[gid];
    const mine = prev?.source === 'review';
    // an AI proposal, or a verdict nobody signed, gives way to a reviewer's decision; it is kept and comes back on undo
    const yields = Boolean(prev && !mine && (prev.proposed || !prev.by));
    const status = d ? OVERRIDE_STATUS[d] : undefined;
    if (status && (!prev || mine || yields)) {
      const replaced = mine ? prev?.replaced : yields ? prev : undefined;
      fixes[gid] = { status, reason: `${DECISIONS[d!].done}${note ? `: ${(note as string).trim()}` : ''}`, source: 'review', by: REVIEWER, at: now,
        ...(replaced ? { replaced } : {}) } as never;
      rerun = true;
    } else if (!status && mine) {
      if (prev?.replaced) fixes[gid] = prev.replaced; else delete fixes[gid];
      rerun = true;
    }
    if (rerun) nextOverrides = { ...overrides, receipts: fixes };
  }
  return { reviews: { ...reviews, decisions }, overrides: nextOverrides, rerun };   // keep the remarks and anything else in the file
}

// ---------- a person's own reading of an invoice, and the rules a person sets ----------

const money2 = (v: unknown): number | null | 'bad' => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 && Math.round(n * 100) === n * 100 ? n : 'bad';
};

export interface EntryInput { receipt?: unknown; total?: unknown; vat?: unknown; vat_no?: unknown; qr?: unknown; note?: unknown }

/** What a reviewer read on the invoice: a total, a VAT figure, and/or the text of its QR code from a phone scan. The QR text is parsed and
 *  its signature checked here, by the same code as the decoder, so a pasted string is held to the same standard as a decoded one.
 *  Written to overrides.json with the reviewer as author; the next run uses it ahead of the AI's reading. */
export function recordEntry(
  overrides: Record<string, unknown>, input: EntryInput, now: string, parse: (text: string) => Zatca | null,
): { overrides: Record<string, unknown>; qr: Zatca | null } | { error: string } {
  const { receipt, total, vat, qr, note } = input;
  const vatNo = typeof input.vat_no === 'string' ? input.vat_no.replace(/\s/g, '') : input.vat_no;
  if (vatNo !== undefined && vatNo !== '' && (typeof vatNo !== 'string' || !/^3\d{13}3$/.test(vatNo))) {
    return { error: 'A Saudi VAT number is 15 digits, starting and ending with 3' };
  }
  if (typeof receipt !== 'string' || !/^p\d{1,4}-g\d{1,3}$/.test(receipt)) return { error: 'Unknown receipt' };
  const t = money2(total), v = money2(vat);
  if (t === 'bad' || v === 'bad') return { error: 'Amounts must be numbers with at most two decimals' };
  if (t !== null && v !== null && v > t) return { error: 'VAT cannot be more than the total' };
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) return { error: 'Note must be text under 500 characters' };
  if (qr !== undefined && qr !== '' && (typeof qr !== 'string' || qr.length > 4000)) return { error: 'QR text is too long' };
  const z = typeof qr === 'string' && qr.trim() ? parse(qr) : null;
  if (typeof qr === 'string' && qr.trim() && !z) return { error: 'That is not a ZATCA QR code: paste the text the phone shows when it scans the code' };
  if (z && t !== null && z.total !== null && Math.round(z.total * 100) !== Math.round(t * 100)) {
    return { error: `The QR code says ${money(z.total)} but the total entered is ${money(t)}: check which is right before saving` };
  }
  if (t === null && v === null && !z && !vatNo) return { error: 'Enter the VAT number, a total, a VAT figure or the QR text' };
  const who = { by: REVIEWER, at: now, ...(typeof note === 'string' && note.trim() ? { reason: note.trim() } : {}) };
  const groups = { ...((overrides.groups as Record<string, Record<string, unknown>>) ?? {}) };
  if (t !== null || v !== null || vatNo) {
    groups[receipt] = { ...(groups[receipt] ?? {}), ...(t !== null ? { total: t } : {}), ...(v !== null ? { vat: v } : {}), ...(vatNo ? { vat_no: vatNo } : {}), ...who };
  }
  const qrs = { ...((overrides.qr as Record<string, unknown>) ?? {}) };
  if (z) qrs[receipt] = { raw: (qr as string).trim(), zatca: z, ...who };
  return { overrides: { ...overrides, groups, ...(z ? { qr: qrs } : {}) }, qr: z };
}

export interface RoundingRule { max: number; applies: 'card_less' | 'either'; by?: string; at?: string }

/** The rounding rule, set by a person: a card payment up to `max` SAR below the invoice (or either way) is accepted as rounding, and shown
 *  as accepted by this rule, not as a match. 0 turns it off. Capped at 5 SAR: past that a difference is not rounding. */
export function recordRule(overrides: Record<string, unknown>, input: { max?: unknown; applies?: unknown }, now: string)
  : { overrides: Record<string, unknown> } | { error: string } {
  const m = money2(input.max);
  if (m === 'bad' || m === null) return { error: 'The rounding limit must be an amount, e.g. 0.99' };
  if (m > 5) return { error: 'A rounding rule above 5.00 SAR is not rounding; leave larger differences to a person' };
  if (input.applies !== 'card_less' && input.applies !== 'either') return { error: 'Choose when the rule applies' };
  const rules = { ...((overrides.rules as Record<string, unknown>) ?? {}), rounding: { max: m, applies: input.applies, by: REVIEWER, at: now } };
  return { overrides: { ...overrides, rules } };
}

/** The reviewer's remarks for the month: free text up to 2,000 characters, signed and dated; empty clears them. */
export function recordRemarks(reviews: Reviews, text: unknown, now: string): { reviews: Reviews } | { error: string } {
  if (typeof text !== 'string' || text.length > 2000) return { error: 'Remarks must be text under 2,000 characters' };
  const { remarks: _old, ...rest } = reviews;
  void _old;
  return { reviews: text.trim() ? { ...rest, remarks: { text: text.trim(), by: REVIEWER, at: now } } : rest };
}
