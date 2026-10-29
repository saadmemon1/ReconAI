// Serves the petty-cash scripts' report.json and its page/crop images for the workspace whose data/<client>/config.json
// carries that kb_id. Read-only, allowlisted paths, same session gate as the DocAI proxy.
import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveApiKey, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { canAccessKb, findFolderForKb, isAllowedReportPath } from '@/lib/petty-cash';

const DATA_DIR = join(process.cwd(), 'data');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kbId: string; path: string[] }> }
) {
  const apiKey = await resolveApiKey(req.cookies.get(COOKIE_NAME)?.value);
  if (!apiKey) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { kbId, path } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(kbId) || !isAllowedReportPath(path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canAccessKb(kbId, apiKey, () => docaiFetch('/v1/knowledge-bases', { docaiApiKey: apiKey })))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const folder = findFolderForKb(DATA_DIR, kbId);
  const file = folder && join(folder, ...path);
  if (!file || !existsSync(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const json = path[path.length - 1].endsWith('.json');
  return new Response(readFileSync(file), {
    headers: {
      'Content-Type': json ? 'application/json; charset=utf-8' : 'image/png',
      // report.json is rewritten by a Run; page and crop PNGs are written only by a_refine.py, which the app never runs.
      'Cache-Control': json ? 'no-store' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
