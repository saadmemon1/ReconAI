import { describe, test, expect } from 'bun:test';
import { extractOrgId, extractOrgName } from '../session-org';

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

describe('extractOrgName (org display name from DocAI session response)', () => {
  const orgs = [
    { id: 'org-a', name: 'Acme Corp' },
    { id: 'org-b', name: 'Beta Ltd' },
  ];

  test('matches the current org by id', () => {
    expect(extractOrgName({ session: { organizations: orgs, currentOrgId: 'org-b' } })).toBe('Beta Ltd');
  });

  test('falls back to the first org when currentOrgId is missing', () => {
    expect(extractOrgName({ session: { organizations: orgs } })).toBe('Acme Corp');
  });

  test('unknown currentOrgId falls back to the first org', () => {
    expect(extractOrgName({ session: { organizations: orgs, currentOrgId: 'org-zzz' } })).toBe('Acme Corp');
  });

  test('accepts a flat organizations array', () => {
    expect(extractOrgName({ organizations: orgs, currentOrgId: 'org-a' })).toBe('Acme Corp');
  });

  test('missing organizations returns empty string', () => {
    expect(extractOrgName({ session: { user: {} } })).toBe('');
    expect(extractOrgName({})).toBe('');
    expect(extractOrgName(null)).toBe('');
    expect(extractOrgName('nope')).toBe('');
  });

  test('non-string org name returns empty', () => {
    expect(extractOrgName({ session: { organizations: [{ id: 'org-a', name: 42 }], currentOrgId: 'org-a' } })).toBe('');
    expect(extractOrgName({ session: { organizations: [{ id: 'org-a' }], currentOrgId: 'org-a' } })).toBe('');
  });
});
