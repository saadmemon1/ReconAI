import { docaiFetch } from './docai-proxy';

/** Extract currentOrgId from a DocAI session response (nested or flat). */
export function extractOrgId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const s = (data as { session?: { currentOrgId?: unknown } }).session;
  const orgId = s?.currentOrgId ?? (data as { currentOrgId?: unknown }).currentOrgId;
  return typeof orgId === 'string' ? orgId : '';
}

/**
 * Fetch the user's current organization id from DocAI's session endpoint.
 * Used right after sign-in/sign-up so the encrypted JWT can carry a real
 * orgId (F5 fix) — DocAI's file/KB endpoints require x-docai-org-id.
 */
export async function fetchCurrentOrgId(docaiSessionToken: string): Promise<string> {
  try {
    const res = await docaiFetch('/v1/auth/session', {
      docaiSessionToken,
    });
    if (!res.ok) return '';
    const data = await res.json();
    return extractOrgId(data);
  } catch {
    return '';
  }
}
