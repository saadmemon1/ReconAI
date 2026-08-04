import { NextRequest, NextResponse } from 'next/server';
import { decryptDocAISession, encryptDocAISession, COOKIE_NAME, getSessionCookieHeader } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';

export async function GET(req: NextRequest) {
  const encrypted = req.cookies.get(COOKIE_NAME)?.value;
  if (!encrypted) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = await decryptDocAISession(encrypted);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Verify with DocAI
  const res = await docaiFetch('/v1/auth/session', {
    docaiSessionToken: session.token,
    docaiOrgId: session.orgId,
  });

  if (!res.ok) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const data = await res.json();
  const s = data.session || data;

  const response = NextResponse.json({
    authenticated: true,
    user: s.user,
    orgId: s.currentOrgId,
    organizations: s.organizations,
    knowledgeBases: s.knowledgeBases,
    currentKnowledgeBaseId: s.currentKnowledgeBaseId,
    currentKnowledgeBase: s.currentKnowledgeBase,
  });

  // F5 self-heal: if the JWT's orgId is stale (or was empty from before the
  // fix), re-encrypt the cookie with the authoritative orgId from DocAI.
  if (s.currentOrgId && s.currentOrgId !== session.orgId) {
    const refreshed = await encryptDocAISession(session.token, s.currentOrgId);
    response.headers.set('Set-Cookie', getSessionCookieHeader(refreshed));
  }

  return response;
}
