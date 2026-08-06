/**
 * Helpers for the evidence mindmap: mapping a finding's source citations to
 * the files they mention, and building the display nodes.
 */

export interface MindmapFileNode {
  id: number; // 1-based document index (matches DocumentClassification.document)
  title: string; // fileName
  role: string; // display label: PO / RECEIPT / INVOICE / OTHER
  fileId: string;
  citations: string[];
}

/** Shape of one segment as returned by GET /v1/files/{fileId}/segments. */
export interface SegmentCell {
  row: number;
  col: number;
  text?: string;
  isHeader?: boolean;
  bbox?: { x1: number; y1: number; x2: number; y2: number }; // page-normalized 0-1 (×1000 = page space)
  pixel_bbox?: [number, number, number, number]; // NOT consistently page space — see cellBox()
}

export interface SegmentLike {
  id: string;
  title?: string;
  markdown?: string;
  coordinates?: {
    pageNumber: number;
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  cells?: SegmentCell[];
  cellsSource?: string; // 'projection' (true cell geometry) | 'grid-estimate' (columns estimated)
}

/**
 * A citation located on a page. The box is in DocAI's 1000×1000 page space
 * (top-origin) — segment `coordinates` and cell `pixel_bbox` are both in it,
 * so overlay percentages are simply value / 1000 * 100%.
 */
export interface CitationLocation {
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  segmentId: string;
  matchedText: string;
  /** Normalized citation needle (whitespace-joined parts) — used to look the
   *  quote up in the rendered PDF's text layer for exact box refinement. */
  needle: string;
}

/** Lowercase file name without its extension, for citation matching. */
export function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').toLowerCase();
}

/** Human label for a DocumentClassification type. */
export function roleLabel(type: string): string {
  switch (type) {
    case 'purchase_order': return 'PO';
    case 'receipt': return 'RECEIPT';
    case 'invoice': return 'INVOICE';
    default: return 'OTHER';
  }
}

// Word-boundary regex per role so short labels like "PO" don't match inside
// unrelated words (e.g. "response"). Long role words use a plain includes().
const ROLE_RE: Record<string, RegExp> = {
  PO: /\bpo\b/,
  RECEIPT: /receipt/,
  INVOICE: /invoice/,
};

/**
 * Attribute each source citation to the file it mentions. Matching order:
 * 1. the citation contains the file's name (stem, case-insensitive)
 * 2. the citation mentions the role word and exactly ONE file has that role
 * Unattributed citations go to the `unassigned` bucket (still shown in the
 * flat citation list below the mindmap).
 */
export function attributeCitations(
  citations: string[],
  files: MindmapFileNode[]
): { byFile: Record<number, string[]>; unassigned: string[] } {
  const byFile: Record<number, string[]> = {};
  const unassigned: string[] = [];

  for (const cite of citations) {
    const lower = cite.toLowerCase();

    const stemMatches = files.filter(f => f.title && lower.includes(fileStem(f.title)));
    if (stemMatches.length > 0) {
      (byFile[stemMatches[0].id] ??= []).push(cite);
      continue;
    }

    const roleMatches = files.filter(f => {
      const re = ROLE_RE[f.role];
      return re ? re.test(lower) : false;
    });
    if (roleMatches.length === 1) {
      (byFile[roleMatches[0].id] ??= []).push(cite);
      continue;
    }

    unassigned.push(cite);
  }

  return { byFile, unassigned };
}

/** Normalize text for citation↔segment matching (case + whitespace). */
export function normalizeMatchText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract the most distinctive searchable part of a citation string:
 * the longest quoted fragment ('...' or "..."), else everything after the
 * last colon (e.g. "Invoice: line 5: 'Unit Price: 470'" → "Unit Price: 470").
 */
export function extractCitationNeedle(citation: string): string {
  const quoted = citation.match(/'([^']+)'|"([^"]+)"/g);
  if (quoted && quoted.length > 0) {
    return quoted
      .map(q => q.slice(1, -1))
      .sort((a, b) => b.length - a.length)[0];
  }
  const lastColon = citation.lastIndexOf(':');
  return lastColon >= 0 ? citation.slice(lastColon + 1).trim() : citation;
}

/**
 * Order-aware containment: every part must appear in order in the text.
 * Used for citations whose quoted content is ellipsis-truncated by the LLM
 * (e.g. "Mugs with Logo ... Unit Price(PKR) 470.00").
 */
function containsOrdered(text: string, parts: string[]): boolean {
  let pos = 0;
  for (const part of parts) {
    const idx = text.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }
  return true;
}

/**
 * Locate a citation on the document: find the segment (or table cell) whose
 * text matches the citation's quoted content, and return its page-relative
 * PDF-point bounding box. Match order: exact cell text → segment markdown
 * contains the needle → cell text contains the needle. The needle is split
 * on '…' runs so LLM-truncated quotes ("…") still match.
 */
export function locateCitation(
  citation: string,
  segments: SegmentLike[]
): CitationLocation | null {
  const parts = extractCitationNeedle(citation)
    .split(/\.{3,}/)
    .map(normalizeMatchText)
    .filter(p => p.length >= 2);
  if (parts.length === 0) return null;
  const single = parts.length === 1;
  const needle = parts.join(' ');
  // Short single-fragment needles are only matched exactly (cell text), not
  // as substrings — otherwise "470" would hit the first cell containing it.
  const fuzzy = single ? parts[0].length >= 3 : true;

  const box = (seg: SegmentLike) =>
    seg.coordinates
      ? {
          page: seg.coordinates.pageNumber,
          x1: seg.coordinates.xmin,
          y1: seg.coordinates.ymin,
          x2: seg.coordinates.xmax,
          y2: seg.coordinates.ymax,
        }
      : null;

  // Cell box in the 1000×1000 page space. IMPORTANT: the normalized `bbox`
  // is consistently page-relative (×1000) across files, while `pixel_bbox`
  // is NOT — it matches bbox×1000 for some parses (the PO) but is a
  // render-pixel space with an unknown DPI for others (the invoice), which
  // shifted and enlarged every highlight. Use bbox×1000; pixel_bbox only as
  // a fallback when bbox is absent.
  const cellBox = (cell: SegmentCell) => {
    if (cell.bbox) {
      return {
        x1: cell.bbox.x1 * 1000,
        y1: cell.bbox.y1 * 1000,
        x2: cell.bbox.x2 * 1000,
        y2: cell.bbox.y2 * 1000,
      };
    }
    if (cell.pixel_bbox && cell.pixel_bbox.length === 4) {
      return { x1: cell.pixel_bbox[0], y1: cell.pixel_bbox[1], x2: cell.pixel_bbox[2], y2: cell.pixel_bbox[3] };
    }
    return null;
  };

  /**
   * For "grid-estimate" segments DocAI splits the table into EQUAL-width
   * columns, which misplaces boxes when the real table has uneven columns
   * (wide description, narrow Qty) — narrow cells render too wide and later
   * columns sit too far right. Rows are detected (trusted), so re-estimate
   * only the column boundaries from cell text lengths (sqrt-weighted, which
   * fits the projection-truth table almost exactly) and keep the cell's
   * bbox Y.
   */
  const estimateGridCellBox = (cell: SegmentCell, seg: SegmentLike) => {
    const coords = seg.coordinates;
    const cells = seg.cells ?? [];
    if (!coords || cells.length === 0 || !cell.bbox) return null;
    const maxCol = Math.max(...cells.map(c => c.col));
    if (maxCol < 1) return null;
    const lens = new Array<number>(maxCol + 1).fill(1);
    for (const c of cells) {
      const l = Math.sqrt(normalizeMatchText(c.text || '').length);
      if (l > lens[c.col]) lens[c.col] = l;
    }
    const sum = lens.reduce((a, b) => a + b, 0);
    const total = coords.xmax - coords.xmin;
    const bounds: number[] = [coords.xmin];
    for (let i = 0; i < maxCol; i++) {
      bounds.push(bounds[i] + (lens[i] / sum) * total);
    }
    bounds.push(coords.xmax);
    return {
      x1: bounds[cell.col],
      y1: cell.bbox.y1 * 1000,
      x2: bounds[cell.col + 1],
      y2: cell.bbox.y2 * 1000,
    };
  };

  const cellBoxFor = (cell: SegmentCell, seg: SegmentLike) =>
    seg.cellsSource === 'grid-estimate'
      ? estimateGridCellBox(cell, seg) ?? cellBox(cell)
      : cellBox(cell);

  // 1) exact cell text (tables) — strongest signal
  if (single) {
    for (const seg of segments) {
      for (const cell of seg.cells ?? []) {
        const t = normalizeMatchText(cell.text || '');
        if (t && t === parts[0]) {
          const cb = cellBoxFor(cell, seg);
          if (cb) return { page: seg.coordinates?.pageNumber ?? 1, ...cb, segmentId: seg.id, matchedText: cell.text || '', needle };
        }
      }
    }
  }

  // 2) segment markdown contains the needle (line-level chunk)
  if (fuzzy) {
    for (const seg of segments) {
      const md = normalizeMatchText(seg.markdown || '');
      if (md && containsOrdered(md, parts)) {
        const b = box(seg);
        if (b) return { ...b, segmentId: seg.id, matchedText: seg.markdown || '', needle };
      }
    }

    // 3) cell text contains the needle (e.g. the needle is a value fragment)
    if (fuzzy) {
      for (const seg of segments) {
        for (const cell of seg.cells ?? []) {
          const t = normalizeMatchText(cell.text || '');
          if (t && containsOrdered(t, parts)) {
            const cb = cellBoxFor(cell, seg);
            if (cb) return { page: seg.coordinates?.pageNumber ?? 1, ...cb, segmentId: seg.id, matchedText: cell.text || '', needle };
          }
        }
      }
    }
  }

  // 4) row-hint fallback: LLM composite quotes like "row 1: 'Qty 16'" combine
  // a header label and a cell value that never appear verbatim together.
  // When the citation names a row/line, score the row's cells by how many
  // needle tokens each contains (numeric tokens weighted double — the
  // disputed value) and highlight the single best cell.
  const rowHint = citation.match(/\b(?:row|line)\s+(\d+)\b/i);
  if (rowHint) {
    const n = parseInt(rowHint[1], 10);
    const needleTokens = parts
      .join(' ')
      .split(/\s+/)
      .filter(t => t.length >= 2);
    const tokenValue = (t: string) => (/\d/.test(t) ? 2 : 1);
    for (const seg of segments) {
      const cells = seg.cells ?? [];
      if (cells.length === 0) continue;
      // "row 1" may mean the first data row (cells row 1) or the header row
      // (cells row 0) depending on how the LLM counts — try both.
      for (const candidate of [n, n - 1]) {
        const rowCells = cells.filter(c => c.row === candidate);
        if (rowCells.length === 0) continue;
        let bestCell: SegmentCell | null = null;
        let bestScore = 0;
        for (const cell of rowCells) {
          const t = normalizeMatchText(cell.text || '');
          const score = needleTokens.reduce(
            (acc, tok) => (t.includes(tok) ? acc + tokenValue(tok) : acc),
            0
          );
          if (score > bestScore) {
            bestScore = score;
            bestCell = cell;
          }
        }
        if (bestScore > 0 && bestCell) {
          const cb = cellBoxFor(bestCell, seg);
          if (cb) return { page: seg.coordinates?.pageNumber ?? 1, ...cb, segmentId: seg.id, matchedText: bestCell.text || '', needle };
        }
      }
    }
  }

  return null;
}

/** Locate every citation in a file's segments; returns located + misses. */
export function locateCitations(
  citations: string[],
  segments: SegmentLike[]
): { located: CitationLocation[]; misses: string[] } {
  const located: CitationLocation[] = [];
  const misses: string[] = [];
  for (const cite of citations) {
    const loc = locateCitation(cite, segments);
    if (loc) located.push(loc);
    else misses.push(cite);
  }
  return { located, misses };
}
