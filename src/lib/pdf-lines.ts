/**
 * Visual-line grouping for PDF text-layer items: turns a tight matched
 * fragment into its full line (the visual row) — used by the evidence
 * viewer's highlight expansion. Pure + pdfjs-free so it stays unit-testable.
 *
 * ponytail: v1 groups by baseline ONLY (y tolerance), so same-baseline
 * multi-column page layouts merge into one band. Acceptable for
 * invoice/PO documents (single-column tables); if a document set shows
 * it, add an x-gap threshold to split columns.
 */

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextItemWithBox {
  str: string;
  box: Box;
}

export interface TextLine {
  /** Baseline y (vertical center of the line's items). */
  y: number;
  /** Union box of every item on the line. */
  box: Box;
  /** Items sorted by x, joined with a single space. */
  text: string;
}

/** Baseline tolerance (scale-1 viewport units) for merging items into a line. */
const BASELINE_TOLERANCE = 3;

/**
 * Group text items into visual lines: items whose vertical centers fall
 * within `baselineTolerance` of the line's baseline merge. Zero-size items
 * are skipped. Line text is assembled in x order, not input order.
 *
 * The tolerance is in the SAME units as the boxes — callers working in
 * page-percent space (the viewer) must pass a %-equivalent of their point
 * tolerance (e.g. 3pt on an 842pt page = 0.36).
 */
export function groupItemsIntoLines(
  items: TextItemWithBox[],
  baselineTolerance = BASELINE_TOLERANCE
): TextLine[] {
  interface WorkingLine extends TextLine {
    items: TextItemWithBox[];
  }
  const lines: WorkingLine[] = [];
  for (const item of items) {
    const { box } = item;
    if (box.x2 <= box.x1 || box.y2 <= box.y1) continue;
    const y = (box.y1 + box.y2) / 2;
    // Find the first line whose baseline is within tolerance.
    const line = lines.find(l => Math.abs(l.y - y) <= baselineTolerance);
    if (line) {
      line.box.x1 = Math.min(line.box.x1, box.x1);
      line.box.y1 = Math.min(line.box.y1, box.y1);
      line.box.x2 = Math.max(line.box.x2, box.x2);
      line.box.y2 = Math.max(line.box.y2, box.y2);
      line.y = (line.box.y1 + line.box.y2) / 2; // re-center on the grown union
      line.items.push(item);
    } else {
      lines.push({ y, box: { ...box }, text: '', items: [item] });
    }
  }
  return lines.map(line => {
    line.items.sort((a, b) => a.box.x1 - b.box.x1);
    return {
      y: line.y,
      box: line.box,
      text: line.items.map(i => i.str).join(' '),
    };
  });
}

/**
 * Expand a matched fragment box to its full visual line: the line whose box
 * contains the fragment's center. Returns the line's union box + full text,
 * or null when no line contains it.
 */
export function expandToLine(
  lines: TextLine[],
  box: Box
): { box: Box; text: string } | null {
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  const line = lines.find(
    l => cx >= l.box.x1 && cx <= l.box.x2 && cy >= l.box.y1 && cy <= l.box.y2
  );
  if (!line) return null;
  return { box: { ...line.box }, text: line.text };
}
