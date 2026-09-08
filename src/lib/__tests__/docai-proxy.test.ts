import { describe, test, expect, afterEach } from 'bun:test';

// docai-proxy.ts reads process.env.DOCAI_BASE_URL at module scope, so it
// must be set before the module is imported.
process.env.DOCAI_BASE_URL = 'https://api.providus.ai';

const { docaiFetch } = await import('../docai-proxy');

describe('docaiFetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // BYOK: the key auth is a single x-api-key header — no cookie, no org
  // header (the key is org-scoped by itself; x-docai-org-id was a
  // Better-Auth-era artifact that no longer applies).
  test('sends x-api-key and no Cookie or x-docai-org-id header', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    // @ts-expect-error - stub is intentionally minimal
    globalThis.fetch = async (_url: string, init: { headers: Record<string, string> }) => {
      capturedHeaders = init.headers;
      return new Response('{}', { status: 200 });
    };

    await docaiFetch('/v1/files/abc', { docaiApiKey: 'sk-abc123' });

    expect(capturedHeaders?.['x-api-key']).toBe('sk-abc123');
    expect(capturedHeaders?.['Cookie']).toBeUndefined();
    expect(capturedHeaders?.['x-docai-org-id']).toBeUndefined();
  });
});
