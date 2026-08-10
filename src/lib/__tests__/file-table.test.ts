import { describe, test, expect } from 'bun:test';
import { fileKind, formatFileDate, sortFiles, type SortableFile } from '../file-table';

describe('fileKind (extension-based type detection)', () => {
  test('pdf for .pdf regardless of case', () => {
    expect(fileKind('invoice.pdf')).toBe('pdf');
    expect(fileKind('INVOICE.PDF')).toBe('pdf');
    expect(fileKind('Invoice.Final.PDF')).toBe('pdf');
  });

  test('image for all accepted raster extensions', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'bmp']) {
      expect(fileKind(`scan.${ext}`)).toBe('image');
      expect(fileKind(`scan.${ext.toUpperCase()}`)).toBe('image');
    }
  });

  test('other for unknown extensions and no extension', () => {
    expect(fileKind('notes.docx')).toBe('other');
    expect(fileKind('archive.zip')).toBe('other');
    expect(fileKind('README')).toBe('other');
    expect(fileKind('.gitignore')).toBe('other');
  });
});

describe('formatFileDate (Added column)', () => {
  test('formats a valid ISO timestamp', () => {
    expect(formatFileDate('2026-08-10T11:30:00Z')).toBe('Aug 10, 2026');
  });

  test('empty string for missing or invalid input', () => {
    expect(formatFileDate(undefined)).toBe('');
    expect(formatFileDate(null)).toBe('');
    expect(formatFileDate('')).toBe('');
    expect(formatFileDate('not-a-date')).toBe('');
  });
});

describe('sortFiles (non-mutating, stable)', () => {
  const base: SortableFile[] = [
    { filename: 'beta.pdf', created_at: '2026-08-01T00:00:00Z', parsed: false },
    { filename: 'alpha.png', created_at: '2026-08-03T00:00:00Z', parsed: true },
    { filename: 'charlie.pdf', created_at: '2026-08-02T00:00:00Z', parsed: true },
  ];

  test('does not mutate the input array', () => {
    const input = [...base];
    const out = sortFiles(input, 'name', 'asc');
    expect(out).not.toBe(input);
    expect(input.map(f => f.filename)).toEqual(['beta.pdf', 'alpha.png', 'charlie.pdf']);
  });

  test('name asc/desc via localeCompare', () => {
    expect(sortFiles(base, 'name', 'asc').map(f => f.filename)).toEqual([
      'alpha.png', 'beta.pdf', 'charlie.pdf',
    ]);
    expect(sortFiles(base, 'name', 'desc').map(f => f.filename)).toEqual([
      'charlie.pdf', 'beta.pdf', 'alpha.png',
    ]);
  });

  test('date asc = oldest first, desc = newest first', () => {
    expect(sortFiles(base, 'date', 'asc').map(f => f.filename)).toEqual([
      'beta.pdf', 'charlie.pdf', 'alpha.png',
    ]);
    expect(sortFiles(base, 'date', 'desc').map(f => f.filename)).toEqual([
      'alpha.png', 'charlie.pdf', 'beta.pdf',
    ]);
  });

  test('missing dates sort last in BOTH directions', () => {
    const mixed: SortableFile[] = [
      { filename: 'undated.pdf', created_at: null, parsed: false },
      { filename: 'old.pdf', created_at: '2026-01-01T00:00:00Z', parsed: false },
      { filename: 'new.pdf', created_at: '2026-08-10T00:00:00Z', parsed: false },
    ];
    expect(sortFiles(mixed, 'date', 'asc').map(f => f.filename)).toEqual([
      'old.pdf', 'new.pdf', 'undated.pdf',
    ]);
    expect(sortFiles(mixed, 'date', 'desc').map(f => f.filename)).toEqual([
      'new.pdf', 'old.pdf', 'undated.pdf',
    ]);
  });

  test('invalid date strings are treated as missing', () => {
    const mixed: SortableFile[] = [
      { filename: 'bad.pdf', created_at: 'garbage', parsed: false },
      { filename: 'good.pdf', created_at: '2026-05-05T00:00:00Z', parsed: false },
    ];
    expect(sortFiles(mixed, 'date', 'desc').map(f => f.filename)).toEqual([
      'good.pdf', 'bad.pdf',
    ]);
  });

  test('status desc = parsed first (locked default), asc = unparsed first', () => {
    expect(sortFiles(base, 'status', 'desc').map(f => f.filename)).toEqual([
      'alpha.png', 'charlie.pdf', 'beta.pdf',
    ]);
    expect(sortFiles(base, 'status', 'asc').map(f => f.filename)).toEqual([
      'beta.pdf', 'alpha.png', 'charlie.pdf',
    ]);
  });

  test('equal keys keep their original order (stable)', () => {
    const tie: SortableFile[] = [
      { filename: 'a.pdf', created_at: '2026-08-01T00:00:00Z', parsed: true },
      { filename: 'b.pdf', created_at: '2026-08-01T00:00:00Z', parsed: true },
      { filename: 'c.pdf', created_at: '2026-08-01T00:00:00Z', parsed: true },
    ];
    expect(sortFiles(tie, 'date', 'desc').map(f => f.filename)).toEqual([
      'a.pdf', 'b.pdf', 'c.pdf',
    ]);
  });
});
