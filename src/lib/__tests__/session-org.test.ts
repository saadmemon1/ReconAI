import { describe, test, expect } from 'bun:test';
import { extractOrgId } from '../session-org';

describe('extractOrgId (F5: org from DocAI session response)', () => {
  test('nested { session: { currentOrgId } } shape', () => {
    expect(extractOrgId({ session: { user: {}, currentOrgId: 'org-123' } })).toBe('org-123');
  });

  test('flat { currentOrgId } shape', () => {
    expect(extractOrgId({ currentOrgId: 'org-flat' })).toBe('org-flat');
  });

  test('missing org returns empty string', () => {
    expect(extractOrgId({ session: { user: {} } })).toBe('');
    expect(extractOrgId({})).toBe('');
    expect(extractOrgId(null)).toBe('');
    expect(extractOrgId('nope')).toBe('');
  });

  test('non-string org id returns empty', () => {
    expect(extractOrgId({ session: { currentOrgId: 42 } })).toBe('');
    expect(extractOrgId({ session: { currentOrgId: null } })).toBe('');
  });
});
