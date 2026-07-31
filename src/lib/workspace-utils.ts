export interface Workspace {
  id: string;
  name: string;
}

export type UploadTargetMode = 'existing' | 'new';

/**
 * Resolve where an upload should go based on user's choice.
 * - mode 'existing': returns the matching workspace from the list (id null if not found)
 * - mode 'new': returns trimmed new name (id null = caller must create it first)
 */
export function resolveUploadTarget(
  workspaces: Workspace[],
  mode: UploadTargetMode,
  existingId: string | null,
  newName: string
): { id: string | null; name: string } {
  if (mode === 'existing') {
    const ws = workspaces.find(w => w.id === existingId);
    return ws ? { id: ws.id, name: ws.name } : { id: null, name: '' };
  }
  const trimmed = newName.trim();
  return trimmed ? { id: null, name: trimmed } : { id: null, name: '' };
}
