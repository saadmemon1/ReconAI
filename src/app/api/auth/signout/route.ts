import { NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/session';

export async function POST() {
  // An API key has no server-side session to revoke — signing out just
  // forgets the locally stored, sealed key.
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
