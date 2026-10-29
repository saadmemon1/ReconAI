// Re-runs the petty-cash matcher and report (b_match.py, c_report.py) for the workspace's data folder.
// Same gate as the report route; the healer never runs here (its inputs are already in the folder).
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { resolveApiKey, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { canAccessKb, findFolderForKb, parseRunSummary, runPettyCash } from '@/lib/petty-cash';

const REPO_ROOT = process.cwd();

export async function POST(req: NextRequest, { params }: { params: Promise<{ kbId: string }> }) {
  const apiKey = await resolveApiKey(req.cookies.get(COOKIE_NAME)?.value);
  if (!apiKey) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { kbId } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(kbId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessKb(kbId, apiKey, () => docaiFetch('/v1/knowledge-bases', { docaiApiKey: apiKey })))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const folder = findFolderForKb(join(REPO_ROOT, 'data'), kbId);
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const { stdout, durationMs } = await runPettyCash(REPO_ROOT, folder);
    return NextResponse.json({ ok: true, durationMs, ...parseRunSummary(stdout) });
  } catch (e) {
    const err = e as { message?: string; stderr?: string };
    const busy = /already in progress/.test(err.message || '');
    return NextResponse.json({ error: busy ? err.message : 'Run failed', detail: (err.stderr || err.message || '').slice(-600) }, { status: busy ? 409 : 500 });
  }
}
