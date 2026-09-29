import { describe, test, expect, mock, afterEach } from 'bun:test';
import { NextRequest } from 'next/server';

process.env.SESSION_SECRET = 'test-secret-for-reconcile-route';

// Real session helpers (not mocked): mock.module leaks across test FILES in
// bun test (mock.restore() doesn't undo it), so mocking '@/lib/session'
// here would silently break unrelated test files that run in the same
// process. Sealing a real cookie sidesteps that entirely.
const { encryptApiKeySession, getSessionCookieHeader } = await import('@/lib/session');
const SESSION_COOKIE = getSessionCookieHeader(await encryptApiKeySession('docai-key')).split(';')[0];

const FILE_ID_1 = '11111111-1111-1111-1111-111111111111';
const FILE_ID_2 = '22222222-2222-2222-2222-222222222222';

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

/** Reads the route's SSE response body into a list of parsed `data:` events. */
async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map(chunk => chunk.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map(chunk => JSON.parse(chunk));
}

function mockCommonDeps() {
  mock.module('@/lib/docai-proxy', () => ({
    docaiFetch: async () =>
      new Response(JSON.stringify({ filename: 'Doc.pdf' }), { status: 200 }),
  }));
  mock.module('@/lib/fetch-segments', () => ({
    fetchSegmentsWithRetry: async () => [{ markdown: 'line 1', title: 'body' }],
  }));
}

function buildRequest(modelId: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/reconcile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: SESSION_COOKIE,
    },
    body: JSON.stringify({ fileIds: [FILE_ID_1, FILE_ID_2], modelId }),
  });
}

describe('POST /api/reconcile — LLM stream robustness', () => {
  afterEach(() => {
    mock.restore();
    delete process.env.GEMINI_API_KEY;
  });

  test('stream ends without ever sending a finish_reason → clear dropped-connection error, not a JSON parse failure', async () => {
    mockCommonDeps();
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        // Server streams a bit of valid content, then the connection is cut —
        // no finish_reason chunk, no [DONE], just EOF. Simulates the provider
        // dropping the connection mid-generation under load.
        return Promise.resolve(
          new Response(
            sseStream([
              'data: {"choices":[{"delta":{"content":"{\\"documentClassifications\\":"}}]}\n\n',
            ]),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
          )
        );
      }
      return originalFetch(url as never);
    }) as typeof globalThis.fetch;

    try {
      const { POST } = await import('../route');
      const res = await POST(buildRequest('gemini/gemini-flash-latest'));
      const events = await readEvents(res);
      const errorEvent = events.find(e => e.type === 'error');

      expect(errorEvent).toBeTruthy();
      expect(String(errorEvent?.message)).not.toContain('Failed to parse LLM response as JSON');
      expect(String(errorEvent?.message).toLowerCase()).toContain('connection');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('mid-stream error chunk → surfaces that error immediately instead of continuing', async () => {
    mockCommonDeps();
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock((url: string) => {
      if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
        return Promise.resolve(
          new Response(
            sseStream([
              'data: {"choices":[{"delta":{"content":"{\\"documentClassifications\\":"}}]}\n\n',
              'data: {"error":{"code":503,"message":"model is overloaded","status":"UNAVAILABLE"}}\n\n',
            ]),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
          )
        );
      }
      return originalFetch(url as never);
    }) as typeof globalThis.fetch;

    try {
      const { POST } = await import('../route');
      const res = await POST(buildRequest('gemini/gemini-flash-latest'));
      const events = await readEvents(res);
      const errorEvent = events.find(e => e.type === 'error');

      expect(errorEvent).toBeTruthy();
      expect(String(errorEvent?.message)).toContain('model is overloaded');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
