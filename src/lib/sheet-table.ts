/**
 * Rebuilds spreadsheet grids from DocAI's spreadsheet segments.
 *
 * DocAI splits each sheet into ~40-row range segments. Each segment's
 * markdown is a pipe table:
 *
 *   Sheet: General Ledger
 *   Range: A42:I81
 *
 *   | Column 1 | Column 2 | From 04/01/2026 … |   <- sheet row 1 (header), repeated per chunk;
 *   | --- | --- | --- |                            "Column N" is DocAI's placeholder for a blank cell
 *   | 100000 | PETTY CASH | 04/01/2026 |           <- sheet row startRow, then startRow+1, …
 *
 * and `coordinates` carries sheetName / startRow / startCol / endRow / endCol.
 * Cells are plain text (DocAI escapes nothing); callers render them as text,
 * never as HTML.
 */

export interface SheetTable {
  sheet: string;
  range: string;
  rows: string[][];
}

export interface SheetSegment {
  markdown?: string;
  coordinates?: {
    sheetName?: string;
    sheetIndex?: number;
    startRow?: number;
    startCol?: number;
    endRow?: number;
    endCol?: number;
  };
}

/** One sheet as a dense grid: cells[r][c] is 0-based (sheet row r+1, column c+1). */
export interface SheetGrid {
  name: string;
  cells: string[][];
  maxCol: number;
}

const SEPARATOR_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const PLACEHOLDER_RE = /^Column \d+$/;

export function parseSheetTable(markdown: string): SheetTable {
  const rows: string[][] = [];
  let sheet = '';
  let range = '';
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('Sheet:')) sheet = line.slice(6).trim();
    else if (line.startsWith('Range:')) range = line.slice(6).trim();
    else if (line.startsWith('|') && !SEPARATOR_RE.test(line)) {
      rows.push(line.slice(1, line.endsWith('|') ? -1 : undefined).split('|').map(c => c.trim()));
    }
  }
  return { sheet, range, rows };
}

/** 1 -> A, 26 -> Z, 27 -> AA. */
export function colLabel(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/** Merges range segments back into one grid per sheet, in sheet order. */
export function buildSheetGrids(segments: SheetSegment[]): SheetGrid[] {
  const grids = new Map<string, SheetGrid & { index: number }>();
  for (const seg of segments) {
    const c = seg.coordinates;
    if (!c?.sheetName || !c.startRow || !c.startCol) continue;
    const { rows } = parseSheetTable(seg.markdown || '');
    if (rows.length === 0) continue;
    let grid = grids.get(c.sheetName);
    if (!grid) {
      grid = { name: c.sheetName, cells: [], maxCol: 0, index: c.sheetIndex ?? grids.size };
      grids.set(c.sheetName, grid);
    }
    const put = (rowNum: number, values: string[]) => {
      const r = rowNum - 1;
      grid!.cells[r] ??= [];
      values.forEach((v, i) => { grid!.cells[r][c.startCol! - 1 + i] = v; });
      grid!.maxCol = Math.max(grid!.maxCol, c.startCol! - 1 + values.length);
    };
    // ponytail: the header row is sheet row 1 only when the chunk starts below it;
    // a chunk starting at row 1 would have no separate header — not seen from DocAI yet.
    put(1, rows[0].map(v => (PLACEHOLDER_RE.test(v) ? '' : v)));
    rows.slice(1).forEach((values, i) => put(c.startRow! + i, values));
  }
  return [...grids.values()]
    .sort((a, b) => a.index - b.index)
    .map(({ name, cells, maxCol }) => ({
      name,
      maxCol,
      cells: Array.from(cells, row => Array.from({ length: maxCol }, (_, i) => row?.[i] ?? '')),
    }));
}
