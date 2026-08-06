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
