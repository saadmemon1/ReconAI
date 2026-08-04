import { describe, test, expect } from 'bun:test';
import { reportStorageKey, REPORT_KEY_PREFIX } from '../report-storage';

describe('reportStorageKey', () => {
  test('namespaces the key by workspace id', () => {
    expect(reportStorageKey('kb-abc')).toBe('reconai-last-report-kb-abc');
  });

  test('different workspaces get different keys', () => {
    expect(reportStorageKey('kb-abc')).not.toBe(reportStorageKey('kb-xyz'));
  });

  test('key is prefixed with the report key constant', () => {
    expect(reportStorageKey('kb-1').startsWith(REPORT_KEY_PREFIX)).toBe(true);
  });
});
