import { describe, test, expect } from 'bun:test';
import { encryptApiKeySession, decryptApiKeySession } from '../session';

// session.ts must read process.env.SESSION_SECRET lazily (inside the
// functions that need it), not at module scope — otherwise import order
// determines whether the secret is picked up, and a missing/unset secret
// surfaces as a cryptic jose error instead of a clear one.
describe('session secret handling when SESSION_SECRET is unset', () => {
  test('encryptApiKeySession throws a clear error', async () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      await expect(encryptApiKeySession('sk-tok')).rejects.toThrow(
        'SESSION_SECRET is not set'
      );
    } finally {
      if (original !== undefined) process.env.SESSION_SECRET = original;
    }
  });

  test('decryptApiKeySession throws a clear error rather than swallowing it into a generic null', async () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      await expect(decryptApiKeySession('sometoken')).rejects.toThrow(
        'SESSION_SECRET is not set'
      );
    } finally {
      if (original !== undefined) process.env.SESSION_SECRET = original;
    }
  });
});
