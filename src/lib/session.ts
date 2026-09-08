import { SignJWT, jwtVerify } from 'jose';

// Read lazily (inside the functions that need it) rather than at module
// scope: a module-scope read makes correctness depend on import order (an
// unrelated import that transitively pulls in this module before the env
// is configured silently poisons every session call with an empty secret),
// and it turns a missing env var into a cryptic jose error instead of a
// clear one.
function sessionSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(raw);
}

const COOKIE_NAME = 'reconai-session';

interface ApiKeySession {
  apiKey: string;
  expiresAt: number;
}

export async function encryptApiKeySession(
  docaiApiKey: string
): Promise<string> {
  return new SignJWT({
    docaiApiKey,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(sessionSecret());
}

export async function decryptApiKeySession(
  encryptedToken: string
): Promise<ApiKeySession | null> {
  // Resolve the secret outside the try/catch below: that catch exists to
  // turn a malformed/expired/invalid token into a null session, not to
  // swallow a misconfigured server (missing SESSION_SECRET). Keeping this
  // call outside lets that error propagate instead of masquerading as an
  // ordinary "session expired".
  const secret = sessionSecret();
  try {
    const { payload } = await jwtVerify(encryptedToken, secret);
    return {
      apiKey: payload.docaiApiKey as string,
      expiresAt: (payload.exp as number) * 1000,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieHeader(encryptedToken: string): string {
  // 30 days: a key's own expiry (none / 1 year / 30 / 7 days) is configured
  // per key in the platform and isn't exposed by the API, so this cookie
  // can't mirror it — an expired or revoked key simply 401s on next use.
  return `${COOKIE_NAME}=${encryptedToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`;
}

export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME };
