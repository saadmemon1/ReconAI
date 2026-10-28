import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findFolderForKb, isAllowedReportPath, canAccessKb } from '../petty-cash';

const KB = '1cd041cc-d3a8-4c35-bf70-ac4ad8f72c5a';
let data: string;

beforeAll(() => {
  data = mkdtempSync(join(tmpdir(), 'petty-'));
  mkdirSync(join(data, 'abujhd'));
  writeFileSync(join(data, 'abujhd', 'config.json'), JSON.stringify({ kb_id: KB, month: '2026-09' }));
  mkdirSync(join(data, 'other'));
  writeFileSync(join(data, 'other', 'config.json'), JSON.stringify({ kb_id: 'zzz' }));
  mkdirSync(join(data, 'nokb'));
  writeFileSync(join(data, 'nokb', 'config.json'), JSON.stringify({ month: '2026-08' }));
  mkdirSync(join(data, 'broken'));
  writeFileSync(join(data, 'broken', 'config.json'), '{not json');
  writeFileSync(join(data, 'stray.txt'), 'x');
});
afterAll(() => rmSync(data, { recursive: true, force: true }));

describe('findFolderForKb', () => {
  test('returns the folder whose config.json carries the kb_id', () => {
    expect(findFolderForKb(data, KB)).toBe(join(data, 'abujhd'));
  });
  test('ignores folders with another or no kb_id, broken configs, and stray files', () => {
    expect(findFolderForKb(data, 'nope')).toBeNull();
  });
  test('tolerates a missing data dir', () => {
    expect(findFolderForKb(join(data, 'missing'), KB)).toBeNull();
  });
});

describe('isAllowedReportPath', () => {
  test('accepts the report, the review decisions and the two image folders', () => {
    expect(isAllowedReportPath(['report.json'])).toBe(true);
    expect(isAllowedReportPath(['reviews.json'])).toBe(true);
    expect(isAllowedReportPath(['pages', 'page-01.png'])).toBe(true);
    expect(isAllowedReportPath(['crops', 'stmt-624417160330.png'])).toBe(true);
  });
  test('rejects traversal, nesting, other names and extensions', () => {
    expect(isAllowedReportPath(['..', 'config.json'])).toBe(false);
    expect(isAllowedReportPath(['pages', '..', 'config.json'])).toBe(false);
    expect(isAllowedReportPath(['pages', 'a', 'b.png'])).toBe(false);
    expect(isAllowedReportPath(['config.json'])).toBe(false);
    expect(isAllowedReportPath(['report.html'])).toBe(false);
    expect(isAllowedReportPath(['pages', 'x.svg'])).toBe(false);
    expect(isAllowedReportPath(['pages', 'a%2f.png'])).toBe(false);
    expect(isAllowedReportPath([])).toBe(false);
  });
});

describe('canAccessKb', () => {
  const list = (body: unknown, ok = true) => async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
  // the cache is keyed by kb + last 8 chars of the key, so every case gets its own key
  test('true when the workspace list contains the id', async () => {
    expect(await canAccessKb(KB, 'key-aaaaaaaa', list({ knowledge_bases: [{ id: 'x' }, { id: KB }] }))).toBe(true);
  });
  test('false when it does not', async () => {
    expect(await canAccessKb(KB, 'key-bbbbbbbb', list({ knowledge_bases: [{ id: 'x' }] }))).toBe(false);
  });
  test('false on a non-ok response and on a throw', async () => {
    expect(await canAccessKb(KB, 'key-cccccccc', list({ knowledge_bases: [{ id: KB }] }, false))).toBe(false);
    expect(await canAccessKb(KB, 'key-dddddddd', async () => { throw new Error('down'); })).toBe(false);
  });
  test('a second call inside the TTL does not hit DocAI again', async () => {
    let calls = 0;
    const counted = async () => { calls++; return new Response(JSON.stringify({ knowledge_bases: [{ id: KB }] })); };
    expect(await canAccessKb(KB, 'key-eeeeeeee', counted)).toBe(true);
    expect(await canAccessKb(KB, 'key-eeeeeeee', counted)).toBe(true);
    expect(calls).toBe(1);
  });
  test('keys that share their last 8 characters do not share a cached verdict', async () => {
    const kb = 'kb-suffix-collision';
    let calls = 0;
    const listing = (ids: string[]) => async () => { calls++; return new Response(JSON.stringify({ knowledge_bases: ids.map(id => ({ id })) })); };
    expect(await canAccessKb(kb, 'aaaa-SAMESUFF', listing([kb]))).toBe(true);
    expect(await canAccessKb(kb, 'bbbb-SAMESUFF', listing(['other']))).toBe(false);
    expect(calls).toBe(2);
  });
  test('a throwing lookup is not cached: the next ok lookup for the same key decides', async () => {
    const kb = 'kb-transient-failure';
    let calls = 0;
    const down = async () => { calls++; throw new Error('down'); };
    const up = async () => { calls++; return new Response(JSON.stringify({ knowledge_bases: [{ id: kb }] })); };
    expect(await canAccessKb(kb, 'key-ffffffff', down)).toBe(false);
    expect(await canAccessKb(kb, 'key-ffffffff', up)).toBe(true);
    expect(calls).toBe(2);
  });
});

import { parseRunSummary } from '../petty-cash';

describe('parseRunSummary', () => {
  test("reads b_match's two summary lines into counts", () => {
    const out = "rows: {'MATCHED': 76, 'REVIEW': 14, 'MISSING_RECEIPT': 9, 'UNEXPLAINED': 19, 'TIED': 6, 'AMOUNT_MISMATCH': 5}\nreceipts: {'LINKED': 79, 'ORPHAN': 67, 'REVIEW': 26}\ntieout: {...}\nREVIEW p05-g2 [...]\n";
    expect(parseRunSummary(out)).toEqual({
      rows: { MATCHED: 76, REVIEW: 14, MISSING_RECEIPT: 9, UNEXPLAINED: 19, TIED: 6, AMOUNT_MISMATCH: 5 },
      receipts: { LINKED: 79, ORPHAN: 67, REVIEW: 26 },
    });
  });
  test('tolerates missing or malformed lines', () => {
    expect(parseRunSummary('')).toEqual({ rows: {}, receipts: {} });
    expect(parseRunSummary('rows: not a dict\n')).toEqual({ rows: {}, receipts: {} });
  });
});
