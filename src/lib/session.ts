import { SignJWT, jwtVerify } from 'jose';

const SESSION_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET!
);

const COOKIE_NAME = 'reconai-session';
const DOCAI_COOKIE_NAME = 'better-auth.session_token';

interface DocAISession {
  token: string;
  orgId: string;
  expiresAt: number;
}

export async function encryptDocAISession(
  docaiSessionToken: string,
  docaiOrgId: string
): Promise<string> {
  return new SignJWT({ 
    docaiSessionToken, 
    docaiOrgId 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(SESSION_SECRET);
}

export async function decryptDocAISession(
  encryptedToken: string
): Promise<DocAISession | null> {
  try {
    const { payload } = await jwtVerify(encryptedToken, SESSION_SECRET);
    return {
      token: payload.docaiSessionToken as string,
      orgId: payload.docaiOrgId as string,
      expiresAt: (payload.exp as number) * 1000,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieHeader(encryptedToken: string): string {
  return `${COOKIE_NAME}=${encryptedToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME, DOCAI_COOKIE_NAME };
