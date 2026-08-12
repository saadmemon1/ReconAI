import { describe, test, expect } from 'bun:test';
import {
  fileStem,
  roleLabel,
  attributeCitations,
  tableRowBands,
  tableRowBandBox,
  findTableRow,
  tableRowText,
  segmentRowBox,
  type MindmapFileNode,
  type SegmentLike,
} from '../evidence-utils';

const files: MindmapFileNode[] = [
  { id: 1, title: 'PO-456.pdf', role: 'PO', fileId: 'f1', citations: [] },
  { id: 2, title: 'INV-001.pdf', role: 'INVOICE', fileId: 'f2', citations: [] },
  { id: 3, title: 'GRN-77.pdf', role: 'RECEIPT', fileId: 'f3', citations: [] },
];

describe('fileStem', () => {
  test('strips the extension and lowercases', () => {
    expect(fileStem('PO-456.pdf')).toBe('po-456');
    expect(fileStem('INV-001.PDF')).toBe('inv-001');
  });

  test('leaves extension-less names untouched', () => {
    expect(fileStem('grn77')).toBe('grn77');
  });
});

describe('roleLabel', () => {
  test('maps document types to display labels', () => {
    expect(roleLabel('purchase_order')).toBe('PO');
    expect(roleLabel('receipt')).toBe('RECEIPT');
    expect(roleLabel('invoice')).toBe('INVOICE');
    expect(roleLabel('other')).toBe('OTHER');
    expect(roleLabel('garbage')).toBe('OTHER');
  });
});

describe('attributeCitations', () => {
  test('attributes by file name stem (case-insensitive)', () => {
    const { byFile, unassigned } = attributeCitations(
      ['Invoice INV-001: line 5: "Unit Price: 470"'],
      files
    );
    expect(byFile[2]).toEqual(['Invoice INV-001: line 5: "Unit Price: 470"']);
    expect(unassigned).toHaveLength(0);
  });

  test('attributes by unique role when the name is not mentioned', () => {
    const { byFile } = attributeCitations(['Invoice: line 5: "Unit Price: 470"'], files);
    expect(byFile[2]).toHaveLength(1); // only one INVOICE file
  });

  test('does not match short role words inside unrelated words', () => {
    // "response" contains "po" — must not match the PO file
    const { byFile, unassigned } = attributeCitations(['See the response for details'], files);
    expect(byFile[1]).toBeUndefined();
    expect(unassigned).toHaveLength(1);
  });

  test('ambiguous role match (two files, same role) goes unassigned', () => {
    const twoInvoices: MindmapFileNode[] = [
      { id: 1, title: 'INV-001.pdf', role: 'INVOICE', fileId: 'a', citations: [] },
      { id: 2, title: 'INV-002.pdf', role: 'INVOICE', fileId: 'b', citations: [] },
    ];
    const { byFile, unassigned } = attributeCitations(['Invoice: line 3: "Total: 500"'], twoInvoices);
    expect(byFile[1]).toBeUndefined();
    expect(byFile[2]).toBeUndefined();
    expect(unassigned).toHaveLength(1);
  });

  test('no matches → all unassigned; empty input → empty output', () => {
    const { byFile, unassigned } = attributeCitations(['page 12, no file reference'], files);
    expect(unassigned).toEqual(['page 12, no file reference']);
    expect(attributeCitations([], files).unassigned).toHaveLength(0);
    expect(attributeCitations([], []).byFile).toEqual({});
  });
});

// A projection-style table segment mimicking the real PO/invoice geometry:
// rows 0..2, page-normalized bboxes (×1000 page space), segment bounds 300..700.
const tableSeg: SegmentLike = {
  id: 'seg1',
  coordinates: { pageNumber: 1, xmin: 100, ymin: 300, xmax: 900, ymax: 700 },
  cellsSource: 'projection',
  cells: [
    { row: 0, col: 0, text: '#', bbox: { x1: 0.1, y1: 0.31, x2: 0.13, y2: 0.33 } },
    { row: 0, col: 1, text: 'Item', bbox: { x1: 0.2, y1: 0.31, x2: 0.7, y2: 0.33 } },
    { row: 1, col: 0, text: '1', bbox: { x1: 0.1, y1: 0.36, x2: 0.13, y2: 0.39 } },
    { row: 1, col: 1, text: 'Ceramic Mugs', bbox: { x1: 0.2, y1: 0.36, x2: 0.7, y2: 0.39 } },
    { row: 1, col: 2, text: 'PKR 450.00', bbox: { x1: 0.74, y1: 0.36, x2: 0.8, y2: 0.39 } },
    { row: 2, col: 0, text: 'Total', bbox: { x1: 0.1, y1: 0.45, x2: 0.35, y2: 0.48 } },
    { row: 2, col: 1, text: 'PKR 7,200.00', bbox: { x1: 0.4, y1: 0.45, x2: 0.6, y2: 0.48 } },
  ],
};

describe('tableRowBands', () => {
  test('splits the table height into full row bands via midpoints', () => {
    const bands = tableRowBands(tableSeg);
    // row 0: top = segment ymin (300); bottom = midpoint(330, 360) = 345
    expect(bands.get(0)).toEqual({ y1: 300, y2: 345 });
    // row 1: top = midpoint(330, 360) = 345; bottom = midpoint(390, 450) = 420
    expect(bands.get(1)).toEqual({ y1: 345, y2: 420 });
    // row 2: top = midpoint(390, 450) = 420; bottom = segment ymax (700)
    expect(bands.get(2)).toEqual({ y1: 420, y2: 700 });
  });

  test('first band starts at the table top, last ends at the table bottom', () => {
    const bands = tableRowBands(tableSeg);
    expect(bands.get(0)!.y1).toBe(300);
    expect(bands.get(2)!.y2).toBe(700);
  });

  test('empty or cell-less segments yield no bands', () => {
    expect(tableRowBands({ id: 'x' } as SegmentLike).size).toBe(0);
    expect(tableRowBands({ id: 'x', coordinates: tableSeg.coordinates } as SegmentLike).size).toBe(0);
  });
});

describe('tableRowBandBox / findTableRow / tableRowText', () => {
  test('band box spans the full row width (union of cells) with full height', () => {
    const box = tableRowBandBox(tableSeg, 1);
    expect(box).toEqual({ x1: 100, y1: 345, x2: 800, y2: 420 });
  });

  test('findTableRow locates the row containing a given Y', () => {
    expect(findTableRow(tableSeg, 400)).toBe(1);
    expect(findTableRow(tableSeg, 600)).toBe(2);
    expect(findTableRow(tableSeg, 310)).toBe(0);
  });

  test('tableRowText joins the row cells in order', () => {
    expect(tableRowText(tableSeg, 1)).toBe('1 Ceramic Mugs PKR 450.00');
  });
});

describe('segmentRowBox', () => {
  test('returns the full-height band of the row containing the citation center', () => {
    // Citation box centered on row 1 (cy 382).
    const box = segmentRowBox([tableSeg], { segmentId: 'seg1', x1: 700, y1: 375, x2: 820, y2: 390 });
    expect(box).toEqual({ x1: 100, y1: 345, x2: 800, y2: 420 });
  });

  test('returns null for unknown segments or cell-less segments', () => {
    expect(segmentRowBox([tableSeg], { segmentId: 'nope', x1: 0, y1: 0, x2: 1, y2: 1 })).toBeNull();
    expect(
      segmentRowBox([{ id: 'plain', coordinates: tableSeg.coordinates }], {
        segmentId: 'plain',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
      })
    ).toBeNull();
  });
});
