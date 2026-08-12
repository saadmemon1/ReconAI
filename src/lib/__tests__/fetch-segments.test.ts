import { describe, test, expect } from 'bun:test';
import { fetchSegmentsWithRetry, SegmentFetchError, type SegmentFetchContext } from '../fetch-segments';

const ctx: SegmentFetchContext = {
  fetchFn: async () => ({ ok: true, json: async () => [] }),
  docaiSessionToken: 't',
  docaiOrgId: 'o',
};

const noopSleep = async () => {};

/** Sleep that actually advances the clock, so patience budgets exhaust. */
const realSleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.min(ms, 3)));

describe('fetchSegmentsWithRetry', () => {
  test('returns segments immediately when populated (no extra calls)', async () => {
    let calls = 0;
    const fn = async (path: string) => {
      calls++;
      if (path.includes('/segments')) {
        return { ok: true, json: async () => [{ id: 'p1_e0', markdown: 'hello' }] };
      }
      return { ok: true, json: async () => ({}) };
    };
    const segs = await fetchSegmentsWithRetry('f1', 'a.pdf', { ...ctx, fetchFn: fn }, { sleep: noopSleep });
    expect(segs).toHaveLength(1);
    expect(calls).toBe(1);
  });

  test('handles wrapped response shapes ({segments:[...]}, {items:[...]})', async () => {
    const wrapped = async (path: string) =>
      path.includes('/segments')
        ? { ok: true, json: async () => ({ segments: [{ markdown: 'x' }] }) }
        : { ok: true, json: async () => ({}) };
    expect((await fetchSegmentsWithRetry('f1', 'a.pdf', { ...ctx, fetchFn: wrapped }, { sleep: noopSleep }))).toHaveLength(1);

    const items = async (path: string) =>
      path.includes('/segments')
        ? { ok: true, json: async () => ({ items: [{ content: 'y' }] }) }
        : { ok: true, json: async () => ({}) };
    expect((await fetchSegmentsWithRetry('f1', 'a.pdf', { ...ctx, fetchFn: items }, { sleep: noopSleep }))).toHaveLength(1);
  });

  test('waits while the job is queued, then succeeds once segments arrive', async () => {
    let segCalls = 0;
    const fn = async (path: string) => {
      if (path.includes('/segments')) {
        segCalls++;
        return { ok: true, json: async () => (segCalls >= 3 ? [{ markdown: 'x' }] : []) };
      }
      return {
        ok: true,
        json: async () => ({
          processing: { latest_parse_job: { status: segCalls < 2 ? 'queued' : 'completed' } },
        }),
      };
    };
    const segs = await fetchSegmentsWithRetry(
      'f1',
      'a.pdf',
      { ...ctx, fetchFn: fn },
      { sleep: noopSleep, totalPatienceMs: 10_000, pollEveryMs: 1 }
    );
    expect(segs).toHaveLength(1);
  });

  test('fails immediately when the parse job failed, naming the file', async () => {
    const fn = async (path: string) =>
      path.includes('/segments')
        ? { ok: true, json: async () => [] }
        : { ok: true, json: async () => ({ processing: { latest_parse_job: { status: 'failed' } } }) };
    await expect(
      fetchSegmentsWithRetry('f1', '09_Invoice.pdf', { ...ctx, fetchFn: fn }, { sleep: noopSleep })
    ).rejects.toThrow(SegmentFetchError);
    await expect(
      fetchSegmentsWithRetry('f1', '09_Invoice.pdf', { ...ctx, fetchFn: fn }, { sleep: noopSleep })
    ).rejects.toThrow('09_Invoice.pdf');
  });

  test('throws naming the file when segments never arrive after completion', async () => {
    const fn = async (path: string) =>
      path.includes('/segments')
        ? { ok: true, json: async () => [] }
        : { ok: true, json: async () => ({ processing: { latest_parse_job: { status: 'completed' } } }) };
    await expect(
      fetchSegmentsWithRetry(
        'f1',
        '09_Invoice_INV-KPP-2231.pdf',
        { ...ctx, fetchFn: fn },
        { sleep: realSleep, totalPatienceMs: 60, pollEveryMs: 5 }
      )
    ).rejects.toThrow('parsed but produced no readable text');
    await expect(
      fetchSegmentsWithRetry(
        'f1',
        '09_Invoice_INV-KPP-2231.pdf',
        { ...ctx, fetchFn: fn },
        { sleep: realSleep, totalPatienceMs: 60, pollEveryMs: 5 }
      )
    ).rejects.toThrow('09_Invoice_INV-KPP-2231.pdf');
  });

  test('throws a waiting message when the job never completes within the budget', async () => {
    const fn = async (path: string) =>
      path.includes('/segments')
        ? { ok: true, json: async () => [] }
        : { ok: true, json: async () => ({ processing: { latest_parse_job: { status: 'queued' } } }) };
    await expect(
      fetchSegmentsWithRetry('f1', 'a.pdf', { ...ctx, fetchFn: fn }, { sleep: realSleep, totalPatienceMs: 60, pollEveryMs: 5 })
    ).rejects.toThrow('has not finished parsing yet');
  });

  test('throws when segments exist but all content is empty (shells only)', async () => {
    const fn = async (path: string) =>
      path.includes('/segments')
        ? { ok: true, json: async () => [{ id: 'p1_e0', title: 'text' }, { id: 'p1_e1', type: 'table' }] }
        : { ok: true, json: async () => ({ processing: { latest_parse_job: { status: 'completed' } } }) };
    await expect(
      fetchSegmentsWithRetry(
        'f1',
        'a.pdf',
        { ...ctx, fetchFn: fn },
        { sleep: realSleep, totalPatienceMs: 60, pollEveryMs: 5 }
      )
    ).rejects.toThrow('parsed but produced no readable text');
  });

  test('treats a non-ok segments response as empty (retry path, not a crash)', async () => {
    let segCalls = 0;
    const fn = async (path: string) => {
      if (path.includes('/segments')) {
        segCalls++;
        if (segCalls === 1) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, json: async () => [{ markdown: 'late' }] };
      }
      return { ok: true, json: async () => ({ processing: { latest_parse_job: { status: 'completed' } } }) };
    };
    const segs = await fetchSegmentsWithRetry(
      'f1',
      'a.pdf',
      { ...ctx, fetchFn: fn },
      { sleep: noopSleep, totalPatienceMs: 10_000, pollEveryMs: 1 }
    );
    expect(segs).toHaveLength(1);
  });
});
