import { describe, test, expect, mock, afterEach } from 'bun:test';
import { NextRequest } from 'next/server';

// bun test runs with NODE_ENV=test, under which .env.local is intentionally
// NOT loaded — so SESSION_SECRET isn't set. session.ts reads it lazily, but
// decryptApiKeySession below still needs it set before use.
process.env.SESSION_SECRET = 'test-secret-for-key-route';

const { decryptApiKeySession } = await import('@/lib/session');

describe('POST /api/auth/key', () => {
  afterEach(() => {
    mock.restore();
  });

  test('valid key: validates against /v1/knowledge-bases, seals it, and sets the cookie', async () => {
    const calls: Array<{ path: string; opts: unknown }> = [];
    mock.module('@/lib/docai-proxy', () => ({
      docaiFetch: async (path: string, opts: unknown) => {
        calls.push({ path, opts });
        return new Response(JSON.stringify({ knowledge_bases: [] }), { status: 200 });
      },
    }));

    const { POST } = await import('../route');

    const req = new NextRequest('http://localhost:3000/api/auth/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-real-key' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/v1/knowledge-bases');
    expect(calls[0].opts).toMatchObject({ docaiApiKey: 'sk-real-key' });

    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toContain('reconai-session=');
    const match = setCookie.match(/reconai-session=([^;]+)/);
    const encrypted = match?.[1];
    expect(encrypted).toBeTruthy();
    const session = await decryptApiKeySession(encrypted!);
    expect(session?.apiKey).toBe('sk-real-key');
  });

  test('invalid key: surfaces the upstream status and message, sets no cookie', async () => {
    mock.module('@/lib/docai-proxy', () => ({
      docaiFetch: async () => {
        return new Response(
          JSON.stringify({ error: 'Invalid API key', code: 'invalid_api_key' }),
          { status: 401 }
        );
      },
    }));

    const { POST } = await import('../route');

    const req = new NextRequest('http://localhost:3000/api/auth/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-bad-key' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});
