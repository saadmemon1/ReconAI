import { NextRequest, NextResponse } from 'next/server';
import { decryptDocAISession, COOKIE_NAME } from '@/lib/session';
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
  });

  if (!res.ok) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const data = await res.json();
  return NextResponse.json({ authenticated: true, ...data });
}
