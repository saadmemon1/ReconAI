# Petty-Cash Report Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the petty-cash scripts' `report.html` inside ReconAI's Report tab for the workspace it belongs to, without changing the report.

**Architecture:** A GET route under `/api/petty-cash/<kbId>/<path>` finds the `data/<client>/` folder whose `config.json` carries that `kb_id` and streams an allowlisted file from it, behind the same session gate as the DocAI proxy. `ReconcileRunner` probes the route once and, when it answers 200, shows a pill that swaps the pane body for a same-origin iframe of the report. Pure helpers (folder lookup, path allowlist) live in `src/lib/petty-cash.ts` and are the only code with unit tests.

**Tech Stack:** Next.js 16 App Router route handlers (Web `Request`/`Response`, awaited `params`), React 19, bun:test. Spec: `docs/superpowers/specs/2026-10-23-petty-cash-report-link-design.md`.

## Global Constraints

- Branch `feat/abujhd-second-pass`. Nothing under `scripts/` changes except `config.example.json`; nothing under `data/` changes except adding `"kb_id"` to one `config.json`.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before touching the route: `params` is a Promise, handlers return plain `Response`.
- Session gate is `resolveApiKey(req.cookies.get(COOKIE_NAME)?.value)` from `@/lib/session`, exactly as `src/app/api/docai/[...path]/route.ts`.
- Allowed report paths are exactly `report.html`, `pages/<name>.png`, `crops/<name>.png`; every segment must satisfy `isSafeSegment`-style plain chars plus a dot for the extension: `/^[A-Za-z0-9_.-]+$/` and not `..`.
- Responses carry `Cache-Control: no-store`. Content types: `text/html; charset=utf-8` for `.html`, `image/png` for `.png`.
- Tests are bun:test files under `src/lib/__tests__/`; run with `bun test`. Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/petty-cash.ts` | Pure helpers: `findFolderForKb(dataDir, kbId)` and `isAllowedReportPath(segments)`. No Next imports. |
| `src/lib/__tests__/petty-cash.test.ts` | bun:test for both helpers, using a temp dir. |
| `src/app/api/petty-cash/[kbId]/[...path]/route.ts` | GET: gate, lookup, allowlist, stream file. |
| `src/components/reconcile-runner.tsx` | Probe + pill + iframe view in the Report pane. |
| `scripts/abujhd/config.example.json` | Documents the optional `kb_id` field. |
| `docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md` | One line under "Running another month" about `kb_id`. |

---

### Task 1: `src/lib/petty-cash.ts` — folder lookup and path allowlist

**Files:**
- Create: `src/lib/petty-cash.ts`
- Test: `src/lib/__tests__/petty-cash.test.ts`

**Interfaces:**
- Produces: `findFolderForKb(dataDir: string, kbId: string): string | null` — absolute path of the first `dataDir/*/` whose `config.json` has `kb_id === kbId`, else `null`; tolerates a missing `dataDir` and unparsable configs.
- Produces: `isAllowedReportPath(segments: string[]): boolean` — true only for `['report.html']`, `['pages', '<name>.png']`, `['crops', '<name>.png']` with plain-safe segments.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/petty-cash.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findFolderForKb, isAllowedReportPath } from '../petty-cash';

const KB = '1cd041cc-d3a8-4c35-bf70-ac4ad8f72c5a';
let data: string;

beforeAll(() => {
  data = mkdtempSync(join(tmpdir(), 'petty-'));
  mkdirSync(join(data, 'abujhd'));
  writeFileSync(join(data, 'abujhd', 'config.json'), JSON.stringify({ kb_id: KB, month: '2026-09' }));
  mkdirSync(join(data, 'other'));
  writeFileSync(join(data, 'other', 'config.json'), JSON.stringify({ kb_id: 'zzz' }));
  mkdirSync(join(data, 'nokb'));
  writeFileSync(join(data, 'nokb', 'config.json'), JSON.stringify({ month: '2026-08' }));
  mkdirSync(join(data, 'broken'));
  writeFileSync(join(data, 'broken', 'config.json'), '{not json');
  writeFileSync(join(data, 'stray.txt'), 'x');
});
afterAll(() => rmSync(data, { recursive: true, force: true }));

describe('findFolderForKb', () => {
  test('returns the folder whose config.json carries the kb_id', () => {
    expect(findFolderForKb(data, KB)).toBe(join(data, 'abujhd'));
  });
  test('ignores folders with another or no kb_id, broken configs, and stray files', () => {
    expect(findFolderForKb(data, 'nope')).toBeNull();
  });
  test('tolerates a missing data dir', () => {
    expect(findFolderForKb(join(data, 'missing'), KB)).toBeNull();
  });
});

describe('isAllowedReportPath', () => {
  test('accepts the three shapes', () => {
    expect(isAllowedReportPath(['report.html'])).toBe(true);
    expect(isAllowedReportPath(['pages', 'page-01.png'])).toBe(true);
    expect(isAllowedReportPath(['crops', 'stmt-624417160330.png'])).toBe(true);
  });
  test('rejects traversal, nesting, other names and extensions', () => {
    expect(isAllowedReportPath(['..', 'config.json'])).toBe(false);
    expect(isAllowedReportPath(['pages', '..', 'config.json'])).toBe(false);
    expect(isAllowedReportPath(['pages', 'a', 'b.png'])).toBe(false);
    expect(isAllowedReportPath(['config.json'])).toBe(false);
    expect(isAllowedReportPath(['pages', 'x.svg'])).toBe(false);
    expect(isAllowedReportPath(['pages', 'a%2f.png'])).toBe(false);
    expect(isAllowedReportPath([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/__tests__/petty-cash.test.ts`
Expected: FAIL — `Cannot find module '../petty-cash'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/petty-cash.ts
// Petty-cash report folders: data/<client>/ with a config.json whose kb_id names the DocAI workspace.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

/** report.html | pages/<name>.png | crops/<name>.png, every segment plain-safe (no '..', no '%', no '/'). */
export function isAllowedReportPath(segments: string[]): boolean {
  if (!segments.every(s => PLAIN.test(s) && s !== '..' && s !== '.')) return false;
  if (segments.length === 1) return segments[0] === 'report.html';
  return segments.length === 2 && (segments[0] === 'pages' || segments[0] === 'crops') && segments[1].endsWith('.png');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/__tests__/petty-cash.test.ts`
Expected: `7 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/petty-cash.ts src/lib/__tests__/petty-cash.test.ts
git commit -m "Add petty-cash folder lookup and report path allowlist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Route `GET /api/petty-cash/[kbId]/[...path]` and the `kb_id` config field

**Files:**
- Create: `src/app/api/petty-cash/[kbId]/[...path]/route.ts`
- Modify: `scripts/abujhd/config.example.json`
- Modify: `docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md` ("Running another month", step 1)
- Modify (local, git-ignored): the chosen `data/<client>/config.json` gets `"kb_id"`

**Interfaces:**
- Consumes: `findFolderForKb`, `isAllowedReportPath` from Task 1; `resolveApiKey`, `COOKIE_NAME` from `@/lib/session`.
- Produces: HTTP `GET /api/petty-cash/<kbId>/report.html` → 200 HTML; `/pages/<n>.png`, `/crops/<n>.png` → 200 PNG; 401 without a session; 404 for unknown workspace, disallowed path or missing file. `HEAD` answered the same way (Next derives it from `GET`).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/petty-cash/[kbId]/[...path]/route.ts
// Serves the petty-cash scripts' report.html and its images for the workspace whose data/<client>/config.json
// carries that kb_id. Read-only, allowlisted paths, same session gate as the DocAI proxy.
import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveApiKey, COOKIE_NAME } from '@/lib/session';
import { findFolderForKb, isAllowedReportPath } from '@/lib/petty-cash';

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
  const folder = findFolderForKb(DATA_DIR, kbId);
  const file = folder && join(folder, ...path);
  if (!file || !existsSync(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const html = path[path.length - 1].endsWith('.html');
  return new Response(readFileSync(file), {
    headers: {
      'Content-Type': html ? 'text/html; charset=utf-8' : 'image/png',
      'Cache-Control': 'no-store',
    },
  });
}
```

- [ ] **Step 2: Document the field**

`scripts/abujhd/config.example.json` becomes:

```json
{"files": {"receipts": "00000000-0000-0000-0000-000000000001", "statement": "00000000-0000-0000-0000-000000000002", "ledger": "00000000-0000-0000-0000-000000000003"},
 "names": {"receipts": "receipts.pdf", "statement": "statement.pdf", "ledger": "ledger.xlsx"},
 "month": "2026-09", "sheet": "General Ledger",
 "kb_id": "00000000-0000-0000-0000-000000000000"}
```

In the spec's "Running another month" step 1, append the sentence: `Add "kb_id" (the DocAI workspace id) if the report should open inside ReconAI's Report tab; only one folder may carry a given kb_id.`

- [ ] **Step 3: Point one folder at the workspace (local only)**

Add `"kb_id": "1cd041cc-d3a8-4c35-bf70-ac4ad8f72c5a"` to the `config.json` of whichever folder is the source of truth (`data/abujhd` or `data/abujhd-local`). `data/` is git-ignored; nothing to commit for this step.

- [ ] **Step 4: Verify with curl against the dev server**

Run (dev server on 3001; the env-key fallback is on, so no cookie is needed for 200):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -I http://localhost:3001/api/petty-cash/1cd041cc-d3a8-4c35-bf70-ac4ad8f72c5a/report.html
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/petty-cash/1cd041cc-d3a8-4c35-bf70-ac4ad8f72c5a/pages/page-01.png
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/petty-cash/1cd041cc-d3a8-4c35-bf70-ac4ad8f72c5a/config.json
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/petty-cash/00000000-0000-0000-0000-000000000000/report.html
```

Expected: `200`, `200`, `404`, `404`. To see the 401, temporarily comment out `DOCAI_API_KEY` in `.env.local`, restart `bun dev`, repeat the first command (expect `401`), then restore it.

- [ ] **Step 5: Run the whole suite and commit**

Run: `bun test` — expected all pass (previous 249 plus the 7 from Task 1).

```bash
git add 'src/app/api/petty-cash/[kbId]/[...path]/route.ts' scripts/abujhd/config.example.json docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md
git commit -m "Serve the petty-cash report for a workspace behind the session gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: "Petty-cash report" pill and iframe in the Report tab

**Files:**
- Modify: `src/components/reconcile-runner.tsx` (imports at lines 1-8; the `return (` JSX starting at `<h2 className="text-h3 mb-4">Report</h2>`)

**Interfaces:**
- Consumes: `HEAD /api/petty-cash/<kbId>/report.html` from Task 2 (200 means a report exists).
- Produces: nothing new for other modules.

- [ ] **Step 1: Add state and the probe**

Inside `ReconcileRunner`, next to the other `useState` hooks, add:

```tsx
const [pettyCashUrl, setPettyCashUrl] = useState<string | null>(null);
const [showPettyCash, setShowPettyCash] = useState(false);

// One probe per workspace: a 200 means the scripts' report exists for this kbId.
useEffect(() => {
  const url = `/api/petty-cash/${kbId}/report.html`;
  let cancelled = false;
  setPettyCashUrl(null); setShowPettyCash(false);
  fetch(url, { method: 'HEAD' })
    .then(r => { if (!cancelled && r.ok) setPettyCashUrl(url); })
    .catch(() => { /* no pill */ });
  return () => { cancelled = true; };
}, [kbId]);
```

- [ ] **Step 2: Replace the heading and wrap the body**

Replace `<h2 className="text-h3 mb-4">Report</h2>` with:

```tsx
<div className="mb-4 flex items-center justify-between gap-3">
  <h2 className="text-h3">Report</h2>
  {pettyCashUrl && (
    <button
      type="button"
      onClick={() => setShowPettyCash(v => !v)}
      className="rounded-full border border-border px-3 py-1 text-xs text-secondary hover:text-foreground"
    >
      {showPettyCash ? 'Back to reconciliation' : 'Petty-cash report'}
    </button>
  )}
</div>
{showPettyCash && pettyCashUrl ? (
  <iframe
    src={pettyCashUrl}
    title="Petty-cash report"
    className="w-full rounded-xl border border-border bg-white"
    style={{ height: 'calc(100vh - 160px)' }}
  />
) : (
  <>
```

and close the fragment right before the component's final `</div>`:

```tsx
  </>
)}
```

The `details`, `error` and `report ?` blocks stay exactly as they are inside the fragment.

- [ ] **Step 3: Type-check and lint**

Run: `bunx tsc --noEmit 2>&1 | grep -v __tests__` — expected no output. Run: `bun run lint` — expected clean.

- [ ] **Step 4: Verify in the browser**

With `bun dev -p 3001` running and the chosen folder carrying `kb_id` (Task 2 step 3): open http://localhost:3001, select the ABUJHD workspace, open the Report tab. Expected: the "Petty-cash report" pill is present; clicking it shows the report with its hero tiles inside the pane; clicking a receipt thumbnail opens the page overlay inside the iframe and Escape closes it; "Back to reconciliation" restores the empty state or the LLM report. Switch to another workspace: no pill.

- [ ] **Step 5: Commit**

```bash
git add src/components/reconcile-runner.tsx
git commit -m "Open the petty-cash report inside the Report tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- Mapping via `kb_id` → Task 1 (`findFolderForKb`) + Task 2 steps 2-3. First match in sorted directory order; spec says operator keeps it unique.
- Route gate, lookup, allowlist, content types, `no-store`, HEAD → Task 2 step 1.
- Pill on 200, iframe same-origin, no change when absent → Task 3.
- Tests: helpers only, bun:test → Task 1; curl + browser checks → Tasks 2 and 3.
- Out of scope untouched: no scripts run from UI, no findings integration, no picker.
