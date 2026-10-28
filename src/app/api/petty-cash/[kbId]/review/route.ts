// Records one review-queue decision for the workspace's data folder: reviews.json always, overrides.json too when the decision
// is a receipt verdict the matcher should use on its next run. Same gate as the report route.
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { resolveApiKey, COOKIE_NAME } from '@/lib/session';
import { docaiFetch } from '@/lib/docai-proxy';
import { canAccessKb, findFolderForKb, readJsonFile, writeJsonFile } from '@/lib/petty-cash';
import { EMPTY_REVIEWS, recordDecision, recordRemarks, type Reviews } from '@/lib/review-queue';

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

  let body: { id?: unknown; decision?: unknown; note?: unknown; remarks?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const reviewsFile = join(folder, 'reviews.json');
  const overridesFile = join(folder, 'overrides.json');
  const reviews = readJsonFile<Reviews>(reviewsFile, EMPTY_REVIEWS);
  const overrides = readJsonFile<Record<string, unknown>>(overridesFile, {});
  if (body.remarks !== undefined) {   // the reviewer's remarks on the sign-off page
    const r = recordRemarks(reviews, body.remarks, new Date().toISOString());
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    writeJsonFile(reviewsFile, r.reviews);
    return NextResponse.json({ ok: true, reviews: r.reviews, rerun: false });
  }
  const out = recordDecision(reviews, overrides, { id: body.id, decision: body.decision ?? null, note: body.note }, new Date().toISOString());
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 400 });

  writeJsonFile(reviewsFile, out.reviews);
  if (out.overrides !== overrides) writeJsonFile(overridesFile, out.overrides);
  return NextResponse.json({ ok: true, reviews: out.reviews, rerun: out.rerun });
}
