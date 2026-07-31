import { describe, test, expect } from 'bun:test';
import { resolveUploadTarget } from '../workspace-utils';

const workspaces = [
  { id: 'ws-1', name: 'Karachi Print' },
  { id: 'ws-2', name: 'Northbridge' },
];

describe('resolveUploadTarget', () => {
  test('existing mode returns the matching workspace', () => {
    const result = resolveUploadTarget(workspaces, 'existing', 'ws-1', 'ignored');
    expect(result).toEqual({ id: 'ws-1', name: 'Karachi Print' });
  });

  test('existing mode with unknown id returns empty target', () => {
    const result = resolveUploadTarget(workspaces, 'existing', 'nope', 'ignored');
    expect(result).toEqual({ id: null, name: '' });
  });

  test('existing mode with null id returns empty target', () => {
    const result = resolveUploadTarget(workspaces, 'existing', null, 'ignored');
    expect(result).toEqual({ id: null, name: '' });
  });

  test('new mode returns trimmed name with null id (caller creates it)', () => {
    const result = resolveUploadTarget(workspaces, 'new', 'ignored', '  New Workspace  ');
    expect(result).toEqual({ id: null, name: 'New Workspace' });
  });

  test('new mode with blank name returns empty target', () => {
    const result = resolveUploadTarget(workspaces, 'new', 'ignored', '   ');
    expect(result).toEqual({ id: null, name: '' });
  });
});
