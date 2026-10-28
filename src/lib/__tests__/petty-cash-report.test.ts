import { describe, test, expect } from 'bun:test';
import {
  acct, applyDisplay, boxStyle, countByStatus, filterReceipts, filterRows, fmtDate, imageUrl, money, monthEnd, findings, paneSources, paymentSources, differenceReason, rowNote, pct, RECEIPT_FILTERS, reconcile,
  rowByRef, severityCounts, sortRows, statusMeta,
  type Box, type LedgerLine, type PettyReport, type ReceiptGroup, type StatementRow,
} from '../petty-cash-report';

const BOX: Box = [100, 100, 500, 900];
function row(ref: string, date: string, time: string | null, amount: number, merchant: string, status: string,
  receipts: Array<{ page: number; group_id: string }> = [], ledger = true): StatementRow {
  return {
    ref, date, time, amount, merchant, kind: 'purchase', orange: false, status, reason: 'why',
    receipt_ids: receipts.map(r => r.group_id),
    citations: {
      statement: { page: 1, box: [0, 10, 1000, 15], crop: `crops/stmt-${ref}.png` },
      receipts: receipts.map(r => ({ ...r, box: BOX, crop: `crops/${r.group_id}.png` })),
      ledger: ledger ? { sheet: 'GL', row: 9, cell: 'B9', code: 'ROLL', date: '2026-09-30', amount: 300, relation: 'rolled-up' } : null,
    },
  };
}
function group(id: string, page: number, status: string, refs: string[] = [], review: Array<[string, number]> = []): ReceiptGroup {
  return {
    id, page, pages: [page], box: [100, 100, 500, 900], crop: `crops/${id}.png`, status, reason: 'r', merchant: `Shop ${id}`,
    date: '2026-09-04', total: 20, amounts: [20], confidence: 0.9, notes: null, refs, review,
    citations: [{ page, group_id: id, box: [100, 100, 500, 900], crop: `crops/${id}.png` }],
  };
}
const REPORT: PettyReport = {
  meta: {
    client: 'ABUJHD', month: '2026-09', month_label: 'September 2026', built_at: '2026-10-23T22:00:00', sheet: 'GL',
    files: { receipts: 'r.pdf', statement: 's.pdf', ledger: 'l.xlsx' },
    page_images: { receipts: ['pages/page-01.png', 'pages/page-02.png'], statement: ['pages/statement-200.png'] },
  },
  kpis: { card_spend: 350, purchase_count: 2, atm_count: 1, purchases_amount: 150, evidenced_amount: 100, rollup: 300, open_gap: -50, missing_count: 1, missing_amount: 50 },
  counts: { rows: {}, receipts: {} },
  rows: [
    row('r1', '2026-09-05', '10:00:00', 100, 'GREEN STAR FUEL', 'MATCHED', [{ page: 1, group_id: 'p1-g1' }, { page: 2, group_id: 'p2-g1' }]),
    row('r2', '2026-09-05', '08:00:00', 50, 'AL OTHAIM', 'MISSING_RECEIPT'),
    row('r3', '2026-09-01', null, 75.5, 'MAZA REST', 'REVIEW', [], false),
  ],
  receipts: [group('p1-g1', 1, 'LINKED', ['r1']), group('p2-g1', 2, 'LINKED', ['r1']), group('p3-g1', 3, 'REVIEW', [], [['r3', 6], ['r2', 5]]), group('p4-g1', 4, 'ORPHAN')],
  ledger: [],
  tieout: {
    loads_vs_topups: { statement: 0, ledger: 0, diff: 0 },
    atm_vs_withdrawals: { statement: 0, ledger: 0, diff: 0 },
    purchases_vs_rollup: { statement: 0, ledger: 0, diff: 0, purchases_only: 0, rollup_codes: [] },
  },
};

describe('statusMeta', () => {
  test('maps every matcher status to a word, glyph and tone', () => {
    expect(statusMeta('MATCHED')).toEqual({ word: 'Matched', glyph: '✓', tone: 'ok' });
    expect(statusMeta('LINKED')).toEqual({ word: 'Linked', glyph: '✓', tone: 'ok' });
    expect(statusMeta('TIED')).toEqual({ word: 'Tied to ledger', glyph: '✓', tone: 'ok' });
    expect(statusMeta('MISSING_RECEIPT')).toEqual({ word: 'Missing receipt', glyph: '✕', tone: 'bad' });
    expect(statusMeta('ORPHAN')).toEqual({ word: 'No card row', glyph: '✕', tone: 'bad' });
    expect(statusMeta('REVIEW')).toEqual({ word: 'Needs a decision', glyph: '?', tone: 'review' });
    expect(statusMeta('UNEXPLAINED')).toEqual({ word: 'Not in ledger', glyph: '!', tone: 'warn' });
    expect(statusMeta('AMOUNT_MISMATCH')).toEqual({ word: 'Amounts differ', glyph: '!', tone: 'warn' });
    expect(statusMeta('OTHER_MONTH')).toEqual({ word: 'Another month', glyph: '!', tone: 'warn' });
    expect(statusMeta('ROLLUP')).toEqual({ word: 'Roll-up of card spend', glyph: '·', tone: 'muted' });
    expect(statusMeta('ATM_CASH')).toEqual({ word: 'ATM cash', glyph: '·', tone: 'muted' });
    expect(statusMeta('INQUIRY')).toEqual({ word: 'Balance inquiry', glyph: '·', tone: 'muted' });
    expect(statusMeta('NO_CARD_TXN')).toEqual({ word: 'No card transaction', glyph: '!', tone: 'warn' });
    expect(statusMeta('DUPLICATE')).toEqual({ word: 'Duplicate copy', glyph: '=', tone: 'muted' });
  });
  test('duplicate copies get their own receipt filter', () => {
    expect(RECEIPT_FILTERS.map(f => f.key)).toContain('DUPLICATE');
  });
  test('falls back to the raw status, and an em dash for null', () => {
    expect(statusMeta('WEIRD')).toEqual({ word: 'WEIRD', glyph: '·', tone: 'muted' });
    expect(statusMeta('constructor')).toEqual({ word: 'constructor', glyph: '·', tone: 'muted' });
    expect(statusMeta(null)).toEqual({ word: '—', glyph: '·', tone: 'muted' });
  });
});

describe('counts, filters and sort', () => {
  test('countByStatus includes ALL', () => {
    expect(countByStatus(REPORT.rows)).toEqual({ ALL: 3, MATCHED: 1, MISSING_RECEIPT: 1, REVIEW: 1 });
    expect(countByStatus(REPORT.receipts)).toEqual({ ALL: 4, LINKED: 2, REVIEW: 1, ORPHAN: 1 });
  });
  test('filterRows by status and by query over merchant, ref and amount', () => {
    expect(filterRows(REPORT.rows, 'ALL', '').map(r => r.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(filterRows(REPORT.rows, 'MATCHED', '').map(r => r.ref)).toEqual(['r1']);
    expect(filterRows(REPORT.rows, 'ALL', 'othaim').map(r => r.ref)).toEqual(['r2']);
    expect(filterRows(REPORT.rows, 'ALL', 'R3').map(r => r.ref)).toEqual(['r3']);
    expect(filterRows(REPORT.rows, 'ALL', '75.5').map(r => r.ref)).toEqual(['r3']);
    expect(filterRows(REPORT.rows, 'REVIEW', 'othaim')).toEqual([]);
  });
  test('filterReceipts', () => {
    expect(filterReceipts(REPORT.receipts, 'REVIEW').map(g => g.id)).toEqual(['p3-g1']);
    expect(filterReceipts(REPORT.receipts, 'ALL')).toHaveLength(4);
  });
  test('sortRows by date (time tiebreak) and by amount, both directions, without mutating', () => {
    const before = REPORT.rows.map(r => r.ref);
    expect(sortRows(REPORT.rows, 'date', 'asc').map(r => r.ref)).toEqual(['r3', 'r2', 'r1']);
    expect(sortRows(REPORT.rows, 'date', 'desc').map(r => r.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(sortRows(REPORT.rows, 'amount', 'asc').map(r => r.ref)).toEqual(['r2', 'r3', 'r1']);
    expect(sortRows(REPORT.rows, 'amount', 'desc').map(r => r.ref)).toEqual(['r1', 'r3', 'r2']);
    expect(REPORT.rows.map(r => r.ref)).toEqual(before);
  });
});

describe('formatting and geometry', () => {
  test('money and pct', () => {
    expect(money(1234.5)).toBe('1,234.50');
    expect(money(0)).toBe('0.00');
    expect(money(null)).toBe('');
    expect(pct(100, 150)).toBe('67%');
    expect(pct(1, 0)).toBe('0%');
  });
  test('boxStyle converts 0-1000 space to percentages', () => {
    expect(boxStyle([100, 100, 500, 900])).toEqual({ left: '10%', top: '10%', width: '40%', height: '80%' });
  });
  test('imageUrl', () => {
    expect(imageUrl('kb-1', 'pages/page-01.png')).toBe('/api/petty-cash/kb-1/pages/page-01.png');
  });
});

describe('paneSources', () => {
  test('a row brings its statement strip, its receipts and its ledger line', () => {
    const s = paneSources(REPORT, { kind: 'row', ref: 'r1', source: 'receipt', index: 1 });
    expect(s?.title).toBe('2026-09-05 · 100.00 · GREEN STAR FUEL');
    expect(s?.statement).toHaveLength(1);
    expect(s?.receipts.map(c => c.group_id)).toEqual(['p1-g1', 'p2-g1']);
    expect(s?.ledger?.cell).toBe('B9');
    expect(s?.index).toBe(1);
  });
  test('a row without receipts or ledger has empty receipts and a null ledger, index defaults to 0', () => {
    const s = paneSources(REPORT, { kind: 'row', ref: 'r3', source: 'statement' });
    expect(s?.receipts).toEqual([]);
    expect(s?.ledger).toBeNull();
    expect(s?.index).toBe(0);
  });
  test('a linked group brings the statement rows it is linked to and their ledger line', () => {
    const s = paneSources(REPORT, { kind: 'receipt', id: 'p1-g1', source: 'receipt' });
    expect(s?.title).toBe('Shop p1-g1 · p1');
    expect(s?.receipts.map(c => c.group_id)).toEqual(['p1-g1']);
    expect(s?.statement.map(c => c.crop)).toEqual(['crops/stmt-r1.png']);
    expect(s?.ledger?.code).toBe('ROLL');
  });
  test('an undecided group brings its candidate rows in report order', () => {
    const s = paneSources(REPORT, { kind: 'receipt', id: 'p3-g1', source: 'receipt' });
    expect(s?.statement.map(c => c.crop)).toEqual(['crops/stmt-r2.png', 'crops/stmt-r3.png']);
    expect(s?.ledger?.cell).toBe('B9');
  });
  test('an orphan group has no statement or ledger; unknown ids return null', () => {
    const s = paneSources(REPORT, { kind: 'receipt', id: 'p4-g1', source: 'receipt' });
    expect(s?.statement).toEqual([]);
    expect(s?.ledger).toBeNull();
    expect(paneSources(REPORT, { kind: 'row', ref: 'nope', source: 'statement' })).toBeNull();
    expect(paneSources(REPORT, { kind: 'receipt', id: 'nope', source: 'receipt' })).toBeNull();
  });
  test('rowByRef', () => {
    expect(rowByRef(REPORT, 'r2')?.amount).toBe(50);
    expect(rowByRef(REPORT, 'zz')).toBeUndefined();
  });
});

describe('reconcile', () => {
  const line = (code: string, row: number, debit: number | null, credit: number | null, month = '2026-09'): LedgerLine =>
    ({ code, date: `${month}-01`, text: code, debit, credit, balance: null, month, row, cell: `B${row}`, status: null });
  // Card: opens 100.01, loads 500, spends 100 + 50 + 75.5 + 75 on purchases and 40 at the ATM, closes 259.51.
  // Ledger: opens 100.00, tops up 500, books a 25.00 entry the card never saw and a 600.00 roll-up, closes -25.00.
  const R: PettyReport = {
    ...REPORT,
    kpis: { ...REPORT.kpis, card_closing: 259.51, ledger_closing: -25 },
    rows: [
      ...REPORT.rows,
      { ...REPORT.rows[1], ref: 'l1', kind: 'load', amount: 500, status: 'TIED' },
      { ...REPORT.rows[1], ref: 'a1', kind: 'atm', amount: 40, status: 'ATM_CASH' },
      { ...REPORT.rows[0], ref: 'x0', amount: 75, status: 'MATCHED' },
    ],
    receipts: [
      { ...REPORT.receipts[0], id: 'c1', status: 'CASH', total: 90, refs: [] },
      { ...REPORT.receipts[0], id: 'c2', status: 'CASH', total: null, amounts: [12.5], refs: [] },
      { ...REPORT.receipts[0], id: 'o1', status: 'OTHER_CARD', total: 30, refs: [] },
      { ...REPORT.receipts[0], id: 'l1', status: 'LINKED' },
    ],
    ledger: [line('TOP', 1, 500, null), line('X', 2, null, 25), line('ROLL', 3, null, 600), line('OLD', 9, null, 999, '2026-08')],
    tieout: { ...REPORT.tieout, purchases_vs_rollup: { ...REPORT.tieout.purchases_vs_rollup, rollup_codes: ['ROLL'] } },
  };

  test('items add to the gap and the remainder is unreconciled', () => {
    const rec = reconcile(R)!;
    expect(rec.difference).toBe(284.51);
    expect(rec.cardOpening).toBe(100.01);
    expect(rec.ledgerOpening).toBe(100);
    // every evidenced reason is an item: the card payment with no receipt (r2, 50.00) takes from the gap, so it no longer hides in the remainder
    expect(rec.items.map(i => [i.key, i.amount])).toEqual([
      ['opening', 0.01], ['money_in', 0], ['other_card', 30], ['unpaid', 0], ['cash', 62.5], ['no_receipt', -50], ['differences', 0], ['other_credits', 25],
    ]);
    expect(rec.explained).toBe(67.51);
    expect(rec.unreconciled).toBe(217);   // 284.51 - 67.51
    expect(rec.items.find(i => i.key === 'no_receipt')).toMatchObject({ state: 'action', go: { section: 'transactions', tab: 'transactions', filter: 'MISSING_RECEIPT' } });
    expect(rec.otherCredits.map(l => l.code)).toEqual(['X']);
    expect(rec.undecided).toBe(0);
  });

  test('a receipt with no total falls back to its first amount', () => {
    expect(reconcile(R)!.cash).toEqual({ count: 2, amount: 102.5 });
  });

  test('reports without closings have no reconciliation', () => {
    expect(reconcile(REPORT)).toBeNull();
  });

  test('findings rank high before medium, then by amount', () => {
    const fs = findings(R, reconcile(R)!);
    expect(fs.map(f => [f.key, f.severity, f.amount])).toEqual([
      ['unreconciled', 'high', 217],   // 217 of 340.50 card spend: far over 5%
      ['cash', 'high', 62.5],
      ['other_card', 'high', 30],
      ['missing', 'medium', 50],
      ['other_credits', 'medium', 25],
      ['lump_sum', 'low', null],   // process finding: no amount at risk
    ]);
    expect(severityCounts(fs)).toEqual({ high: 3, medium: 2, low: 1 });
    // every finding but the process one says where it is fixed
    expect(fs.filter(f => !f.go).map(f => f.key)).toEqual(['lump_sum']);
    expect(fs.find(f => f.key === 'cash')!.evidence.map(e => e.amount)).toEqual([40, 90, 12.5]);   // the ATM withdrawal on the statement, then the cash receipts
  });

  test('every piece of evidence opens its sources', () => {
    const fs = findings(R, reconcile(R)!);
    const ev = (key: string) => fs.find(f => f.key === key)!.evidence;
    expect(ev('cash').map(e => e.select)).toEqual([
      { kind: 'row', ref: 'a1', source: 'statement' }, { kind: 'receipt', id: 'c1', source: 'receipt' }, { kind: 'receipt', id: 'c2', source: 'receipt' },
    ]);
    expect(ev('missing')[0].select).toEqual({ kind: 'row', ref: 'r2', source: 'statement' });
    expect(ev('other_credits')[0].select).toEqual({ kind: 'ledger', code: 'X', source: 'ledger' });
    expect(ev('lump_sum').map(e => e.select)).toEqual([{ kind: 'ledger', code: 'ROLL', source: 'ledger' }]);
    expect(ev('unreconciled').map(e => e.label)).toEqual(['ROLL · B3']);
  });

  test('pane sources for a ledger entry and for a receipt paid off the card', () => {
    const led = paneSources(R, { kind: 'ledger', code: 'X', source: 'ledger' })!;
    expect(led.statement).toEqual([]);
    expect(led.receipts).toEqual([]);
    expect(led.ledger).toMatchObject({ code: 'X', cell: 'B2', amount: 25, relation: 'no card payment behind it' });
    expect(paneSources(R, { kind: 'ledger', code: 'OLD', source: 'ledger' })).toBeNull();   // another month's entry
    const cash = paneSources(R, { kind: 'receipt', id: 'c1', source: 'receipt' })!;
    expect(cash.receipts).toHaveLength(1);
    expect(cash.ledger).toMatchObject({ code: 'ROLL', relation: 'inside this roll-up, which has no line detail' });
    // a receipt with no card row that was not paid off the card gets no ledger guess
    const orphan = { ...R, receipts: [...R.receipts, { ...REPORT.receipts[0], id: 'z', status: 'ORPHAN', refs: [] }] };
    expect(paneSources(orphan, { kind: 'receipt', id: 'z', source: 'receipt' })!.ledger).toBeNull();
  });

  test('receipts the card did not pay are named and counted; duplicates and small differences too', () => {
    const r = {
      ...R,
      rows: [...R.rows, { ...REPORT.rows[0], ref: 'd1', amount: 20.5, status: 'AMOUNT_MISMATCH', receipt_ids: ['l1'], difference: 0.5 }],
      receipts: [...R.receipts, { ...REPORT.receipts[0], id: 'q', status: 'ORPHAN', total: 12 }, { ...REPORT.receipts[0], id: 'dup', status: 'DUPLICATE', total: 44 }],
    };
    const rec = reconcile(r)!;
    const fs = findings(r, rec);
    expect(fs.find(f => f.key === 'unpaid')).toMatchObject({ severity: 'high', title: '1 receipts the card didn\u2019t pay', amount: 12, go: { section: 'review' } });
    expect(rec.items.find(i => i.key === 'unpaid')!.amount).toBe(12);
    expect(rec.items.find(i => i.key === 'differences')!.amount).toBe(-0.5);   // the card paid 0.50 more than the invoice
    expect(fs.find(f => f.key === 'duplicates')).toMatchObject({ severity: 'medium', amount: 44 });
    expect(fs.find(f => f.key === 'differ')).toMatchObject({ severity: 'low', amount: 0.5 });   // card 20.50 vs receipt 20.00
  });

  test('a small unexplained remainder is low risk', () => {
    // card spend 340.50; raising the other-card receipt to 244 leaves 3.00 unexplained, under 1%
    const r = { ...R, receipts: R.receipts.map(g => (g.id === 'o1' ? { ...g, total: 244 } : g)) };
    expect(findings(r, reconcile(r)!).find(f => f.key === 'unreconciled')).toMatchObject({ severity: 'low', amount: 3 });
  });

  test('applyDisplay renames statement merchants and receipts, and keeps the statement text', () => {
    const shown = applyDisplay({ ...R, meta: { ...R.meta, display: { merchants: { 'AL OTHAIM': 'Al Othaim Markets' }, receipts: { c1: 'Alwan Paint' } } } });
    expect(shown.rows.find(r => r.ref === 'r2')).toMatchObject({ merchant: 'Al Othaim Markets', merchant_raw: 'AL OTHAIM' });
    expect(shown.rows.find(r => r.ref === 'r1')!.merchant_raw).toBeUndefined();   // not in the list: untouched
    expect(shown.receipts.find(g => g.id === 'c1')!.merchant).toBe('Alwan Paint');
    expect(applyDisplay(R)).toBe(R);   // no display section: the same report
  });

  test('payment sources: the petty-cash card from its slips, cash against the ATM, other cards by number', () => {
    const slip = (id: string, ref: string, first6: string | null, last4: string) => ({ ...REPORT.receipts[0], id, refs: [ref], card: { first6, last4 } });
    const r: PettyReport = {
      ...R,
      receipts: [
        ...R.receipts.map(g => (g.id === 'o1' ? { ...g, card: { first6: '440795', last4: '3630' } } : g)),
        slip('s1', 'r1', '513213', '6879'), slip('s2', 'x0', null, '6879'), slip('s3', 'r1', null, '8679'),
        { ...REPORT.receipts[0], id: 'o2', status: 'OTHER_CARD', total: 741, refs: [], card: null },
      ],
    };
    const p = paymentSources(r, reconcile(r)!);
    expect(p.sources.map(s => [s.key, s.number, s.network, s.amount])).toEqual([
      ['petty', '513213 •••••• 6879', 'Mastercard', 340.5],
      ['cash', null, null, 102.5],
      ['other-3630', '440795 •••••• 3630', 'Visa', 30],
      ['other-unknown', null, null, 741],
    ]);
    expect(p.sources[0].tie).toContain('1 more slip reads 8679, most likely a misread of 6879');
    expect(p.sources[1].tie).toBe('40.00 came from ATM withdrawals on the petty-cash card; the other 62.50 has no recorded source.');
    expect(p.found).toBe(300.5 + 102.5 + 771);   // card purchases + cash + other cards
    expect(p.notFound).toBe(reconcile(r)!.unreconciled);
  });

  test('difference reasons: VAT, rounding, or no information', () => {
    const at = (amount: number, total: number) => {
      const r = { ...R, receipts: [{ ...REPORT.receipts[0], id: 'g', total }] };
      return differenceReason({ ...REPORT.rows[0], amount, receipt_ids: ['g'] }, r);
    };
    expect(at(100, 115)).toBe('VAT not included: the receipt is 115.00 with 15% VAT; the card paid 100.00, the amount before VAT.');
    expect(at(115, 100)).toBe('VAT added at the till: the receipt shows 100.00 before VAT; the card paid 115.00, the amount with 15% VAT.');
    expect(at(316, 316.25)).toBe('Rounded down to the whole riyal: the receipt is 316.25, the card paid 316.00. The 0.25 difference is rounding.');
    expect(at(23, 21)).toBe('No information: the card paid 2.00 more than the receipt (21.00), and the receipt shows no reason.');
  });

  test('row notes say what each row was tied to', () => {
    const n = (row: Partial<StatementRow>) => rowNote({ ...REPORT.rows[0], ...row } as StatementRow, REPORT);
    expect(n({ status: 'MISSING_RECEIPT' })).toBe('No receipt in the pack has this amount within a day of the payment.');
    expect(n({ status: 'TIED' })).toBe('Card top-up, booked in the ledger as ROLL (B9).');
    expect(n({ status: 'MATCHED', receipt_ids: ['p1-g1'], date: '2026-09-04' })).toBe('Matched to receipt p1: same amount, same day.');
    expect(n({ status: 'MATCHED', receipt_ids: ['p1-g1'], date: '2026-09-05' })).toBe('Matched to receipt p1: same amount, receipt dated 4 Sep 2026.');
    expect(n({ status: 'MATCHED', receipt_ids: ['p1-g1'], reason: 'receipt p1-g1 p1 (split payment: 8.00 + 12.00)' }))
      .toBe('One receipt (p1, 20.00) paid in 2 card payments: 8.00 + 12.00.');
    expect(n({ status: 'SOMETHING_NEW' })).toBe('No information.');
  });

  test('fmtDate is the same everywhere', () => {
    expect(fmtDate('2026-09-07')).toBe('7 Sep 2026');
    expect(fmtDate('2026-10-25T09:30:00')).toBe('25 Oct 2026');
  });

  test('acct and monthEnd', () => {
    expect(acct(-1272.31)).toBe('(1,272.31)');
    expect(acct(5)).toBe('5.00');
    expect(monthEnd('2026-09')).toBe('30 Sep 2026');
    expect(monthEnd('2024-02')).toBe('29 Feb 2024');
  });
});
