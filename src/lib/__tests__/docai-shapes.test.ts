import { describe, test, expect } from 'bun:test';
import { unwrapFile } from '../docai-shapes';

describe('unwrapFile', () => {
  test('unwraps a nested { file: {...} } envelope', () => {
    expect(unwrapFile({ file: { filename: 'a.pdf' } })).toEqual({ filename: 'a.pdf' });
  });

  test('passes through a flat (non-nested) shape unchanged', () => {
    expect(unwrapFile({ filename: 'a.pdf' })).toEqual({ filename: 'a.pdf' });
  });

  test('returns null/undefined input as-is', () => {
    expect(unwrapFile(null)).toBeNull();
    expect(unwrapFile(undefined)).toBeUndefined();
  });
});
