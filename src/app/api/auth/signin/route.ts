import { NextRequest, NextResponse } from 'next/server';
import { docaiFetch } from '@/lib/docai-proxy';
import { encryptDocAISession, getSessionCookieHeader } from '@/lib/session';
import { fetchCurrentOrgId } from '@/lib/session-org';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  
  const res = await docaiFetch('/v1/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const tokenMatch = setCookie.match(/better-auth\.session_token=([^;]+)/);
  const token = tokenMatch?.[1];

  if (!token) {
    return NextResponse.json({ error: 'No session token returned' }, { status: 500 });
  }

  // F5 fix: carry the real org id in the JWT so the proxy can forward
  // x-docai-org-id (DocAI file/KB endpoints require it).
  const orgId = await fetchCurrentOrgId(token);
  const encrypted = await encryptDocAISession(token, orgId);
  
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', getSessionCookieHeader(encrypted));
  return response;
}
