import { describe, test, expect } from 'bun:test';
import { EMPTY_REVIEWS, REVIEWER, exceptionQueue, itemState, kindOfId, queueCounts, recordDecision, recordEntry, recordRemarks, recordRule, type Reviews } from '../review-queue';
import type { PettyReport, ReceiptGroup, StatementRow } from '../petty-cash-report';

function row(ref: string, date: string, amount: number, status: string, receiptIds: string[] = []): StatementRow {
  return {
    ref, date, time: null, amount, merchant: `Shop ${ref}`, kind: 'purchase', orange: false, status, reason: 'why', receipt_ids: receiptIds,
    citations: {
      statement: { page: 1, box: [0, 10, 1000, 15], crop: `crops/stmt-${ref}.png` },
      receipts: receiptIds.map(id => ({ page: 3, group_id: id, box: [0, 0, 500, 500] as [number, number, number, number], crop: `crops/${id}.png` })),
      ledger: { sheet: 'GL', row: 9, cell: 'B9', code: 'ROLL', date: '2026-09-30', amount: 300, relation: 'rolled-up' },
    },
  };
}
function group(id: string, status: string, total: number | null, extra: Partial<ReceiptGroup> = {}): ReceiptGroup {
  return {
    id, page: 3, pages: [3], box: [0, 0, 500, 500], crop: `crops/${id}.png`, status, reason: 'reviewer said so', merchant: `Store ${id}`,
    date: '2026-09-04', total, amounts: total == null ? [] : [total], confidence: 0.9, notes: null, refs: [], review: [],
    citations: [{ page: 3, group_id: id, box: [0, 0, 500, 500], crop: `crops/${id}.png` }], ...extra,
  };
}
const REPORT = {
  meta: { client: 'X', month: '2026-09', month_label: 'September 2026', built_at: '2026-10-01', sheet: 'GL', files: {}, page_images: { receipts: [], statement: [] } },
  kpis: {}, counts: { rows: {}, receipts: {} }, ledger: [],
  tieout: { purchases_vs_rollup: { rollup_codes: ['ROLL'] } },
  rows: [
    row('m1', '2026-09-03', 45, 'AMOUNT_MISMATCH', ['p12-g2']),   // receipt 48: unexplained, but 3.00 is small
    row('m2', '2026-09-02', 50, 'AMOUNT_MISMATCH', ['p27-g1']),   // receipt 80: 30 apart, unexplained
    row('x1', '2026-09-01', 24.2, 'MISSING_RECEIPT'),
    row('ok', '2026-09-01', 10, 'MATCHED', ['p1-g1']),
  ],
  receipts: [
    group('p12-g2', 'LINKED', 48), group('p27-g1', 'LINKED', 80), group('p1-g1', 'LINKED', 10),
    group('p34-g1', 'OTHER_CARD', 741), group('p40-g1', 'ORPHAN', 30, { card: { first6: null, last4: '3630' } }),
    group('p41-g1', 'REVIEW', null, { date: null }), group('p50-g2', 'PART', null),
  ],
} as unknown as PettyReport;

describe('exceptionQueue', () => {
  const q = exceptionQueue(REPORT);
  test('statement rows first by date, then receipts; matched rows and fragments stay out', () => {
    expect(q.map(i => i.id)).toEqual(['row:x1', 'row:m2', 'row:m1', 'receipt:p34-g1', 'receipt:p40-g1', 'receipt:p41-g1']);
  });
  test('a small unexplained difference suggests accepting; a large one suggests asking', () => {
    expect(q.find(i => i.id === 'row:m1')).toMatchObject({ kind: 'differ', cardAmount: 45, receiptAmount: 48, suggested: 'accept', options: ['accept', 'ask'] });
    expect(q.find(i => i.id === 'row:m2')?.suggested).toBe('ask');
  });
  test('a missing receipt offers an expense note and carries the statement crop and ledger cell', () => {
    expect(q.find(i => i.id === 'row:x1')).toMatchObject({ kind: 'missing', receiptAmount: null, statementCrop: 'crops/stmt-x1.png', options: ['expense_note', 'ask'] });
    expect(q.find(i => i.id === 'row:x1')?.ledger?.cell).toBe('B9');
  });
  test('a slip printing a card number suggests another card; an earlier verdict counts as cleared', () => {
    expect(q.find(i => i.id === 'receipt:p40-g1')?.suggested).toBe('other_card');
    const earlier = q.find(i => i.id === 'receipt:p34-g1')!;
    expect(earlier.earlier).toEqual({ word: 'Paid with another card', note: 'reviewer said so', by: null });
    expect(itemState(earlier, EMPTY_REVIEWS)).toBe('cleared');
  });
  test("ReconAI's own cash / other-card call is never shown as settled: it stays open for a person to confirm", () => {
    const g = group('p85-g1', 'CASH', 35, { decided_by: { by: 'ReconAI', reason: 'Invoice states "Payment type: Cash"', at: '2026-10-27', proposed: true } } as Partial<ReceiptGroup>);
    const item = exceptionQueue({ ...REPORT, receipts: [g] } as PettyReport).find(i => i.id === 'receipt:p85-g1')!;
    expect(item.earlier).toBeUndefined();
    expect(item).toMatchObject({ suggested: 'cash', label: 'ReconAI suggestion' });
    expect(item.problem).toContain('ReconAI classified it from the receipt as paid in cash');
    expect(itemState(item, EMPTY_REVIEWS)).toBe('open');
  });
  test('counts follow the decisions', () => {
    const reviews: Reviews = { decisions: { 'row:m1': { decision: 'accept', at: 't' }, 'row:x1': { decision: 'ask', at: 't' } } };
    expect(queueCounts(q, EMPTY_REVIEWS)).toEqual({ open: 5, asked: 0, cleared: 1, total: 6 });
    expect(queueCounts(q, reviews)).toEqual({ open: 3, asked: 1, cleared: 2, total: 6 });
  });
});

describe('kindOfId', () => {
  test('only row and receipt ids of the expected shape', () => {
    expect(kindOfId('row:625109099501')).toBe('row');
    expect(kindOfId('receipt:p34-g1')).toBe('receipt');
    expect(kindOfId('receipt:../../etc')).toBeNull();
    expect(kindOfId('row:')).toBeNull();
  });
});

describe('recordDecision', () => {
  const now = '2026-10-27T10:00:00Z';
  test('a row decision touches only the reviews', () => {
    const out = recordDecision(EMPTY_REVIEWS, { links: {} }, { id: 'row:m1', decision: 'accept', note: ' rounding ' }, now);
    expect(out).toEqual({ reviews: { decisions: { 'row:m1': { decision: 'accept', note: 'rounding', at: now } } }, overrides: { links: {} }, rerun: false });
  });
  test('a receipt verdict is mirrored into overrides, and withdrawing it removes only its own entry', () => {
    const first = recordDecision(EMPTY_REVIEWS, {}, { id: 'receipt:p40-g1', decision: 'other_card' }, now);
    if ('error' in first) throw new Error(first.error);
    expect(first.rerun).toBe(true);
    expect(first.overrides).toEqual({ receipts: { 'p40-g1': { status: 'OTHER_CARD', reason: 'Paid with another card', source: 'review', by: REVIEWER, at: now } } });
    const undone = recordDecision(first.reviews, first.overrides, { id: 'receipt:p40-g1', decision: null }, now);
    if ('error' in undone) throw new Error(undone.error);
    expect(undone).toEqual({ reviews: EMPTY_REVIEWS, overrides: { receipts: {} }, rerun: true });
  });
  test('a verdict signed by a person in overrides is never replaced or removed', () => {
    const hand = { receipts: { 'p34-g1': { status: 'OTHER_CARD', reason: 'by hand', by: 'Saad' } } };
    const out = recordDecision(EMPTY_REVIEWS, hand, { id: 'receipt:p34-g1', decision: 'cash' }, now);
    if ('error' in out) throw new Error(out.error);
    expect(out.overrides).toBe(hand);
    expect(out.rerun).toBe(false);
  });
  test('an AI proposal or an unsigned verdict gives way to the reviewer, and comes back on undo', () => {
    const ai = { status: 'CASH', reason: 'change given', by: 'Claude (AI assistant)', proposed: true };
    const decided = recordDecision(EMPTY_REVIEWS, { receipts: { 'p33-g1': ai } }, { id: 'receipt:p33-g1', decision: 'cash', note: 'checked' }, now);
    if ('error' in decided) throw new Error(decided.error);
    expect(decided.overrides).toEqual({ receipts: { 'p33-g1': { status: 'CASH', reason: 'Paid in cash: checked', source: 'review', by: REVIEWER, at: now, replaced: ai } } });
    const undone = recordDecision(decided.reviews, decided.overrides, { id: 'receipt:p33-g1', decision: null }, now);
    if ('error' in undone) throw new Error(undone.error);
    expect(undone.overrides).toEqual({ receipts: { 'p33-g1': ai } });
    const unsigned = recordDecision(EMPTY_REVIEWS, { receipts: { 'p34-g1': { status: 'OTHER_CARD', reason: 'r' } } }, { id: 'receipt:p34-g1', decision: 'ask' }, now);
    if ('error' in unsigned) throw new Error(unsigned.error);
    expect(unsigned.rerun).toBe(false);   // asking writes nothing to overrides
  });
  test('rejects bad ids, decisions, notes and decisions that do not fit the item', () => {
    expect(recordDecision(EMPTY_REVIEWS, {}, { id: 'nope', decision: 'ask' }, now)).toEqual({ error: 'Unknown item' });
    expect(recordDecision(EMPTY_REVIEWS, {}, { id: 'row:m1', decision: 'delete' }, now)).toEqual({ error: 'Unknown decision' });
    expect(recordDecision(EMPTY_REVIEWS, {}, { id: 'row:m1', decision: 'cash' }, now)).toEqual({ error: 'That decision does not apply to this item' });
    expect(recordDecision(EMPTY_REVIEWS, {}, { id: 'receipt:p40-g1', decision: 'accept' }, now)).toEqual({ error: 'That decision does not apply to this item' });
    expect(recordDecision(EMPTY_REVIEWS, {}, { id: 'row:m1', decision: 'ask', note: 'x'.repeat(501) }, now)).toEqual({ error: 'Note must be text under 500 characters' });
  });
});

describe('evidence gates in the queue', () => {
  test('an AI proposal is an open item that suggests its verdict, never a cleared one', () => {
    const rep = { ...REPORT, receipts: [...REPORT.receipts,
      group('p33-g1', 'ORPHAN', 565.01, { proposal: { status: 'CASH', reason: 'Receipt shows cash 600 and change 34.99', by: 'Claude (AI assistant)', at: null, proposed: true } })] } as unknown as PettyReport;
    const item = exceptionQueue(rep).find(i => i.id === 'receipt:p33-g1')!;
    expect(item.earlier).toBeUndefined();
    expect(itemState(item, EMPTY_REVIEWS)).toBe('open');
    expect(item.suggested).toBe('cash');
    expect(item.proposal).toEqual({ word: 'Paid in cash', by: 'Claude (AI assistant)', reason: 'Receipt shows cash 600 and change 34.99' });
    expect(item.problem).toContain('not counted until you confirm');
  });
  test('a payment whose only candidate receipt is unreadable says so, and asks for a legible copy', () => {
    const rep = { ...REPORT, rows: [...REPORT.rows, row('o1', '2026-09-08', 30.98, 'REVIEW')],
      receipts: [...REPORT.receipts, group('p34-g2', 'REVIEW', null, { unreadable: 'AI read the amount at 0.42 confidence, below the 0.70 needed', review: [['o1', 0]] })] } as unknown as PettyReport;
    const item = exceptionQueue(rep).find(i => i.id === 'row:o1')!;
    expect(item.problem).toContain('cannot be read, so ReconAI did not guess its amount');
    expect(item.suggested).toBe('ask');
    expect(item.receiptCrops).toEqual(['crops/p34-g2.png']);
  });
});

describe('a person’s reading and the rules', () => {
  const now = '2026-10-27T10:00:00Z';
  const zatca = { seller: 'Al-Fares', vat_no: '300529723300003', time: 't', total: 218.5, vat: 28.5, phase: 1 as const, signature: null, signature_scheme: null, invoice_hash: null, public_key: null };
  const parse = (t: string) => (t.startsWith('AQ') ? zatca : null);
  test('a total and VAT are saved with the reviewer as author', () => {
    const out = recordEntry({}, { receipt: 'p03-g1', total: '218.50', vat: 28.5, note: 'read from the original' }, now, parse);
    if ('error' in out) throw new Error(out.error);
    expect(out.overrides).toEqual({ groups: { 'p03-g1': { total: 218.5, vat: 28.5, by: REVIEWER, at: now, reason: 'read from the original' } } });
  });
  test('QR text from a phone is parsed and kept; anything else is refused, and a total that disagrees with the QR is refused', () => {
    const ok = recordEntry({}, { receipt: 'p03-g1', qr: 'AQxyz' }, now, parse);
    if ('error' in ok) throw new Error(ok.error);
    expect((ok.overrides.qr as Record<string, { zatca: unknown; by: string }>)['p03-g1']).toMatchObject({ zatca, by: REVIEWER });
    expect(recordEntry({}, { receipt: 'p03-g1', qr: 'https://example.com' }, now, parse)).toEqual({ error: 'That is not a ZATCA QR code: paste the text the phone shows when it scans the code' });
    expect(recordEntry({}, { receipt: 'p03-g1', qr: 'AQxyz', total: 281.5 }, now, parse)).toMatchObject({ error: expect.stringContaining('check which is right') });
  });
  test('bad input is refused before anything is written', () => {
    expect(recordEntry({}, { receipt: '../x', total: 1 }, now, parse)).toEqual({ error: 'Unknown receipt' });
    expect(recordEntry({}, { receipt: 'p03-g1', total: '12.345' }, now, parse)).toMatchObject({ error: expect.stringContaining('two decimals') });
    expect(recordEntry({}, { receipt: 'p03-g1', total: 10, vat: 11 }, now, parse)).toEqual({ error: 'VAT cannot be more than the total' });
    expect(recordEntry({}, { receipt: 'p03-g1' }, now, parse)).toEqual({ error: 'Enter the VAT number, a total, a VAT figure or the QR text' });
    expect(recordEntry({}, { receipt: 'p03-g1', vat_no: '312103569500006' }, now, parse)).toMatchObject({ error: expect.stringContaining('starting and ending with 3') });
  });
  test('the seller VAT number alone is enough, and spaces are dropped', () => {
    const out = recordEntry({}, { receipt: 'p08-g1', vat_no: '311 626 584 000 003' }, now, parse);
    if ('error' in out) throw new Error(out.error);
    expect(out.overrides).toEqual({ groups: { 'p08-g1': { vat_no: '311626584000003', by: REVIEWER, at: now } } });
  });
  test('the rounding rule is signed, capped at 5 SAR, and 0 turns it off', () => {
    const out = recordRule({ links: {} }, { max: '0.99', applies: 'card_less' }, now);
    if ('error' in out) throw new Error(out.error);
    expect(out.overrides).toEqual({ links: {}, rules: { rounding: { max: 0.99, applies: 'card_less', by: REVIEWER, at: now } } });
    expect(recordRule({}, { max: 10, applies: 'either' }, now)).toMatchObject({ error: expect.stringContaining('not rounding') });
    expect(recordRule({}, { max: 1, applies: 'sometimes' }, now)).toEqual({ error: 'Choose when the rule applies' });
  });
  test('a payment accepted by the rounding rule is cleared, and says by whose rule', () => {
    const rep = { ...REPORT, rows: [...REPORT.rows, { ...row('rr', '2026-09-06', 313, 'AMOUNT_MISMATCH', ['p27-g1']), paid: 313, invoiced: 313.95, difference: -0.95,
      rounding_rule: { max: 0.99, applies: 'card_less', by: 'Saad', at: now } }] } as unknown as PettyReport;
    const item = exceptionQueue(rep).find(i => i.id === 'row:rr')!;
    expect(itemState(item, EMPTY_REVIEWS)).toBe('cleared');
    expect(item.earlier).toMatchObject({ word: 'Accepted by the rounding rule', by: 'Saad' });
  });
});

describe('reviewer remarks', () => {
  const now = '2026-10-28T09:00:00Z';
  test('are saved signed and dated, empty clears them, and a later decision keeps them', () => {
    const saved = recordRemarks(EMPTY_REVIEWS, '  Ledger detail requested from the accountant. ', now);
    if ('error' in saved) throw new Error(saved.error);
    expect(saved.reviews.remarks).toEqual({ text: 'Ledger detail requested from the accountant.', by: REVIEWER, at: now });
    const decided = recordDecision(saved.reviews, {}, { id: 'row:m1', decision: 'accept' }, now);
    if ('error' in decided) throw new Error(decided.error);
    expect(decided.reviews.remarks?.text).toBe('Ledger detail requested from the accountant.');
    const cleared = recordRemarks(decided.reviews, '', now);
    if ('error' in cleared) throw new Error(cleared.error);
    expect(cleared.reviews.remarks).toBeUndefined();
    expect(recordRemarks(EMPTY_REVIEWS, 'x'.repeat(2001), now)).toEqual({ error: 'Remarks must be text under 2,000 characters' });
  });
});
