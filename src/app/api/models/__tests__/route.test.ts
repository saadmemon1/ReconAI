import { describe, test, expect, mock, afterEach } from 'bun:test';
import { NextRequest } from 'next/server';

describe('GET /api/models', () => {
  afterEach(() => {
    mock.restore();
    delete process.env.LM_STUDIO_URL;
  });

  test('LM_STUDIO_URL unset → returns { models: [] }, status 200', async () => {
    delete process.env.LM_STUDIO_URL;

    const { GET } = await import('../route');

    const req = new NextRequest('http://localhost:3000/api/models', {
      method: 'GET',
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ models: [] });
  });

  test('upstream returns valid {data:[{id:"qwen/qwen3-vl-30b"}]} → returns { models: [{ id: "lmstudio/qwen/qwen3-vl-30b", name: "qwen/qwen3-vl-30b" }] }', async () => {
    process.env.LM_STUDIO_URL = 'http://localhost:1234';

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      (): Promise<Response> => {
        fetchCalled = true;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: 'qwen/qwen3-vl-30b', object: 'model' }],
            }),
            { status: 200 }
          )
        );
      }
    ) as typeof globalThis.fetch;

    try {
      const { GET } = await import('../route');

      const req = new NextRequest('http://localhost:3000/api/models', {
        method: 'GET',
      });

      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(fetchCalled).toBe(true);
      const data = await res.json();
      expect(data).toEqual({
        models: [{ id: 'lmstudio/qwen/qwen3-vl-30b', name: 'qwen/qwen3-vl-30b' }],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('upstream fetch rejects (network error) → returns { models: [] }, status 200, no throw', async () => {
    process.env.LM_STUDIO_URL = 'http://localhost:1234';

    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      (): Promise<Response> => {
        fetchCalled = true;
        return Promise.reject(new Error('Network error'));
      }
    ) as typeof globalThis.fetch;

    try {
      const { GET } = await import('../route');

      const req = new NextRequest('http://localhost:3000/api/models', {
        method: 'GET',
      });

      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(fetchCalled).toBe(true);
      const data = await res.json();
      expect(data).toEqual({ models: [] });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
