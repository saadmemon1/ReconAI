import { NextRequest, NextResponse } from 'next/server';
import { docaiFetch } from '@/lib/docai-proxy';
import { encryptDocAISession, getSessionCookieHeader } from '@/lib/session';
import { fetchCurrentOrgId } from '@/lib/session-org';

export async function POST(req: NextRequest) {
  const { email, password, name, organization } = await req.json();
  
  const res = await docaiFetch('/v1/auth/sign-up/email', {
    method: 'POST',
    body: { email, password, name, organization },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  // After signup, sign them in automatically
  const signInRes = await docaiFetch('/v1/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
  });

  if (!signInRes.ok) {
    return NextResponse.json({ 
      error: 'Account created but auto-login failed. Please sign in.' 
    }, { status: 500 });
  }

  const setCookie = signInRes.headers.get('set-cookie') || '';
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
