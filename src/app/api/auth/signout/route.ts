import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookieHeader } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', clearSessionCookieHeader());
  return response;
}
