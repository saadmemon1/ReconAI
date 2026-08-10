/**
 * Pure helpers for the Files-tab dense table: file kind detection, date
 * formatting, and sorting. Kept free of React/UI so they stay unit-testable.
 */

export type FileKind = 'pdf' | 'image' | 'other';

/** Image extensions accepted by DocAI uploads (mirrors ACCEPTED_TYPES). */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'bmp']);

/**
 * Kind of a file from its name: 'pdf' for PDFs, 'image' for the accepted
 * raster formats, 'other' for everything else (including no extension).
 * Case-insensitive; uses the LAST dot segment so "invoice.final.PDF" works.
 */
export function fileKind(filename: string): FileKind {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  return 'other';
}

/**
 * "Aug 10, 2026" style date for the Added column. Missing or invalid input
 * renders as an empty string rather than "Invalid Date".
 */
export function formatFileDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export type FileSortKey = 'name' | 'date' | 'status';
export type SortDir = 'asc' | 'desc';

/** Minimal shape sortFiles needs; FileManager maps FileItem + parsed onto it. */
export interface SortableFile {
  filename: string;
  created_at?: string | null;
  parsed: boolean;
}

/**
 * Non-mutating, stable sort for the Files table. `status` desc = parsed
 * first (the locked default); missing dates always sort last regardless of
 * direction.
 */
export function sortFiles<T extends SortableFile>(
  files: T[],
  key: FileSortKey,
  dir: SortDir
): T[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    if (key === 'name') {
      const cmp = a.filename.localeCompare(b.filename);
      return dir === 'asc' ? cmp : -cmp;
    }
    if (key === 'date') {
      const ta = Date.parse(a.created_at ?? '');
      const tb = Date.parse(b.created_at ?? '');
      const aOk = !Number.isNaN(ta);
      const bOk = !Number.isNaN(tb);
      if (aOk !== bOk) return aOk ? -1 : 1; // dated rows first, both directions
      if (!aOk) return 0;
      const diff = ta - tb;
      return dir === 'asc' ? diff : -diff;
    }
    // status
    const cmp = Number(a.parsed) - Number(b.parsed);
    return dir === 'desc' ? -cmp : cmp;
  });
  return sorted;
}
