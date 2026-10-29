import { test, expect, afterEach } from 'bun:test';

process.env.SESSION_SECRET = 'test-secret-for-resolve';
const { encryptApiKeySession, resolveApiKey } = await import('../session');

afterEach(() => { delete process.env.DOCAI_API_KEY; });

test('resolveApiKey: cookie wins, env is the fallback, else null', async () => {
  const cookie = await encryptApiKeySession('cookie-key');
  process.env.DOCAI_API_KEY = 'env-key';
  expect(await resolveApiKey(cookie)).toBe('cookie-key');
  expect(await resolveApiKey(undefined)).toBe('env-key');
  expect(await resolveApiKey('not-a-jwt')).toBe('env-key');
  delete process.env.DOCAI_API_KEY;
  expect(await resolveApiKey(undefined)).toBeNull();
  expect(await resolveApiKey('not-a-jwt')).toBeNull();
});
