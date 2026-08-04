import { describe, test, expect } from 'bun:test';
import {
  isSafeSegment,
  isDocAIUuid,
  isAllowedProxyPath,
  isSafeProxyPath,
} from '../proxy-path-validation';

const UUID = '255b204b-d7bb-4f2e-87e6-bca46e306524';
const JOB = '8f146b22-4a5f-4e7a-93a2-b19c605066e1';

describe('isSafeSegment', () => {
  test('accepts plain alphanumerics, dash, underscore', () => {
    expect(isSafeSegment('files')).toBe(true);
    expect(isSafeSegment('parse')).toBe(true);
    expect(isSafeSegment('bulk')).toBe(true);
    expect(isSafeSegment('a-b_c')).toBe(true);
  });

  test('rejects traversal and encoding primitives', () => {
    expect(isSafeSegment('..')).toBe(false);
    expect(isSafeSegment('.')).toBe(false);
    expect(isSafeSegment('%2e%2e')).toBe(false);
    expect(isSafeSegment('..%2f')).toBe(false);
    expect(isSafeSegment('..\\..')).toBe(false);
    expect(isSafeSegment('a/b')).toBe(false);
    expect(isSafeSegment('a%2fb')).toBe(false);
    expect(isSafeSegment('a b')).toBe(false);
    expect(isSafeSegment('')).toBe(false);
  });
});

describe('isDocAIUuid', () => {
  test('accepts standard UUIDs', () => {
    expect(isDocAIUuid(UUID)).toBe(true);
    expect(isDocAIUuid(JOB)).toBe(true);
    expect(isDocAIUuid('41b637e8-0734-43ea-8819-5f07f58a0efe')).toBe(true);
  });

  test('rejects non-UUIDs (traversal, paths, garbage)', () => {
    expect(isDocAIUuid('../api-keys')).toBe(false);
    expect(isDocAIUuid('../../internal/api-keys/verify')).toBe(false);
    expect(isDocAIUuid('api-keys')).toBe(false);
    expect(isDocAIUuid('files')).toBe(false);
    expect(isDocAIUuid('')).toBe(false);
  });
});

describe('isAllowedProxyPath', () => {
  test('accepts every real UI path shape', () => {
    expect(isAllowedProxyPath(['files'])).toBe(true);
    expect(isAllowedProxyPath(['files', 'parse', 'bulk'])).toBe(true);
    expect(isAllowedProxyPath(['files', UUID])).toBe(true);
    expect(isAllowedProxyPath(['files', UUID, 'content'])).toBe(true);
    expect(isAllowedProxyPath(['files', UUID, 'segments'])).toBe(true);
    expect(isAllowedProxyPath(['files', UUID, 'jobs', JOB])).toBe(true);
    expect(isAllowedProxyPath(['knowledge-bases'])).toBe(true);
    expect(isAllowedProxyPath(['knowledge-bases', UUID])).toBe(true);
    expect(isAllowedProxyPath(['ai', 'models'])).toBe(true);
    expect(isAllowedProxyPath(['billing', 'credits'])).toBe(true);
  });

  test('rejects non-UUID ids in id positions', () => {
    expect(isAllowedProxyPath(['files', '..'])).toBe(false);
    expect(isAllowedProxyPath(['files', '../api-keys'])).toBe(false);
    expect(isAllowedProxyPath(['knowledge-bases', '..'])).toBe(false);
    expect(isAllowedProxyPath(['files', UUID, 'jobs', '..'])).toBe(false);
  });

  test('rejects internal/admin/health/unknown paths', () => {
    expect(isAllowedProxyPath(['internal', 'api-keys', 'verify'])).toBe(false);
    expect(isAllowedProxyPath(['internal', 'files', 'authorize'])).toBe(false);
    expect(isAllowedProxyPath(['internal', 'usage', 'commit'])).toBe(false);
    expect(isAllowedProxyPath(['health'])).toBe(false);
    expect(isAllowedProxyPath(['openapi.json'])).toBe(false);
    expect(isAllowedProxyPath(['auth', 'guest'])).toBe(false);
    expect(isAllowedProxyPath(['api-keys'])).toBe(false);
    expect(isAllowedProxyPath(['billing', 'webhooks', 'stripe'])).toBe(false);
    expect(isAllowedProxyPath(['team'])).toBe(false);
    expect(isAllowedProxyPath(['team', 'members'])).toBe(false);
  });

  test('rejects unknown sub-paths under allowed roots', () => {
    expect(isAllowedProxyPath(['files', UUID, 'admin'])).toBe(false);
    expect(isAllowedProxyPath(['files', UUID, 'delete-all'])).toBe(false);
    expect(isAllowedProxyPath(['files', 'parse'])).toBe(false); // only parse/bulk allowed
    expect(isAllowedProxyPath(['knowledge-bases', UUID, 'members'])).toBe(false);
  });

  test('rejects empty and oversized paths', () => {
    expect(isAllowedProxyPath([])).toBe(false);
    expect(isAllowedProxyPath(['files', UUID, 'jobs', JOB, 'extra'])).toBe(false);
  });
});

describe('isSafeProxyPath (combined gate)', () => {
  test('accepts real paths', () => {
    expect(isSafeProxyPath(['files', UUID])).toBe(true);
    expect(isSafeProxyPath(['files', UUID, 'jobs', JOB])).toBe(true);
  });

  test('rejects traversal even if shape looks close', () => {
    expect(isSafeProxyPath(['files', '..%2e%2e', 'health'])).toBe(false);
    expect(isSafeProxyPath(['files', '%2e%2e%2f%2e%2e%2fhealth'])).toBe(false);
    expect(isSafeProxyPath(['files', '..%5c..%5cadmin'])).toBe(false);
    expect(isSafeProxyPath(['..', '..', 'health'])).toBe(false);
  });
});
