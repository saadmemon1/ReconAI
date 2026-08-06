import { describe, test, expect } from 'bun:test';
import { fileStem, roleLabel, attributeCitations, type MindmapFileNode } from '../evidence-utils';

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
