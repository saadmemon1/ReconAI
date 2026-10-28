// Sets a rule a person decides (the rounding rule) in the workspace's overrides.json, signed by the reviewer. Same gate as the report route.
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { resolveApiKey, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { canAccessKb, findFolderForKb, readJsonFile, writeJsonFile } from '@/lib/petty-cash';
import { recordRule } from '@/lib/review-queue';

const DATA_DIR = join(process.cwd(), 'data');

export async function POST(req: NextRequest, { params }: { params: Promise<{ kbId: string }> }) {
  const apiKey = await resolveApiKey(req.cookies.get(COOKIE_NAME)?.value);
  if (!apiKey) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { kbId } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(kbId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAccessKb(kbId, apiKey, () => docaiFetch('/v1/knowledge-bases', { docaiApiKey: apiKey })))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const folder = findFolderForKb(DATA_DIR, kbId);
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body: { max?: unknown; applies?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const file = join(folder, 'overrides.json');
  const out = recordRule(readJsonFile(file, {}), body, new Date().toISOString());
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 400 });
  writeJsonFile(file, out.overrides);
  return NextResponse.json({ ok: true, rules: out.overrides.rules, rerun: true });
}
