/**
 * Production DocAI nests file metadata under a `file` envelope
 * (`{ file: { filename, ... } }`) on both `GET /v1/files/{id}` and
 * `GET /v1/files/{id}?include=processing`, instead of the flat shape the
 * old dev tunnel returned. Unwrap here once so callers stay
 * backward-compatible with either shape.
 */
export function unwrapFile<T>(data: unknown): T {
  if (data && typeof data === 'object' && 'file' in data) {
    return (data as { file: T }).file;
  }
  return data as T;
}
