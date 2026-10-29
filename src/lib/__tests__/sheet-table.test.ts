import { test, expect } from 'bun:test';
import { parseSheetTable, buildSheetGrids, colLabel } from '../sheet-table';

test('parseSheetTable: headers, separator skipped, empty cells kept, text never interpreted', () => {
  const md = [
    'Sheet: General Ledger',
    'Range: A2:I41',
    '',
    '| Code | Account Name | Date |',
    '| --- | --- | --- |',
    '|  |  |  |',
    '| 100000 | PETTY CASH <b>x</b> | 04/01/2026 |',
  ].join('\n');
  const t = parseSheetTable(md);
  expect(t.sheet).toBe('General Ledger');
  expect(t.range).toBe('A2:I41');
  expect(t.rows).toEqual([
    ['Code', 'Account Name', 'Date'],
    ['', '', ''],
    ['100000', 'PETTY CASH <b>x</b>', '04/01/2026'],
  ]);
  expect(parseSheetTable('no table here').rows).toEqual([]);
});

test('buildSheetGrids: chunks merge at real cell positions, placeholders blank, sheets ordered', () => {
  const chunk = (sheet: string, idx: number, startRow: number, startCol: number, body: string[]) => ({
    markdown: ['| Column 1 | Title |', '| --- | --- |', ...body].join('\n'),
    coordinates: { sheetName: sheet, sheetIndex: idx, startRow, startCol, endRow: startRow + body.length - 1, endCol: startCol + 1 },
  });
  const grids = buildSheetGrids([
    chunk('Filters', 2, 2, 1, ['| x | y |']),
    chunk('Ledger', 1, 2, 2, ['| a | b |', '| c | d |']),
    chunk('Ledger', 1, 4, 2, ['| e | f |']),
    { markdown: 'no coordinates', coordinates: undefined },
  ]);
  expect(grids.map(g => g.name)).toEqual(['Ledger', 'Filters']);
  const ledger = grids[0];
  expect(ledger.maxCol).toBe(3);
  expect(ledger.cells).toEqual([
    ['', '', 'Title'],   // row 1: header, "Column 1" blanked, placed from column B
    ['', 'a', 'b'],
    ['', 'c', 'd'],
    ['', 'e', 'f'],      // second chunk continues at row 4
  ]);
  expect(colLabel(1)).toBe('A');
  expect(colLabel(26)).toBe('Z');
  expect(colLabel(27)).toBe('AA');
});
