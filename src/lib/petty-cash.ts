// Petty-cash report folders: data/<client>/ with a config.json whose kb_id names the DocAI workspace.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PLAIN = /^[A-Za-z0-9_.-]+$/;

/** First data/<client>/ whose config.json has kb_id === kbId, else null. Missing dir and bad JSON are "no match". */
export function findFolderForKb(dataDir: string, kbId: string): string | null {
  if (!existsSync(dataDir)) return null;
  for (const name of readdirSync(dataDir).sort()) {
    const dir = join(dataDir, name);
    const cfg = join(dir, 'config.json');
    if (!statSync(dir).isDirectory() || !existsSync(cfg)) continue;
    try {
      if (JSON.parse(readFileSync(cfg, 'utf8')).kb_id === kbId) return dir;
    } catch {
      /* not this one */
    }
  }
  return null;
}

/** report.json | reviews.json | pages/<name>.png | crops/<name>.png, every segment plain-safe (no '..', no '%', no '/'). */
export function isAllowedReportPath(segments: string[]): boolean {
  if (!segments.every(s => PLAIN.test(s) && s !== '..' && s !== '.')) return false;
  if (segments.length === 1) return segments[0] === 'report.json' || segments[0] === 'reviews.json';
  return segments.length === 2 && (segments[0] === 'pages' || segments[0] === 'crops') && segments[1].endsWith('.png');
}

const ACCESS_TTL_MS = 5 * 60 * 1000;
// ponytail: unbounded Map, one entry per key+workspace; add eviction if this ever serves more than a handful of keys
const accessCache = new Map<string, { ok: boolean; at: number }>();
/** True when the DocAI key can see kbId: the workspace list, cached 5 min per key+kb so a report's hundreds of image requests don't each hit DocAI. Only a parsed 200 is cached; failures return false uncached. */
export async function canAccessKb(kbId: string, apiKey: string, listKbs: () => Promise<Response>): Promise<boolean> {
  const key = `${kbId}:${createHash('sha256').update(apiKey).digest('hex')}`;
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.ok;
  let ok: boolean;
  try {
    const res = await listKbs();
    if (!res.ok) return false;
    const body = await res.json();
    ok = Array.isArray(body.knowledge_bases) && body.knowledge_bases.some((k: { id?: string }) => k.id === kbId);
  } catch {
    return false;
  }
  accessCache.set(key, { ok, at: Date.now() });
  return ok;
}

/** b_match.py prints "rows: {'MATCHED': 76, ...}" and "receipts: {...}"; read those counts, ignore everything else. */
export function parseRunSummary(stdout: string): { rows: Record<string, number>; receipts: Record<string, number> } {
  const read = (label: string): Record<string, number> => {
    const line = stdout.split('\n').find(l => l.startsWith(`${label}: {`));
    if (!line) return {};
    const out: Record<string, number> = {};
    for (const m of line.slice(label.length + 2).matchAll(/'([A-Z_]+)': (\d+)/g)) out[m[1]] = Number(m[2]);
    return out;
  };
  return { rows: read('rows'), receipts: read('receipts') };
}

const running = new Set<string>();   // ponytail: one run per folder at a time, in-process only (single dev server)

/** Run qr_decode.ts (cached per page, so only new pages cost time), then b_match.py and c_report.py for one data folder with the
 *  repo's venv python. Rejects while a run is in flight. */
export async function runPettyCash(repoRoot: string, folder: string): Promise<{ stdout: string; durationMs: number }> {
  if (running.has(folder)) throw new Error('A run is already in progress for this workspace');
  running.add(folder);
  const started = Date.now();
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const python = existsSync(join(repoRoot, '.venv/bin/python')) ? join(repoRoot, '.venv/bin/python') : 'python3';
    const dataArg = ['--data', folder];
    // A first decode of a large pack takes minutes; the matcher reports a missing qr.json rather than guessing, so a failed decode is not fatal
    await run('bun', [join(repoRoot, 'scripts/abujhd/qr_decode.ts'), ...dataArg], { cwd: repoRoot, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 })
      .catch(e => console.error('qr_decode failed:', (e as Error).message));
    const match = await run(python, [join(repoRoot, 'scripts/abujhd/b_match.py'), ...dataArg], { cwd: repoRoot, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    await run(python, [join(repoRoot, 'scripts/abujhd/c_report.py'), ...dataArg], { cwd: repoRoot, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    return { stdout: match.stdout, durationMs: Date.now() - started };
  } finally {
    running.delete(folder);
  }
}

export function readJsonFile<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
}

/** Write beside, then rename: a reader never sees half a file. */
export function writeJsonFile(file: string, value: unknown): void {
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${file}.tmp`, file);
}
