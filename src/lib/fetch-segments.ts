/**
 * Segments fetch with patience for the reconcile route.
 *
 * Why: a parse job can report "completed" while the segments endpoint still
 * returns an empty array — either the queue lagged (job finished but the
 * index wasn't readable yet) or extraction silently produced nothing (the
 * platform's bulk-parse bug). Reconcile previously accepted the empty array
 * and built a prompt with empty <document> sections, which the LLM correctly
 * answered with an all-zeros report — a silent failure.
 *
 * This helper rides out the lag (waits while the job is queued/running,
 * retries segments after completion) within a total patience budget, then
 * FAILS LOUDLY naming the file so the run surfaces an actionable error
 * instead of a garbage report.
 */

/** Minimal docaiFetch-compatible surface (Response satisfies it). */
export interface SegmentFetchContext {
  fetchFn: (
    path: string,
    opts: { docaiSessionToken: string; docaiOrgId: string }
  ) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  docaiSessionToken: string;
  docaiOrgId: string;
}

export interface SegmentsRetryOptions {
  /** Total time budget for the whole wait+retry cycle (ms). Default 30s. */
  totalPatienceMs?: number;
  /** Sleep between checks (ms). Default 2s. */
  pollEveryMs?: number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RawSegment {
  id?: string;
  markdown?: string;
  content?: string;
  title?: string;
  type?: string;
  docName?: string;
  [key: string]: unknown;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Error thrown when a file has no readable segments after the patience budget. */
export class SegmentFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SegmentFetchError';
  }
}

export async function fetchSegmentsWithRetry(
  fileId: string,
  fileName: string,
  ctx: SegmentFetchContext,
  opts: SegmentsRetryOptions = {}
): Promise<RawSegment[]> {
  const { totalPatienceMs = 30_000, pollEveryMs = 2_000, sleep = defaultSleep } = opts;
  const started = Date.now();
  const patienceLeft = () => totalPatienceMs - (Date.now() - started);

  // "Has content" means at least one segment with readable text — an empty
  // ARRAY and an array of content-less segment shells are both failures.
  const hasReadableContent = (segs: RawSegment[]) =>
    segs.some(s => ((s.markdown || s.content) ?? '').trim().length > 0);

  const fetchSegments = async (): Promise<RawSegment[]> => {
    const res = await ctx.fetchFn(`/v1/files/${fileId}/segments`, {
      docaiSessionToken: ctx.docaiSessionToken,
      docaiOrgId: ctx.docaiOrgId,
    });
    if (!res.ok) return [];
    const data = await res.json();
    // The platform returns a flat array, or {segments:[...]}, or {items:[...]}.
    const segs = Array.isArray(data) ? data : (data as { segments?: unknown } | null)?.segments ?? (data as { items?: unknown } | null)?.items;
    return Array.isArray(segs) ? (segs as RawSegment[]) : [];
  };

  const fetchJobStatus = async (): Promise<string> => {
    const res = await ctx.fetchFn(`/v1/files/${fileId}?include=processing`, {
      docaiSessionToken: ctx.docaiSessionToken,
      docaiOrgId: ctx.docaiOrgId,
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { processing?: { latest_parse_job?: { status?: string } | null } | null } | null;
    return data?.processing?.latest_parse_job?.status ?? '';
  };

  let segments = await fetchSegments();
  if (hasReadableContent(segments)) return segments;

  let sawCompleted = false;
  while (patienceLeft() > 0) {
    const status = await fetchJobStatus();

    if (status === 'failed' || status === 'cancelled') {
      throw new SegmentFetchError(
        `«${fileName}» failed to parse (${status}). Delete the file and re-upload it, then try again.`
      );
    }
    if (status === 'completed') sawCompleted = true;

    await sleep(Math.min(pollEveryMs, patienceLeft() || pollEveryMs));
    segments = await fetchSegments();
    if (hasReadableContent(segments)) return segments;
  }

  throw new SegmentFetchError(
    sawCompleted
      ? `«${fileName}» parsed but produced no readable text. Delete the file and re-upload it, then try again.`
      : `«${fileName}» has not finished parsing yet. Wait for parsing to complete and try again.`
  );
}
