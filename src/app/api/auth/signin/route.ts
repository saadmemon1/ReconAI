import { NextRequest, NextResponse } from 'next/server';
import { docaiFetch } from '@/lib/docai-proxy';
import { encryptDocAISession, getSessionCookieHeader } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { email, password, name, organization } = await req.json();
  
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

  const orgRes = await docaiFetch('/v1/orgs/current', {
    docaiSessionToken: token,
  });
  const orgData = await orgRes.json();

  const encrypted = await encryptDocAISession(token, orgData.id || '');
  
  const response = NextResponse.json({ success: true, orgId: orgData.id });
  response.headers.set('Set-Cookie', getSessionCookieHeader(encrypted));
  return response;
}
