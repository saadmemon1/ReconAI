import { describe, test, expect } from 'bun:test';
import { isFileParsed } from '../file-status';

describe('isFileParsed (server-side parse status from ?include=processing)', () => {
  test('true when latest parse job completed', () => {
    const file = {
      id: 'f1',
      filename: 'a.pdf',
      processing: { latest_parse_job: { status: 'completed', percent: 100 } },
    };
    expect(isFileParsed(file)).toBe(true);
  });

  test('false when job is queued or running', () => {
    for (const status of ['queued', 'running', 'in_progress', 'pending']) {
      const file = {
        id: 'f1',
        filename: 'a.pdf',
        processing: { latest_parse_job: { status, percent: 50 } },
      };
      expect(isFileParsed(file)).toBe(false);
    }
  });

  test('false when job failed or cancelled', () => {
    for (const status of ['failed', 'cancelled', 'error']) {
      const file = {
        id: 'f1',
        filename: 'a.pdf',
        processing: { latest_parse_job: { status } },
      };
      expect(isFileParsed(file)).toBe(false);
    }
  });

  test('false when no processing block at all', () => {
    expect(isFileParsed({ id: 'f1', filename: 'a.pdf' })).toBe(false);
    expect(isFileParsed({ id: 'f1', filename: 'a.pdf', processing: null })).toBe(false);
    expect(isFileParsed({ id: 'f1', filename: 'a.pdf', processing: {} })).toBe(false);
    expect(isFileParsed({ id: 'f1', filename: 'a.pdf', processing: { latest_parse_job: null } })).toBe(false);
  });

  test('false when latest parse job status is missing', () => {
    const file = {
      id: 'f1',
      filename: 'a.pdf',
      processing: { latest_parse_job: {} },
    };
    expect(isFileParsed(file)).toBe(false);
  });
});
