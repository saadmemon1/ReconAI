/**
 * Path validation for the DocAI BFF proxy (security audit F1/F2 fixes).
 *
 * The proxy must relay ONLY the specific DocAI operations the UI uses.
 * Two independent layers:
 *  1. isSafeSegment: every segment must be plain [A-Za-z0-9_-] — blocks
 *     traversal primitives (.., %2e%2e, backslash, encoded slashes, dots).
 *  2. isAllowedProxyPath: structural allowlist of known-safe path shapes —
 *     even a bypass in layer 1 cannot reach /internal/*, /health, admin, etc.
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** True when the segment contains only plain URL-safe chars (no dots, slashes, %, backslash). */
export function isSafeSegment(segment: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(segment);
}

/** True when the value looks like a DocAI UUID (file ids, kb ids, job ids). */
export function isDocAIUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type PathPattern = (string | 'uuid')[];

const ALLOWED_PATTERNS: PathPattern[] = [
  // Files
  ['files'],                          // list (?kb_id=...) + upload (multipart POST)
  ['files', 'parse', 'bulk'],         // bulk parse trigger
  ['files', 'uuid'],                  // metadata / delete
  ['files', 'uuid', 'content'],       // view raw file
  ['files', 'uuid', 'segments'],      // parsed segments
  ['files', 'uuid', 'jobs', 'uuid'],  // parse job status polling
  // Knowledge bases (workspaces)
  ['knowledge-bases'],                // list / create
  ['knowledge-bases', 'uuid'],        // delete (?confirm_permanent=true)
  // Models
  ['ai', 'models'],                   // model list
  // Billing
  ['billing', 'credits'],             // credit balance
];

/** True when the decoded catch-all path matches a known-safe shape. */
export function isAllowedProxyPath(segments: string[]): boolean {
  if (segments.length === 0) return false;

  return ALLOWED_PATTERNS.some(pattern => {
    if (pattern.length !== segments.length) return false;
    return pattern.every((p, i) => p === 'uuid' ? isDocAIUuid(segments[i]) : p === segments[i]);
  });
}

/** Combined gate: shape allowlist AND every segment plain-safe. */
export function isSafeProxyPath(segments: string[]): boolean {
  return segments.every(isSafeSegment) && isAllowedProxyPath(segments);
}
