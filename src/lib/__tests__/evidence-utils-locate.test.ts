import { describe, test, expect } from 'bun:test';
import {
  normalizeMatchText,
  extractCitationNeedle,
  extractCitationReason,
  stripCitationReason,
  locateCitation,
  locateCitations,
  segmentRowBox,
  type SegmentLike,
} from '../evidence-utils';

// Fixture modeled on the real chunks.json (invoice with a table segment).
const segments: SegmentLike[] = [
  {
    id: 'p1_e0003',
    title: 'text',
    markdown: 'Invoice No: BGT-2606-097',
    coordinates: { pageNumber: 1, xmin: 57, ymin: 125, xmax: 251, ymax: 139 },
  },
  {
    id: 'p1_e0006',
    title: 'table',
    markdown: '<table><tr><td>Amount(PKR) 76,000</td></tr></table>',
    coordinates: { pageNumber: 1, xmin: 62, ymin: 237, xmax: 953, ymax: 462 },
    cells: [
      { row: 0, col: 0, text: 'S# 1', isHeader: true, pixel_bbox: [85, 317, 223, 345] },
      { row: 0, col: 5, text: '76,000', isHeader: true, pixel_bbox: [776, 345, 914, 380] },
      { row: 1, col: 5, text: '185,000', pixel_bbox: [776, 380, 914, 405] },
      { row: 2, col: 5, text: 'Sub Total', isHeader: true, pixel_bbox: [776, 405, 914, 444] },
      { row: 4, col: 5, text: '294,930', pixel_bbox: [776, 444, 914, 481] },
    ],
  },
  {
    id: 'p1_e0007',
    title: 'table',
    markdown:
      '<table border="1"><tr><td>#</td><td>Item Description</td><td>Qty</td><td>UoM</td><td>Unit Price(PKR)</td><td>Amount(PKR)</td></tr><tr><td>1</td><td>Custom Ceramic Mugs with Company Logo(350ml,White)</td><td>16</td><td>Units</td><td>470.00</td><td>7,520.00</td></tr></table>',
    coordinates: { pageNumber: 1, xmin: 60, ymin: 240, xmax: 950, ymax: 470 },
    cells: [
      { row: 0, col: 0, text: '#', isHeader: true, pixel_bbox: [85, 317, 223, 345] },
      { row: 0, col: 1, text: 'Item Description', isHeader: true, pixel_bbox: [223, 317, 361, 345] },
      { row: 0, col: 2, text: 'Qty', isHeader: true, pixel_bbox: [361, 317, 500, 345] },
      { row: 0, col: 3, text: 'UoM', isHeader: true, pixel_bbox: [500, 317, 638, 345] },
      { row: 0, col: 4, text: 'Unit Price(PKR)', isHeader: true, pixel_bbox: [638, 317, 776, 345] },
      { row: 0, col: 5, text: 'Amount(PKR)', isHeader: true, pixel_bbox: [776, 317, 914, 345] },
      { row: 1, col: 0, text: '1', pixel_bbox: [85, 345, 223, 380] },
      { row: 1, col: 1, text: 'Custom Ceramic Mugs with Company Logo(350ml,White)', pixel_bbox: [223, 345, 361, 380] },
      { row: 1, col: 2, text: '16', pixel_bbox: [361, 345, 500, 380] },
      { row: 1, col: 3, text: 'Units', pixel_bbox: [500, 345, 638, 380] },
      { row: 1, col: 4, text: '470.00', pixel_bbox: [638, 345, 776, 380] },
      { row: 1, col: 5, text: '7,520.00', pixel_bbox: [776, 345, 914, 380] },
    ],
  },
  {
    id: 'p2_e0000',
    title: 'text',
    markdown: 'GRAND TOTAL 294,930',
    coordinates: { pageNumber: 2, xmin: 100, ymin: 50, xmax: 400, ymax: 70 },
  },
];

describe('normalizeMatchText', () => {
  test('lowercases and collapses whitespace', () => {
    expect(normalizeMatchText('  Unit  Price:  470 ')).toBe('unit price: 470');
  });
});

describe('extractCitationNeedle', () => {
  test('prefers the longest quoted fragment', () => {
    expect(extractCitationNeedle("Invoice: line 5: 'Unit Price: 470'")).toBe('Unit Price: 470');
    expect(extractCitationNeedle('GRN says "185,000" (row 2)')).toBe('185,000');
  });

  test('falls back to the text after the last colon', () => {
    expect(extractCitationNeedle('Invoice: page 2, total')).toBe('page 2, total');
  });

  test('returns the whole string when there is no colon', () => {
    expect(extractCitationNeedle('total 294,930')).toBe('total 294,930');
  });
});

describe('locateCitation', () => {
  test('exact cell text match returns the cell pixel_bbox', () => {
    const loc = locateCitation("Table row 1: '76,000'", segments);
    expect(loc).not.toBeNull();
    expect(loc!.page).toBe(1);
    expect(loc!.x1).toBe(776);
    expect(loc!.y1).toBe(345);
    expect(loc!.x2).toBe(914);
    expect(loc!.y2).toBe(380);
    expect(loc!.segmentId).toBe('p1_e0006');
    expect(loc!.matchedText).toBe('76,000');
  });

  test('case/whitespace-insensitive cell match', () => {
    const loc = locateCitation("row: ' 185,000 '", segments);
    expect(loc).not.toBeNull();
    expect(loc!.matchedText).toBe('185,000');
  });

  test('segment markdown contains the needle → segment box in 1000-space', () => {
    const loc = locateCitation("Invoice: 'Invoice No: BGT-2606-097'", segments);
    expect(loc).not.toBeNull();
    expect(loc!.page).toBe(1);
    expect(loc!.segmentId).toBe('p1_e0003');
    expect(loc!.x1).toBe(57);
    expect(loc!.y2).toBe(139);
  });

  test('cell fragment match (needle is a value inside a cell)', () => {
    const loc = locateCitation("Invoice: '294,930'", segments);
    expect(loc).not.toBeNull();
    expect(loc!.matchedText).toBe('294,930');
  });

  test('prefers exact cell over segment-contains', () => {
    // '294,930' exists as a cell AND inside the page-2 segment markdown —
    // the exact cell match must win.
    const loc = locateCitation("Invoice: '294,930'", segments);
    expect(loc!.segmentId).toBe('p1_e0006');
    expect(loc!.page).toBe(1);
  });

  test('uses bbox×1000, NOT pixel_bbox, when they disagree (invoice-style cells)', () => {
    const invoiceSegs: SegmentLike[] = [
      {
        id: 'p1_e0000',
        title: 'table',
        markdown: '<table><tr><td>S# 1</td><td>Date 03-Jun-26</td><td>Amount(PKR) 76,000</td></tr></table>',
        coordinates: { pageNumber: 1, xmin: 62, ymin: 237, xmax: 953, ymax: 462 },
        cells: [
          { row: 0, col: 0, text: 'S# 1', bbox: { x1: 0.0652, y1: 0.2453, x2: 0.0925, y2: 0.2621 }, pixel_bbox: [145, 767, 206, 819] },
          { row: 0, col: 2, text: '76,000', bbox: { x1: 0.7758, y1: 0.2453, x2: 0.914, y2: 0.2621 }, pixel_bbox: [1450, 767, 1900, 819] },
        ],
      },
    ];
    const loc = locateCitation("Table row 1: '76,000'", invoiceSegs);
    expect(loc).not.toBeNull();
    expect(loc!.x1).toBeCloseTo(775.8, 1); // bbox×1000 — not 1450 (pixel space)
    expect(loc!.y1).toBeCloseTo(245.3, 1);
    expect(loc!.x2).toBeCloseTo(914, 1);
    expect(loc!.y2).toBeCloseTo(262.1, 1);
  });

  test('grid-estimate segments re-estimate column boundaries from text length', () => {
    // DocAI splits grid-estimate tables into equal-width columns (the "16"
    // cell bbox×1000 = [361, 500], "470.00" = [638, 776]) which renders
    // narrow cells too wide and shifts later columns right. The sqrt-length
    // estimate must narrow "16" and move "470.00" left.
    const gridSeg: SegmentLike = {
      id: 'p1_e0008',
      title: 'table',
      markdown: '<table><tr><td>#</td><td>Item Description</td><td>Qty</td><td>UoM</td><td>Unit Price(PKR)</td><td>Amount(PKR)</td></tr><tr><td>1</td><td>Custom Ceramic Mugs with Company Logo(350ml,White)</td><td>16</td><td>Units</td><td>470.00</td><td>7,520.00</td></tr></table>',
      coordinates: { pageNumber: 1, xmin: 85, ymin: 317, xmax: 914, ymax: 481 },
      cellsSource: 'grid-estimate',
      cells: [
        { row: 0, col: 0, text: '#', isHeader: true, bbox: { x1: 0.085, y1: 0.317, x2: 0.2232, y2: 0.3455 } },
        { row: 0, col: 1, text: 'Item Description', isHeader: true, bbox: { x1: 0.2232, y1: 0.317, x2: 0.3613, y2: 0.3455 } },
        { row: 0, col: 2, text: 'Qty', isHeader: true, bbox: { x1: 0.3613, y1: 0.317, x2: 0.4995, y2: 0.3455 } },
        { row: 0, col: 3, text: 'UoM', isHeader: true, bbox: { x1: 0.4995, y1: 0.317, x2: 0.6377, y2: 0.3455 } },
        { row: 0, col: 4, text: 'Unit Price(PKR)', isHeader: true, bbox: { x1: 0.6377, y1: 0.317, x2: 0.7758, y2: 0.3455 } },
        { row: 0, col: 5, text: 'Amount(PKR)', isHeader: true, bbox: { x1: 0.7758, y1: 0.317, x2: 0.914, y2: 0.3455 } },
        { row: 1, col: 0, text: '1', bbox: { x1: 0.085, y1: 0.3455, x2: 0.2232, y2: 0.3797 } },
        { row: 1, col: 1, text: 'Custom Ceramic Mugs with Company Logo(350ml,White)', bbox: { x1: 0.2232, y1: 0.3455, x2: 0.3613, y2: 0.3797 } },
        { row: 1, col: 2, text: '16', bbox: { x1: 0.3613, y1: 0.3455, x2: 0.4995, y2: 0.3797 } },
        { row: 1, col: 3, text: 'Units', bbox: { x1: 0.4995, y1: 0.3455, x2: 0.6377, y2: 0.3797 } },
        { row: 1, col: 4, text: '470.00', bbox: { x1: 0.6377, y1: 0.3455, x2: 0.7758, y2: 0.3797 } },
        { row: 1, col: 5, text: '7,520.00', bbox: { x1: 0.7758, y1: 0.3455, x2: 0.914, y2: 0.3797 } },
      ],
    };
    const loc16 = locateCitation("invoice: '16'", [gridSeg])!;
    // '16' must be narrower than the ~139px equal-split (361→500).
    expect(loc16.x2 - loc16.x1).toBeLessThan(120);
    expect(loc16.y1).toBeCloseTo(345.5, 1); // row Y stays from bbox (detected rows)
    const loc470 = locateCitation("invoice: '470.00'", [gridSeg])!;
    // '470.00' must sit LEFT of the equal-split start (637.7) — the wide
    // description column pushes it back toward its true position.
    expect(loc470.x1).toBeLessThan(637.7);
    expect(loc470.x2 - loc470.x1).toBeGreaterThan(80); // still a real column
  });

  test('returns null when nothing matches', () => {
    expect(locateCitation("Invoice: 'nonexistent text zzz'", segments)).toBeNull();
  });

  test('matches ellipsis-truncated citations (LLM "... " quoting)', () => {
    // The exact failure the user hit: the LLM quotes a long row with "…"
    // between fragments — must still locate the segment.
    const loc = locateCitation(
      "07_INV-KPP-8831.pdf: invoice lines table, row 1: '# 1 Custom Ceramic Mugs with Company Logo ... Unit Price(PKR) 470.00 ... Amount(PKR) 7,520.00'",
      segments
    );
    expect(loc).not.toBeNull();
    expect(loc!.segmentId).toBe('p1_e0007');
    expect(loc!.page).toBe(1);
  });

  test('row-hint fallback: composite quote (header label + cell value) picks the value cell', () => {
    // "Qty 16" never appears verbatim — "Qty" is the header cell, "16" the
    // value cell. The fallback must highlight the "16" value cell (numeric
    // tokens are weighted double), not the whole row.
    const loc = locateCitation(
      "07_INV-KPP-8831.pdf: invoice lines table, row 1: 'Qty 16'",
      segments
    );
    expect(loc).not.toBeNull();
    expect(loc!.segmentId).toBe('p1_e0007');
    expect(loc!.x1).toBe(361);
    expect(loc!.y1).toBe(345);
    expect(loc!.x2).toBe(500);
    expect(loc!.y2).toBe(380);
    expect(loc!.matchedText).toBe('16');
  });

  test('row-hint fallback respects the 1-based/0-based ambiguity', () => {
    // "row 2" — try cells row 2 first (none), then row 1 → the data row.
    // 'Mugs 470.00' spans the description + price cells — the price cell
    // (numeric token, weighted double) wins.
    const loc = locateCitation(
      "Invoice: invoice lines table, row 2: 'Mugs 470.00'",
      segments
    );
    expect(loc).not.toBeNull();
    expect(loc!.segmentId).toBe('p1_e0007');
    expect(loc!.x1).toBe(638);
    expect(loc!.y2).toBe(380);
    expect(loc!.matchedText).toBe('470.00');
  });

  test('returns null for a too-short needle', () => {
    expect(locateCitation('Invoice: "a"', segments)).toBeNull();
  });

  test('skips segments without coordinates', () => {
    const noCoords: SegmentLike[] = [
      { id: 'x', markdown: '76,000', cells: [{ row: 0, col: 0, text: '76,000' }] },
    ];
    expect(locateCitation("'76,000'", noCoords)).toBeNull();
  });
});

describe('extractCitationReason / stripCitationReason ([reason: ...] suffix)', () => {
  test('extracts the reason from a citation with the suffix', () => {
    expect(
      extractCitationReason("Invoice: line 5: 'Unit Price: 470' [reason: price 470 vs PO 450]")
    ).toBe('price 470 vs PO 450');
  });

  test('null when no reason suffix (legacy citations)', () => {
    expect(extractCitationReason("Invoice: line 5: 'Unit Price: 470'")).toBeNull();
    expect(extractCitationReason('plain citation')).toBeNull();
  });

  test('case-insensitive reason marker', () => {
    expect(extractCitationReason("PO: row 1: '450' [REASON: agreed price]")).toBe('agreed price');
  });

  test('empty reason bracket → null', () => {
    expect(extractCitationReason("PO: row 1: '450' [reason:]")).toBeNull();
    expect(extractCitationReason("PO: row 1: '450' [reason:   ]")).toBeNull();
  });

  test('strip removes the suffix and trims', () => {
    expect(stripCitationReason("Invoice: line 5: 'Unit Price: 470' [reason: price 470 vs PO 450]")).toBe(
      "Invoice: line 5: 'Unit Price: 470'"
    );
  });

  test('strip is a no-op without the suffix', () => {
    expect(stripCitationReason("Invoice: line 5: 'Unit Price: 470'")).toBe(
      "Invoice: line 5: 'Unit Price: 470'"
    );
  });

  test('a [reason:] marker inside the quote is NOT treated as the suffix', () => {
    const cite = "PO: terms: 'see [reason: x] clause' [reason: binding clause]";
    expect(extractCitationReason(cite)).toBe('binding clause');
    expect(stripCitationReason(cite)).toBe("PO: terms: 'see [reason: x] clause'");
  });
});

describe('locateCitations', () => {
  test('splits located from misses', () => {
    const { located, misses } = locateCitations(
      ["row 1: '76,000'", "page 2: 'GRAND TOTAL 294,930'", "'nothing here'"],
      segments
    );
    expect(located).toHaveLength(2);
    expect(misses).toEqual(["'nothing here'"]);
  });
});

describe('segmentRowBox (full-row highlight expansion)', () => {
  test('returns the full-height band of the row containing the citation center', () => {
    // The '470.00' price cell of row 1 (x 638-776, y 345-380) — the row box
    // must span all six cells: x 85..914, and the full row band from the
    // row boundary up to the table bottom: y 345..470.
    const row = segmentRowBox(segments, {
      segmentId: 'p1_e0007',
      x1: 638, y1: 345, x2: 776, y2: 380,
    });
    expect(row).not.toBeNull();
    expect(row).toEqual({ x1: 85, y1: 345, x2: 914, y2: 470 });
  });

  test('resolves to the header row when the center is in it (band starts at the table top)', () => {
    const row = segmentRowBox(segments, {
      segmentId: 'p1_e0007',
      x1: 638, y1: 317, x2: 776, y2: 345,
    });
    expect(row).not.toBeNull();
    expect(row).toEqual({ x1: 85, y1: 240, x2: 914, y2: 345 });
  });

  test('single-cell row returns that cell box', () => {
    const row = segmentRowBox(segments, {
      segmentId: 'p1_e0006',
      x1: 776, y1: 444, x2: 914, y2: 481, // the '294,930' cell, row 4
    });
    expect(row).toEqual({ x1: 776, y1: 444, x2: 914, y2: 481 });
  });

  test('text segment without cells → null', () => {
    expect(
      segmentRowBox(segments, {
        segmentId: 'p1_e0003',
        x1: 57, y1: 125, x2: 251, y2: 139,
      })
    ).toBeNull();
  });

  test('unknown segment id → null', () => {
    expect(
      segmentRowBox(segments, { segmentId: 'nope', x1: 0, y1: 0, x2: 10, y2: 10 })
    ).toBeNull();
  });

  test('center outside every row band → null', () => {
    expect(
      segmentRowBox(segments, {
        segmentId: 'p1_e0007',
        x1: 100, y1: 500, x2: 200, y2: 520, // below both rows
      })
    ).toBeNull();
  });
});
