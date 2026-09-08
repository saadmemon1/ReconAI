import { NextRequest, NextResponse } from 'next/server';
import { docaiFetch } from '@/lib/docai-proxy';
import { encryptApiKeySession, getSessionCookieHeader } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { apiKey } = await req.json();

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'API key is required' }, { status: 400 });
  }

  // Validate the key by calling a lightweight authenticated endpoint —
  // there's no dedicated "verify" endpoint under key auth, and no user
  // identity to fetch (GET /v1/auth/session 401s under key auth).
  const res = await docaiFetch('/v1/knowledge-bases', {
    docaiApiKey: apiKey,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: data.error || 'Invalid API key' },
      { status: res.status }
    );
  }

  const encrypted = await encryptApiKeySession(apiKey);

  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', getSessionCookieHeader(encrypted));
  return response;
}
