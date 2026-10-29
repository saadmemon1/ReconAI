# Petty-Cash Report UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iframed `report.html` with a React petty-cash report in the Report tab, in the app's DocAI design system, with a docked citation pane that opens the source page with the cited box drawn on it.

**Architecture:** `scripts/abujhd/c_report.py` becomes a pure emitter of `report.json` (a trimmed, UI-shaped copy of `matches.json`; coordinates stay in the matcher's 0-1000 page space). The existing `/api/petty-cash/[kbId]/...` route serves that JSON plus the page and crop PNGs. New client components under `src/components/petty-cash/` render KPI tiles, three tabbed tables and a citation pane; all logic that can be pure lives in `src/lib/petty-cash-report.ts` and is unit-tested with bun.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 tokens already in `src/app/globals.css`, shadcn-style `Table`/`Card`/`Button`/`Input` in `src/components/ui/`, lucide-react icons, bun test; Python 3 stdlib for the emitter.

Spec: `docs/superpowers/specs/2026-10-23-petty-cash-report-ui-design.md` (read it once; every value below comes from it).

## Global Constraints

- Work in the worktree `/Users/mujtabakamal/Projects/ReconAI/.claude/worktrees/petty-cash-report-ui` on branch `feat/petty-cash-report-ui`. Run every command from that directory. `data/` and `.venv` there are symlinks to the main checkout; never stage `.claude/launch.json`, `data`, `.venv` or `.env.local`. Stage files by name (`git add <paths>`), never `git add -A`.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No new npm or Python dependencies.
- `bun test` must stay green (262 tests before this plan). `bunx tsc --noEmit -p tsconfig.json` must report no errors outside files matching `__tests__` or `.test.ts` (those already fail on `bun:test` types and are not ours). `bunx eslint <every file you changed>` must be clean.
- `scripts/abujhd/a_refine.py` and `scripts/abujhd/b_match.py` are not touched. Python tests are plain scripts (`.venv/bin/python scripts/abujhd/test_x.py` prints `ok <name>` per test); there is no pytest.
- Every component file starts with `'use client';`. Only app tokens are used for colour: `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-primary`, `bg-muted`, `var(--status-ok|bad|review|warn)`, `var(--muted-foreground)`. No other hex or named colours except `bg-white` and `ring-black/5` on page images and `bg-amber-500` for the orange dot.
- Status vocabulary (word, glyph, tone) is exactly: MATCHED Matched ✓ ok · LINKED Linked ✓ ok · TIED "Tied to ledger" ✓ ok · MISSING_RECEIPT "Missing receipt" ✕ bad · ORPHAN "No card row" ✕ bad · REVIEW "Needs a decision" ? review · UNEXPLAINED "Not in ledger" ! warn · AMOUNT_MISMATCH "Amounts differ" ! warn · OTHER_MONTH "Another month" ! warn · ROLLUP "Roll-up of card spend" · muted · NO_CARD_TXN "No card transaction" ! warn · unknown → the raw status, · , muted. The word is always rendered beside the glyph.
- Boxes are `[x0, y0, x1, y1]` in 0-1000 page space and become `{left: x0/10 %, top: y0/10 %, width: (x1-x0)/10 %, height: (y1-y0)/10 %}`.
- Image URLs are `/api/petty-cash/${kbId}/${path}` where `path` is a `pages/…png` or `crops/…png` value from `report.json`.
- `money(n)` = `n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})`, empty string for non-numbers; `pct(num, den)` = `Math.round(num/den*100) + '%'`, `'0%'` when `den` is 0.
- Pane layout: `lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,45%)]` with the pane column `lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]`; below `lg` the pane is `fixed inset-0 z-50`.
- AGENTS.md: this Next.js version differs from training data; before editing a route handler read `node_modules/next/dist/docs/` for route handlers (`app/api/**/route.ts` still exports `GET`/`POST` with `params` as a Promise, as the existing routes do).

---

### Task 1: `c_report.py` emits `report.json`

**Files:**
- Rewrite: `scripts/abujhd/c_report.py` (the whole file; the HTML renderer goes away)
- Create: `scripts/abujhd/test_report.py`

**Interfaces:**
- Consumes: `matches.json` as written by `b_match.py` (`rows`, `receipts`, `ledger`, `tieout`, `summary`), `config.json` (`month`, `sheet`, `names`, optional `client`), the `pages/` folder listing. `common.load_json`, `common.save_json`, `common.config()`, `common.set_data()`, `common.DATA`, `common.PAGES`.
- Produces: `build_report(matches: dict, cfg: dict, page_files: list[str], now: datetime | None = None) -> dict` and `data/<client>/report.json` with the shape in the spec's "Data contract" section. Tasks 3–8 read that shape.

- [ ] **Step 1: Write the failing test**

Create `scripts/abujhd/test_report.py`:

```python
# scripts/abujhd/test_report.py
import sys, pathlib
from datetime import datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from c_report import build_report


def cite_s(ref):
    return {"file": "s.pdf", "page": 1, "ref": ref, "y": 1.0, "orange": False, "crop": f"crops/stmt-{ref}.png", "box": [0, 10, 1000, 15]}


def cite_r(gid, page):
    return {"file": "r.pdf", "page": page, "group_id": gid, "box": [100, 100, 500, 900], "crop": f"crops/{gid}.png"}


LEDGER_CITE = {"file": "l.xlsx", "sheet": "GL", "row": 9, "cell": "B9", "code": "ROLL", "date": "2026-09-30", "amount": 300.0, "relation": "rolled-up"}


def row(ref, amount, kind, status, receipts=(), ledger=LEDGER_CITE):
    return {"ref": ref, "amount": amount, "date": "2026-09-05", "time": "10:00:00", "balance": 1.0, "type": "Financial",
            "merchant": "SHOP", "txn_code": "0", "load_type": "Unknown", "kind": kind, "y": 1.0, "orange": True,
            "crop": "x.png", "box": [0, 0, 1, 1], "receipt_ids": [c["group_id"] for c in receipts], "status": status, "reason": "why",
            "citations": {"statement": cite_s(ref), "receipts": list(receipts), "ledger": ledger}}


def group(gid, page, status, fields=None, amounts=(), refs=(), review=()):
    return {"id": gid, "page": page, "pages": [page], "box": [100, 100, 500, 900], "segment_ids": ["x"], "text": "long healer text",
            "amounts": [{"value": v, "total_candidate": t} for v, t in amounts], "dates": ["2026-09-04"],
            "merchant_candidates": ["CAND"], "candidates": [], "linkable": True, "broken": [], "fields": fields,
            "confidence": 0.9, "notes": None, "kind": "receipt", "crop": f"crops/{gid}.png", "ids": [gid], "boxes": [],
            "ref": None, "refs": list(refs), "status": status, "review": list(review), "reason": "r",
            "citations": {"receipt": [cite_r(gid, page)], "statement": None, "ledger": None}}


MATCHES = {
    "rows": [row("r1", 100.0, "purchase", "MATCHED", receipts=[cite_r("p1-g1", 1)]),
             row("r2", 50.0, "purchase", "MISSING_RECEIPT"),
             row("a1", 200.0, "atm", "UNEXPLAINED", ledger=None)],
    "receipts": [group("p1-g1", 1, "LINKED", fields={"merchant": "Healed Shop", "date": "2026-09-05", "total": 100.0},
                       amounts=[(100.0, True), (13.04, False), (100.0, True)], refs=["r1"]),
                 group("p2-g1", 2, "REVIEW", amounts=[(20.0, True), (10.0, True), (2.61, False)], review=[["r2", 6]])],
    "ledger": [{"code": "TOP", "date": "2026-09-01", "text": "Top up", "debit": 3000.0, "credit": None, "balance": 3000.0, "month": "2026-09", "sheet": "GL", "row": 2, "cell": "B2"},
               {"code": "ROLL", "date": "2026-09-30", "text": "Roll-up", "debit": None, "credit": 300.0, "balance": 2700.0, "month": "2026-09", "sheet": "GL", "row": 9, "cell": "B9"},
               {"code": "OLD", "date": "2026-08-01", "text": "Old", "debit": 10.0, "credit": None, "balance": 10.0, "month": "2026-08", "sheet": "GL", "row": 1, "cell": "B1"},
               {"code": "X", "date": "2026-09-10", "text": "Stray credit", "debit": None, "credit": 54.37, "balance": 0.0, "month": "2026-09", "sheet": "GL", "row": 5, "cell": "B5"}],
    "tieout": {"loads_vs_topups": {"statement": 3000.0, "ledger": 3000.0, "diff": 0.0, "n_statement": 1, "n_ledger": 1},
               "atm_vs_withdrawals": {"statement": 200.0, "ledger": 0, "diff": 200.0},
               "purchases_vs_rollup": {"statement": 350.0, "purchases_only": 150.0, "ledger": 300.0, "diff": -50.0, "rollup_codes": ["ROLL"]},
               "small_credits": [], "ledger_status": {"TOP|Top up": "TIED", "X|Stray credit": "UNEXPLAINED"}},
    "orange_vs_status": {},
    "summary": {"rows": {"MATCHED": 1, "MISSING_RECEIPT": 1, "UNEXPLAINED": 1}, "receipts": {"LINKED": 1, "REVIEW": 1}},
}
CFG = {"month": "2026-09", "sheet": "GL", "names": {"receipts": "r.pdf", "statement": "s.pdf", "ledger": "l.xlsx"}}
PAGES = ["statement-200.png", "page-02.png", "page-01.png", "notes.txt"]


def build():
    return build_report(MATCHES, CFG, PAGES, now=datetime(2026, 10, 23, 22, 0, 0))


def test_meta_and_page_list():
    m = build()["meta"]
    assert m["client"] == "ABUJHD" and m["month_label"] == "September 2026" and m["built_at"] == "2026-10-23T22:00:00"
    assert m["files"]["receipts"] == "r.pdf" and m["sheet"] == "GL"
    assert m["page_images"] == {"receipts": ["pages/page-01.png", "pages/page-02.png"], "statement": ["pages/statement-200.png"]}


def test_kpis():
    assert build()["kpis"] == {"card_spend": 350.0, "purchase_count": 2, "atm_count": 1, "purchases_amount": 150.0,
                               "evidenced_amount": 100.0, "rollup": 300.0, "open_gap": -50.0, "missing_count": 1, "missing_amount": 50.0}


def test_rows_are_trimmed_and_cite_without_file():
    rows = build()["rows"]
    r = rows[0]
    assert set(r) == {"ref", "amount", "date", "time", "merchant", "kind", "orange", "status", "reason", "receipt_ids", "citations"}
    assert r["citations"]["statement"] == {"page": 1, "ref": "r1", "y": 1.0, "orange": False, "crop": "crops/stmt-r1.png", "box": [0, 10, 1000, 15]}
    assert r["citations"]["receipts"][0]["group_id"] == "p1-g1" and "file" not in r["citations"]["receipts"][0]
    assert r["citations"]["ledger"]["cell"] == "B9" and "file" not in r["citations"]["ledger"]
    assert rows[2]["citations"]["ledger"] is None and rows[2]["citations"]["receipts"] == []


def test_receipts_drop_bulk_and_fill_fields():
    linked, review = build()["receipts"]
    for key in ("text", "segment_ids", "merchant_candidates", "dates", "ids", "boxes", "broken", "linkable", "candidates"):
        assert key not in linked
    assert linked["merchant"] == "Healed Shop" and linked["date"] == "2026-09-05" and linked["total"] == 100.0
    assert linked["amounts"] == [100.0, 13.04]   # de-duplicated, total candidates first
    assert linked["refs"] == ["r1"]
    assert linked["citations"] == [{"page": 1, "group_id": "p1-g1", "box": [100, 100, 500, 900], "crop": "crops/p1-g1.png"}]
    assert review["merchant"] == "CAND" and review["date"] == "2026-09-04" and review["total"] is None
    assert review["amounts"] == [10.0, 20.0, 2.61] and review["review"] == [["r2", 6]]


def test_ledger_status_rule():
    lines = build()["ledger"]
    assert {l["code"]: l["status"] for l in lines} == {"TOP": "TIED", "ROLL": "ROLLUP", "OLD": None, "X": "NO_CARD_TXN"}
    assert set(lines[0]) == {"code", "date", "text", "debit", "credit", "balance", "month", "row", "cell", "status"}


def test_counts_and_tieout_pass_through():
    r = build()
    assert r["counts"] == MATCHES["summary"]
    assert set(r["tieout"]) == {"loads_vs_topups", "atm_vs_withdrawals", "purchases_vs_rollup"}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python scripts/abujhd/test_report.py`
Expected: `ImportError: cannot import name 'build_report' from 'c_report'`

- [ ] **Step 3: Rewrite `c_report.py`**

Replace the entire file with:

```python
# scripts/abujhd/c_report.py
"""Step C: report.json, the UI-shaped copy of matches.json that the app's Report tab renders
(src/components/petty-cash/). Nothing here is styled; coordinates stay in the matcher's 0-1000 page space.
Spec: docs/superpowers/specs/2026-10-23-petty-cash-report-ui-design.md.
"""
import argparse, sys, pathlib
from datetime import datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import common
from common import load_json, save_json

ROW_KEYS = ("ref", "amount", "date", "time", "merchant", "kind", "orange", "status", "reason", "receipt_ids")
LEDGER_KEYS = ("code", "date", "text", "debit", "credit", "balance", "month", "row", "cell")
TIEOUT_KEYS = ("loads_vs_topups", "atm_vs_withdrawals", "purchases_vs_rollup")


def _cite(c):
    """A citation without its `file` key; meta.files names the sources."""
    return {k: v for k, v in c.items() if k != "file"} if c else None


def _row(r):
    c = r["citations"]
    out = {k: r.get(k) for k in ROW_KEYS}
    out["citations"] = {"statement": _cite(c["statement"]), "receipts": [_cite(x) for x in c.get("receipts") or []], "ledger": _cite(c.get("ledger"))}
    return out


def _receipt(g):
    f = g.get("fields") or {}
    totals = sorted({a["value"] for a in g.get("amounts", []) if a.get("total_candidate")})
    others = sorted({a["value"] for a in g.get("amounts", []) if not a.get("total_candidate")} - set(totals))
    return {"id": g["id"], "page": g["page"], "pages": g["pages"], "box": g["box"], "crop": g.get("crop"),
            "status": g["status"], "reason": g.get("reason"),
            "merchant": f.get("merchant") or (g.get("merchant_candidates") or [None])[0],
            "date": f.get("date") or (g.get("dates") or [None])[0],
            "total": f.get("total"), "amounts": totals + others,
            "confidence": g.get("confidence"), "notes": g.get("notes"),
            "refs": g.get("refs") or [], "review": g.get("review") or [],
            "citations": [_cite(c) for c in g["citations"]["receipt"]]}


def _ledger(lines, tieout):
    status = tieout["ledger_status"]; rollup = set(tieout["purchases_vs_rollup"]["rollup_codes"])
    out = []
    for l in lines:
        s = "ROLLUP" if l["code"] in rollup else status.get(f'{l["code"]}|{l["text"]}')
        out.append({**{k: l.get(k) for k in LEDGER_KEYS}, "status": "NO_CARD_TXN" if s == "UNEXPLAINED" else s})
    return out


def _kpis(rows, tieout):
    pr = tieout["purchases_vs_rollup"]
    purchases = [r for r in rows if r["kind"] == "purchase"]
    missing = [r for r in rows if r["status"] == "MISSING_RECEIPT"]
    return {"card_spend": pr["statement"], "purchase_count": len(purchases), "atm_count": sum(1 for r in rows if r["kind"] == "atm"),
            "purchases_amount": pr["purchases_only"],
            "evidenced_amount": round(sum(r["amount"] for r in purchases if r["status"] == "MATCHED"), 2),
            "rollup": pr["ledger"], "open_gap": round(pr["ledger"] - pr["statement"], 2),
            "missing_count": len(missing), "missing_amount": round(sum(r["amount"] for r in missing), 2)}


def build_report(matches, cfg, page_files, now=None):
    """The UI-shaped report. page_files: file names in the pages/ folder, any order."""
    month = cfg["month"]
    return {
        "meta": {"client": cfg.get("client", "ABUJHD"), "month": month,
                 "month_label": datetime.strptime(month, "%Y-%m").strftime("%B %Y"),
                 "built_at": (now or datetime.now()).isoformat(timespec="seconds"),
                 "sheet": cfg.get("sheet"), "files": cfg.get("names", {}),
                 "page_images": {"receipts": sorted(f"pages/{n}" for n in page_files if n.startswith("page-") and n.endswith(".png")),
                                 "statement": ["pages/statement-200.png"]}},
        "kpis": _kpis(matches["rows"], matches["tieout"]),
        "counts": matches["summary"],
        "rows": [_row(r) for r in matches["rows"]],
        "receipts": [_receipt(g) for g in matches["receipts"]],
        "ledger": _ledger(matches["ledger"], matches["tieout"]),
        "tieout": {k: matches["tieout"][k] for k in TIEOUT_KEYS},
    }


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/abujhd"); a = ap.parse_args(); common.set_data(a.data)
    report = build_report(load_json(common.DATA / "matches.json"), common.config(), [p.name for p in common.PAGES.iterdir()])
    save_json(common.DATA / "report.json", report)
    print("wrote", common.DATA / "report.json", f'({len(report["rows"])} rows, {len(report["receipts"])} receipts, {len(report["ledger"])} ledger lines)')


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python scripts/abujhd/test_report.py`
Expected: six `ok test_…` lines, no traceback.

- [ ] **Step 5: Emit the real report for the snapshot and sanity-check it**

Run: `.venv/bin/python scripts/abujhd/c_report.py --data data/abujhd`
Expected: `wrote …/data/abujhd/report.json (129 rows, 172 receipts, 77 ledger lines)`

Run: `.venv/bin/python -c "import json; r=json.load(open('data/abujhd/report.json')); print(r['kpis']); print(len(r['meta']['page_images']['receipts']), r['meta']['page_images']['receipts'][:2]); print({l['status'] for l in r['ledger']})"`
Expected: `card_spend` 17439.1, `purchase_count` 104, `atm_count` 19, `missing_count` 9, `rollup` 19420.8, `open_gap` 1981.7 (positive: roll-up minus spend); 87 receipt pages starting `pages/page-01.png`; ledger statuses `{None, 'TIED', 'NO_CARD_TXN', 'ROLLUP'}`.

Also run the other script tests to show nothing else moved: `.venv/bin/python scripts/abujhd/test_match.py` and `.venv/bin/python scripts/abujhd/test_refine.py` — every line `ok`.

- [ ] **Step 6: Commit**

```bash
git add scripts/abujhd/c_report.py scripts/abujhd/test_report.py
git commit -m "Step C emits report.json for the app instead of report.html

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: API serves `report.json`

**Files:**
- Modify: `src/lib/petty-cash.ts` (the `isAllowedReportPath` function and its doc comment, around lines 24–29)
- Modify: `src/app/api/petty-cash/[kbId]/[...path]/route.ts` (header comment and the response block)
- Modify: `src/lib/__tests__/petty-cash.test.ts` (the `isAllowedReportPath` describe block, lines 36–50)
- Modify: `docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md` (two lines, see Step 5)

**Interfaces:**
- Consumes: nothing new.
- Produces: `GET /api/petty-cash/<kbId>/report.json` → 200 `application/json`; `report.html` → 404. Task 8 fetches this URL.

- [ ] **Step 1: Change the test**

In `src/lib/__tests__/petty-cash.test.ts`, inside `describe('isAllowedReportPath', …)`, replace the line

```ts
    expect(isAllowedReportPath(['report.html'])).toBe(true);
```

with

```ts
    expect(isAllowedReportPath(['report.json'])).toBe(true);
```

and add, next to the other rejections (the test that contains `expect(isAllowedReportPath(['config.json'])).toBe(false);`):

```ts
    expect(isAllowedReportPath(['report.html'])).toBe(false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/__tests__/petty-cash.test.ts`
Expected: 2 failures in `isAllowedReportPath` (`report.json` expected true, `report.html` expected false).

- [ ] **Step 3: Change the allowlist**

In `src/lib/petty-cash.ts` replace the function and its comment with:

```ts
/** report.json | pages/<name>.png | crops/<name>.png, every segment plain-safe (no '..', no '%', no '/'). */
export function isAllowedReportPath(segments: string[]): boolean {
  if (!segments.every(s => PLAIN.test(s) && s !== '..' && s !== '.')) return false;
  if (segments.length === 1) return segments[0] === 'report.json';
  return segments.length === 2 && (segments[0] === 'pages' || segments[0] === 'crops') && segments[1].endsWith('.png');
}
```

- [ ] **Step 4: Change the route's content type**

In `src/app/api/petty-cash/[kbId]/[...path]/route.ts` replace the first comment line

```ts
// Serves the petty-cash scripts' report.html and its images for the workspace whose data/<client>/config.json
```

with

```ts
// Serves the petty-cash scripts' report.json and its page/crop images for the workspace whose data/<client>/config.json
```

and replace the response block (from `const html = …` to the end of the function) with:

```ts
  const json = path[path.length - 1].endsWith('.json');
  return new Response(readFileSync(file), {
    headers: {
      'Content-Type': json ? 'application/json; charset=utf-8' : 'image/png',
      'Cache-Control': 'no-store',
    },
  });
}
```

(The `Content-Security-Policy` header existed for the HTML document; JSON and PNG responses do not execute anything.)

- [ ] **Step 5: Note the change in the matcher spec**

In `docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md` replace the layout line

```
  c_report.py     whiteboard → report.html
```

with

```
  c_report.py     report.json for the app's Report tab (2026-10-23-petty-cash-report-ui-design.md)
```

and directly under the heading `## Step C — \`c_report.py\`` insert the paragraph:

```
> Superseded 2026-10-23: Step C now writes `report.json`, rendered by the app (see
> `2026-10-23-petty-cash-report-ui-design.md`). The description below is the original static-HTML design.
```

- [ ] **Step 6: Run the tests and lint**

Run: `bun test src/lib/__tests__/petty-cash.test.ts`
Expected: all pass (13 tests).

Run: `bunx eslint src/lib/petty-cash.ts "src/app/api/petty-cash/[kbId]/[...path]/route.ts"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/petty-cash.ts "src/app/api/petty-cash/[kbId]/[...path]/route.ts" src/lib/__tests__/petty-cash.test.ts docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md
git commit -m "Serve report.json from the petty-cash route instead of report.html

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `petty-cash-report.ts` types and helpers

**Files:**
- Create: `src/lib/petty-cash-report.ts`
- Create: `src/lib/__tests__/petty-cash-report.test.ts`

**Interfaces:**
- Consumes: the `report.json` shape from Task 1.
- Produces (every later task imports from `@/lib/petty-cash-report`):
  - types `Box`, `StatementCitation`, `ReceiptCitation`, `LedgerCitation`, `StatementRow`, `ReceiptGroup`, `LedgerLine`, `PettyReport`, `Tone`, `Source`, `Selection`, `PaneSources`, `SortKey`
  - `statusMeta(status: string | null): { word: string; glyph: string; tone: Tone }`, `TONE_VAR: Record<Tone, string>`
  - `ROW_FILTERS`, `RECEIPT_FILTERS` (arrays of `{ key, label }`), `countByStatus(items)`, `filterRows(rows, status, query)`, `filterReceipts(groups, status)`, `sortRows(rows, key, dir)`
  - `money(n)`, `pct(num, den)`, `boxStyle(box)`, `imageUrl(kbId, path)`
  - `paneSources(report, selection): PaneSources | null`, `rowByRef(report, ref): StatementRow | undefined`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/petty-cash-report.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import {
  boxStyle, countByStatus, filterReceipts, filterRows, imageUrl, money, paneSources, pct, rowByRef, sortRows, statusMeta,
  type Box, type PettyReport, type ReceiptGroup, type StatementRow,
} from '../petty-cash-report';

const BOX: Box = [100, 100, 500, 900];
function row(ref: string, date: string, time: string | null, amount: number, merchant: string, status: string,
  receipts: Array<{ page: number; group_id: string }> = [], ledger = true): StatementRow {
  return {
    ref, date, time, amount, merchant, kind: 'purchase', orange: false, status, reason: 'why',
    receipt_ids: receipts.map(r => r.group_id),
    citations: {
      statement: { page: 1, box: [0, 10, 1000, 15], crop: `crops/stmt-${ref}.png` },
      receipts: receipts.map(r => ({ ...r, box: BOX, crop: `crops/${r.group_id}.png` })),
      ledger: ledger ? { sheet: 'GL', row: 9, cell: 'B9', code: 'ROLL', date: '2026-09-30', amount: 300, relation: 'rolled-up' } : null,
    },
  };
}
function group(id: string, page: number, status: string, refs: string[] = [], review: Array<[string, number]> = []): ReceiptGroup {
  return {
    id, page, pages: [page], box: [100, 100, 500, 900], crop: `crops/${id}.png`, status, reason: 'r', merchant: `Shop ${id}`,
    date: '2026-09-04', total: 20, amounts: [20], confidence: 0.9, notes: null, refs, review,
    citations: [{ page, group_id: id, box: [100, 100, 500, 900], crop: `crops/${id}.png` }],
  };
}
const REPORT: PettyReport = {
  meta: {
    client: 'ABUJHD', month: '2026-09', month_label: 'September 2026', built_at: '2026-10-23T22:00:00', sheet: 'GL',
    files: { receipts: 'r.pdf', statement: 's.pdf', ledger: 'l.xlsx' },
    page_images: { receipts: ['pages/page-01.png', 'pages/page-02.png'], statement: ['pages/statement-200.png'] },
  },
  kpis: { card_spend: 350, purchase_count: 2, atm_count: 1, purchases_amount: 150, evidenced_amount: 100, rollup: 300, open_gap: -50, missing_count: 1, missing_amount: 50 },
  counts: { rows: {}, receipts: {} },
  rows: [
    row('r1', '2026-09-05', '10:00:00', 100, 'GREEN STAR FUEL', 'MATCHED', [{ page: 1, group_id: 'p1-g1' }, { page: 2, group_id: 'p2-g1' }]),
    row('r2', '2026-09-05', '08:00:00', 50, 'AL OTHAIM', 'MISSING_RECEIPT'),
    row('r3', '2026-09-01', null, 75.5, 'MAZA REST', 'REVIEW', [], false),
  ],
  receipts: [group('p1-g1', 1, 'LINKED', ['r1']), group('p2-g1', 2, 'LINKED', ['r1']), group('p3-g1', 3, 'REVIEW', [], [['r3', 6], ['r2', 5]]), group('p4-g1', 4, 'ORPHAN')],
  ledger: [],
  tieout: {
    loads_vs_topups: { statement: 0, ledger: 0, diff: 0 },
    atm_vs_withdrawals: { statement: 0, ledger: 0, diff: 0 },
    purchases_vs_rollup: { statement: 0, ledger: 0, diff: 0, purchases_only: 0, rollup_codes: [] },
  },
};

describe('statusMeta', () => {
  test('maps every matcher status to a word, glyph and tone', () => {
    expect(statusMeta('MATCHED')).toEqual({ word: 'Matched', glyph: '✓', tone: 'ok' });
    expect(statusMeta('LINKED')).toEqual({ word: 'Linked', glyph: '✓', tone: 'ok' });
    expect(statusMeta('TIED')).toEqual({ word: 'Tied to ledger', glyph: '✓', tone: 'ok' });
    expect(statusMeta('MISSING_RECEIPT')).toEqual({ word: 'Missing receipt', glyph: '✕', tone: 'bad' });
    expect(statusMeta('ORPHAN')).toEqual({ word: 'No card row', glyph: '✕', tone: 'bad' });
    expect(statusMeta('REVIEW')).toEqual({ word: 'Needs a decision', glyph: '?', tone: 'review' });
    expect(statusMeta('UNEXPLAINED')).toEqual({ word: 'Not in ledger', glyph: '!', tone: 'warn' });
    expect(statusMeta('AMOUNT_MISMATCH')).toEqual({ word: 'Amounts differ', glyph: '!', tone: 'warn' });
    expect(statusMeta('OTHER_MONTH')).toEqual({ word: 'Another month', glyph: '!', tone: 'warn' });
    expect(statusMeta('ROLLUP')).toEqual({ word: 'Roll-up of card spend', glyph: '·', tone: 'muted' });
    expect(statusMeta('NO_CARD_TXN')).toEqual({ word: 'No card transaction', glyph: '!', tone: 'warn' });
  });
  test('falls back to the raw status, and an em dash for null', () => {
    expect(statusMeta('WEIRD')).toEqual({ word: 'WEIRD', glyph: '·', tone: 'muted' });
    expect(statusMeta(null)).toEqual({ word: '—', glyph: '·', tone: 'muted' });
  });
});

describe('counts, filters and sort', () => {
  test('countByStatus includes ALL', () => {
    expect(countByStatus(REPORT.rows)).toEqual({ ALL: 3, MATCHED: 1, MISSING_RECEIPT: 1, REVIEW: 1 });
    expect(countByStatus(REPORT.receipts)).toEqual({ ALL: 4, LINKED: 2, REVIEW: 1, ORPHAN: 1 });
  });
  test('filterRows by status and by query over merchant, ref and amount', () => {
    expect(filterRows(REPORT.rows, 'ALL', '').map(r => r.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(filterRows(REPORT.rows, 'MATCHED', '').map(r => r.ref)).toEqual(['r1']);
    expect(filterRows(REPORT.rows, 'ALL', 'othaim').map(r => r.ref)).toEqual(['r2']);
    expect(filterRows(REPORT.rows, 'ALL', 'R3').map(r => r.ref)).toEqual(['r3']);
    expect(filterRows(REPORT.rows, 'ALL', '75.5').map(r => r.ref)).toEqual(['r3']);
    expect(filterRows(REPORT.rows, 'REVIEW', 'othaim')).toEqual([]);
  });
  test('filterReceipts', () => {
    expect(filterReceipts(REPORT.receipts, 'REVIEW').map(g => g.id)).toEqual(['p3-g1']);
    expect(filterReceipts(REPORT.receipts, 'ALL')).toHaveLength(4);
  });
  test('sortRows by date (time tiebreak) and by amount, both directions, without mutating', () => {
    const before = REPORT.rows.map(r => r.ref);
    expect(sortRows(REPORT.rows, 'date', 'asc').map(r => r.ref)).toEqual(['r3', 'r2', 'r1']);
    expect(sortRows(REPORT.rows, 'date', 'desc').map(r => r.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(sortRows(REPORT.rows, 'amount', 'asc').map(r => r.ref)).toEqual(['r2', 'r3', 'r1']);
    expect(sortRows(REPORT.rows, 'amount', 'desc').map(r => r.ref)).toEqual(['r1', 'r3', 'r2']);
    expect(REPORT.rows.map(r => r.ref)).toEqual(before);
  });
});

describe('formatting and geometry', () => {
  test('money and pct', () => {
    expect(money(1234.5)).toBe('1,234.50');
    expect(money(0)).toBe('0.00');
    expect(money(null)).toBe('');
    expect(pct(100, 150)).toBe('67%');
    expect(pct(1, 0)).toBe('0%');
  });
  test('boxStyle converts 0-1000 space to percentages', () => {
    expect(boxStyle([100, 100, 500, 900])).toEqual({ left: '10%', top: '10%', width: '40%', height: '80%' });
  });
  test('imageUrl', () => {
    expect(imageUrl('kb-1', 'pages/page-01.png')).toBe('/api/petty-cash/kb-1/pages/page-01.png');
  });
});

describe('paneSources', () => {
  test('a row brings its statement strip, its receipts and its ledger line', () => {
    const s = paneSources(REPORT, { kind: 'row', ref: 'r1', source: 'receipt', index: 1 });
    expect(s?.title).toBe('2026-09-05 · 100.00 · GREEN STAR FUEL');
    expect(s?.statement).toHaveLength(1);
    expect(s?.receipts.map(c => c.group_id)).toEqual(['p1-g1', 'p2-g1']);
    expect(s?.ledger?.cell).toBe('B9');
    expect(s?.index).toBe(1);
  });
  test('a row without receipts or ledger has empty receipts and a null ledger, index defaults to 0', () => {
    const s = paneSources(REPORT, { kind: 'row', ref: 'r3', source: 'statement' });
    expect(s?.receipts).toEqual([]);
    expect(s?.ledger).toBeNull();
    expect(s?.index).toBe(0);
  });
  test('a linked group brings the statement rows it is linked to and their ledger line', () => {
    const s = paneSources(REPORT, { kind: 'receipt', id: 'p1-g1', source: 'receipt' });
    expect(s?.title).toBe('Shop p1-g1 · p1');
    expect(s?.receipts.map(c => c.group_id)).toEqual(['p1-g1']);
    expect(s?.statement.map(c => c.crop)).toEqual(['crops/stmt-r1.png']);
    expect(s?.ledger?.code).toBe('ROLL');
  });
  test('an undecided group brings its candidate rows in report order', () => {
    const s = paneSources(REPORT, { kind: 'receipt', id: 'p3-g1', source: 'receipt' });
    expect(s?.statement.map(c => c.crop)).toEqual(['crops/stmt-r2.png', 'crops/stmt-r3.png']);
    expect(s?.ledger?.cell).toBe('B9');
  });
  test('an orphan group has no statement or ledger; unknown ids return null', () => {
    const s = paneSources(REPORT, { kind: 'receipt', id: 'p4-g1', source: 'receipt' });
    expect(s?.statement).toEqual([]);
    expect(s?.ledger).toBeNull();
    expect(paneSources(REPORT, { kind: 'row', ref: 'nope', source: 'statement' })).toBeNull();
    expect(paneSources(REPORT, { kind: 'receipt', id: 'nope', source: 'receipt' })).toBeNull();
  });
  test('rowByRef', () => {
    expect(rowByRef(REPORT, 'r2')?.amount).toBe(50);
    expect(rowByRef(REPORT, 'zz')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/__tests__/petty-cash-report.test.ts`
Expected: fails to resolve `../petty-cash-report`.

- [ ] **Step 3: Write the module**

Create `src/lib/petty-cash-report.ts`:

```ts
// Types for data/<client>/report.json (written by scripts/abujhd/c_report.py) and the pure helpers the
// petty-cash report components share. Nothing here touches the DOM.

export type Box = [number, number, number, number]; // x0, y0, x1, y1 in the matcher's 0-1000 page space

// A statement row the matcher could not position on the page carries a null box and crop (a_refine.py sets both
// to None when the row has no y); the pane skips such boxes. Receipt citations always have a box.
export interface StatementCitation { page: number; box: Box | null; crop: string | null }
export interface ReceiptCitation { page: number; group_id: string; box: Box; crop: string }
export interface LedgerCitation { sheet: string; row: number; cell: string; code: string; date: string; amount: number | null; relation: string }

export interface StatementRow {
  ref: string;
  date: string;
  time: string | null;
  amount: number;
  merchant: string;
  kind: 'purchase' | 'atm' | 'load';
  orange: boolean;
  status: string;
  reason: string;
  receipt_ids: string[];
  citations: { statement: StatementCitation; receipts: ReceiptCitation[]; ledger: LedgerCitation | null };
}

export interface ReceiptGroup {
  id: string;
  page: number;
  pages: number[];
  box: Box;
  crop: string | null;
  status: string;
  reason: string | null;
  merchant: string | null;
  date: string | null;
  total: number | null;
  amounts: number[];
  confidence: number | null;
  notes: string | null;
  refs: string[];
  review: Array<[string, number]>;
  citations: ReceiptCitation[];
}

export interface LedgerLine {
  code: string;
  date: string;
  text: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  month: string;
  row: number;
  cell: string;
  status: string | null;
}

interface Pair { statement: number; ledger: number; diff: number }

export interface PettyReport {
  meta: {
    client: string;
    month: string;
    month_label: string;
    built_at: string;
    sheet: string;
    files: Record<string, string>;
    page_images: { receipts: string[]; statement: string[] };
  };
  kpis: {
    card_spend: number; purchase_count: number; atm_count: number; purchases_amount: number; evidenced_amount: number;
    rollup: number; open_gap: number; missing_count: number; missing_amount: number;
  };
  counts: { rows: Record<string, number>; receipts: Record<string, number> };
  rows: StatementRow[];
  receipts: ReceiptGroup[];
  ledger: LedgerLine[];
  tieout: { loads_vs_topups: Pair; atm_vs_withdrawals: Pair; purchases_vs_rollup: Pair & { purchases_only: number; rollup_codes: string[] } };
}

// ---------- status vocabulary: a word, a glyph and a tone; colour never carries the meaning alone ----------
export type Tone = 'ok' | 'bad' | 'review' | 'warn' | 'muted';
export const TONE_VAR: Record<Tone, string> = {
  ok: 'var(--status-ok)',
  bad: 'var(--status-bad)',
  review: 'var(--status-review)',
  warn: 'var(--status-warn)',
  muted: 'var(--muted-foreground)',
};
const STATUS: Record<string, { word: string; glyph: string; tone: Tone }> = {
  MATCHED: { word: 'Matched', glyph: '✓', tone: 'ok' },
  LINKED: { word: 'Linked', glyph: '✓', tone: 'ok' },
  TIED: { word: 'Tied to ledger', glyph: '✓', tone: 'ok' },
  MISSING_RECEIPT: { word: 'Missing receipt', glyph: '✕', tone: 'bad' },
  ORPHAN: { word: 'No card row', glyph: '✕', tone: 'bad' },
  REVIEW: { word: 'Needs a decision', glyph: '?', tone: 'review' },
  UNEXPLAINED: { word: 'Not in ledger', glyph: '!', tone: 'warn' },
  AMOUNT_MISMATCH: { word: 'Amounts differ', glyph: '!', tone: 'warn' },
  OTHER_MONTH: { word: 'Another month', glyph: '!', tone: 'warn' },
  ROLLUP: { word: 'Roll-up of card spend', glyph: '·', tone: 'muted' },
  NO_CARD_TXN: { word: 'No card transaction', glyph: '!', tone: 'warn' },
};
export function statusMeta(status: string | null): { word: string; glyph: string; tone: Tone } {
  return (status && STATUS[status]) || { word: status ?? '—', glyph: '·', tone: 'muted' };
}

// ---------- filters, counts, sort ----------
export const ROW_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'MATCHED', label: 'Matched' },
  { key: 'REVIEW', label: 'Needs a decision' },
  { key: 'MISSING_RECEIPT', label: 'Missing receipt' },
  { key: 'AMOUNT_MISMATCH', label: 'Amounts differ' },
  { key: 'UNEXPLAINED', label: 'Not in ledger' },
  { key: 'TIED', label: 'Tied to ledger' },
];
export const RECEIPT_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'LINKED', label: 'Linked' },
  { key: 'REVIEW', label: 'Needs a decision' },
  { key: 'ORPHAN', label: 'No card row' },
  { key: 'OTHER_MONTH', label: 'Another month' },
];

/** Counts per status plus ALL; computed over the unfiltered list so chip counts never shrink. */
export function countByStatus(items: Array<{ status: string }>): Record<string, number> {
  const out: Record<string, number> = { ALL: items.length };
  for (const it of items) out[it.status] = (out[it.status] ?? 0) + 1;
  return out;
}

export function filterRows(rows: StatementRow[], status: string, query: string): StatementRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(
    r =>
      (status === 'ALL' || r.status === status) &&
      (!q || r.merchant.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q) || r.amount.toFixed(2).includes(q))
  );
}

export function filterReceipts(groups: ReceiptGroup[], status: string): ReceiptGroup[] {
  return status === 'ALL' ? groups : groups.filter(g => g.status === status);
}

export type SortKey = 'date' | 'amount';
export function sortRows(rows: StatementRow[], key: SortKey, dir: 'asc' | 'desc'): StatementRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const d = key === 'amount' ? a.amount - b.amount : (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''));
    return d * sign;
  });
}

// ---------- formatting and geometry ----------
export function money(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}
export function pct(num: number, den: number): string {
  return den ? `${Math.round((num / den) * 100)}%` : '0%';
}
/** A 0-1000 box as percentage offsets inside its page element. */
export function boxStyle([x0, y0, x1, y1]: Box): { left: string; top: string; width: string; height: string } {
  return { left: `${x0 / 10}%`, top: `${y0 / 10}%`, width: `${(x1 - x0) / 10}%`, height: `${(y1 - y0) / 10}%` };
}
export function imageUrl(kbId: string, path: string): string {
  return `/api/petty-cash/${kbId}/${path}`;
}

// ---------- what the citation pane shows for a selection ----------
export type Source = 'statement' | 'receipt' | 'ledger';
export type Selection =
  | { kind: 'row'; ref: string; source: Source; index?: number } // index: which receipt citation is primary
  | { kind: 'receipt'; id: string; source: Source };

export interface PaneSources {
  title: string;
  statement: StatementCitation[];
  receipts: ReceiptCitation[];
  ledger: LedgerCitation | null;
  index: number;
}

export function rowByRef(report: PettyReport, ref: string): StatementRow | undefined {
  return report.rows.find(r => r.ref === ref);
}

export function paneSources(report: PettyReport, sel: Selection): PaneSources | null {
  if (sel.kind === 'row') {
    const row = rowByRef(report, sel.ref);
    if (!row) return null;
    return {
      title: `${row.date} · ${money(row.amount)} · ${row.merchant}`,
      statement: [row.citations.statement],
      receipts: row.citations.receipts,
      ledger: row.citations.ledger,
      index: sel.index ?? 0,
    };
  }
  const g = report.receipts.find(x => x.id === sel.id);
  if (!g) return null;
  const refs = new Set([...g.refs, ...g.review.map(([ref]) => ref)]);
  const rows = report.rows.filter(r => refs.has(r.ref));
  return {
    title: `${g.merchant ?? g.id} · p${g.page}`,
    statement: rows.map(r => r.citations.statement),
    receipts: g.citations,
    ledger: rows[0]?.citations.ledger ?? null,
    index: 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/__tests__/petty-cash-report.test.ts`
Expected: 15 pass, 0 fail.

- [ ] **Step 5: Lint and commit**

Run: `bunx eslint src/lib/petty-cash-report.ts src/lib/__tests__/petty-cash-report.test.ts`
Expected: no output.

```bash
git add src/lib/petty-cash-report.ts src/lib/__tests__/petty-cash-report.test.ts
git commit -m "Petty-cash report types and pure helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Chips and the Transactions table

**Files:**
- Create: `src/components/petty-cash/chips.tsx`
- Create: `src/components/petty-cash/transactions-table.tsx`

**Interfaces:**
- Consumes: from `@/lib/petty-cash-report`: `statusMeta`, `TONE_VAR`, `ROW_FILTERS`, `countByStatus`, `filterRows`, `sortRows`, `money`, types `StatementRow`, `Selection`, `SortKey`. From `@/components/ui/table`: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TABLE_HEAD_BAND`. From `@/components/ui/input`: `Input`. `cn` from `@/lib/utils`.
- Produces:
  - `StatusChip({ status: string | null })`
  - `CitationChip({ label: string; onClick: () => void; active?: boolean; title?: string })` — stops propagation so a chip click never also fires the row click.
  - `FilterChip({ label: string; count: number; active: boolean; onClick: () => void })`
  - `TransactionsTable({ rows: StatementRow[]; selection: Selection | null; onSelect: (s: Selection) => void })`

There is no component test harness in this repo; the gate for this task is the typecheck filter and eslint (Step 3) plus the controller's browser check in Task 9. All behaviour with logic lives in Task 3's tested helpers.

- [ ] **Step 1: Write `chips.tsx`**

```tsx
'use client';
import { cn } from '@/lib/utils';
import { statusMeta, TONE_VAR } from '@/lib/petty-cash-report';

/** Status as glyph + word in its tone; the word is always present so colour never carries the meaning alone. */
export function StatusChip({ status }: { status: string | null }) {
  const { word, glyph, tone } = statusMeta(status);
  const c = TONE_VAR[tone];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
    >
      <b aria-hidden="true">{glyph}</b>
      {word}
    </span>
  );
}

/** A small mono button naming one source ("Receipt p82"); opens that source in the pane. */
export function CitationChip({ label, onClick, active = false, title }: { label: string; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-md border px-2 font-mono text-[11px] transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

/** Pill filter with its count; counts come from the unfiltered list. */
export function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
```

- [ ] **Step 2: Write `transactions-table.tsx`**

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TABLE_HEAD_BAND } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  countByStatus, filterRows, money, ROW_FILTERS, sortRows,
  type Selection, type SortKey, type StatementRow,
} from '@/lib/petty-cash-report';
import { CitationChip, FilterChip, StatusChip } from './chips';

export function TransactionsTable({ rows, selection, onSelect }: { rows: StatementRow[]; selection: Selection | null; onSelect: (s: Selection) => void }) {
  const [status, setStatus] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'asc' });
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const visible = useMemo(() => sortRows(filterRows(rows, status, query), sort.key, sort.dir), [rows, status, query, sort]);

  const toggleSort = (key: SortKey) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  const selectedRef = selection?.kind === 'row' ? selection.ref : null;
  const chipActive = (ref: string, source: string, index = 0) =>
    selection?.kind === 'row' && selection.ref === ref && selection.source === source && (selection.index ?? 0) === index;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {ROW_FILTERS.map(f => (
          <FilterChip key={f.key} label={f.label} count={counts[f.key] ?? 0} active={status === f.key} onClick={() => setStatus(f.key)} />
        ))}
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Merchant, ref or amount"
          aria-label="Search transactions"
          className="ml-auto h-7 w-56 text-xs"
        />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={TABLE_HEAD_BAND}>Status</TableHead>
              <TableHead className={TABLE_HEAD_BAND} aria-sort={ariaSort('date')}>
                <button type="button" onClick={() => toggleSort('date')} className="uppercase">Date{sortMark('date')}</button>
              </TableHead>
              <TableHead className={cn(TABLE_HEAD_BAND, 'text-right')} aria-sort={ariaSort('amount')}>
                <button type="button" onClick={() => toggleSort('amount')} className="uppercase">Amount{sortMark('amount')}</button>
              </TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Merchant</TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Evidence</TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No rows match</TableCell>
              </TableRow>
            )}
            {visible.map(r => (
              <TableRow
                key={r.ref}
                aria-selected={selectedRef === r.ref}
                onClick={() => onSelect({ kind: 'row', ref: r.ref, source: r.citations.receipts.length ? 'receipt' : 'statement' })}
                className={cn('cursor-pointer', selectedRef === r.ref ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/40')}
              >
                <TableCell><StatusChip status={r.status} /></TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    {r.date}
                    {r.orange && <span className="size-2 rounded-full bg-amber-500" title="Highlighted on the statement" />}
                  </div>
                  <div className="text-muted-foreground">{(r.time ?? '').slice(0, 5)}</div>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{money(r.amount)}</TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="truncate" title={r.merchant}>{r.merchant}</div>
                  <div className="text-xs text-muted-foreground">{r.kind}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <CitationChip label="Stmt" title="Statement row" active={chipActive(r.ref, 'statement')} onClick={() => onSelect({ kind: 'row', ref: r.ref, source: 'statement' })} />
                    {r.citations.receipts.map((c, i) => (
                      <CitationChip key={c.group_id} label={`Receipt p${c.page}`} title={c.group_id} active={chipActive(r.ref, 'receipt', i)} onClick={() => onSelect({ kind: 'row', ref: r.ref, source: 'receipt', index: i })} />
                    ))}
                    {r.citations.ledger && (
                      <CitationChip label={`Ledger ${r.citations.ledger.cell}`} title={r.citations.ledger.code} active={chipActive(r.ref, 'ledger')} onClick={() => onSelect({ kind: 'row', ref: r.ref, source: 'ledger' })} />
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[280px] text-xs text-muted-foreground">{r.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected: no lines.

Run: `bunx eslint src/components/petty-cash/chips.tsx src/components/petty-cash/transactions-table.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/petty-cash/chips.tsx src/components/petty-cash/transactions-table.tsx
git commit -m "Petty-cash report: status, citation and filter chips; Transactions table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Receipts and Ledger tables

**Files:**
- Create: `src/components/petty-cash/receipts-table.tsx`
- Create: `src/components/petty-cash/ledger-table.tsx`

**Interfaces:**
- Consumes: `StatusChip`, `CitationChip`, `FilterChip` from `./chips` (Task 4); from `@/lib/petty-cash-report`: `RECEIPT_FILTERS`, `countByStatus`, `filterReceipts`, `rowByRef`, `money`, `imageUrl`, types `PettyReport`, `Selection`, `LedgerLine`; the `Table` family.
- Produces:
  - `ReceiptsTable({ report: PettyReport; kbId: string; selection: Selection | null; onSelect: (s: Selection) => void })`
  - `LedgerTable({ report: PettyReport })`
  - `LedgerLines({ lines: LedgerLine[]; highlightCode?: string })` — exported for the citation pane (Task 7): lines whose `code === highlightCode` get `bg-primary/10`, the first is scrolled into view when `highlightCode` changes.

- [ ] **Step 1: Write `receipts-table.tsx`**

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TABLE_HEAD_BAND } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  countByStatus, filterReceipts, imageUrl, money, RECEIPT_FILTERS, rowByRef,
  type PettyReport, type ReceiptGroup, type Selection,
} from '@/lib/petty-cash-report';
import { CitationChip, FilterChip, StatusChip } from './chips';

export function ReceiptsTable({ report, kbId, selection, onSelect }: { report: PettyReport; kbId: string; selection: Selection | null; onSelect: (s: Selection) => void }) {
  const [status, setStatus] = useState('ALL');
  const counts = useMemo(() => countByStatus(report.receipts), [report.receipts]);
  const visible = useMemo(() => filterReceipts(report.receipts, status), [report.receipts, status]);
  const selectedId = selection?.kind === 'receipt' ? selection.id : null;

  // One chip per statement row a group points at; a review candidate also carries its score.
  const rowChip = (ref: string, score?: number) => {
    const row = rowByRef(report, ref);
    const label = row
      ? `${row.date} · ${money(row.amount)}${score === undefined ? '' : ` · ${row.merchant.slice(0, 24)} · score ${score}`}`
      : ref;
    return (
      <CitationChip
        key={`${ref}-${score ?? ''}`}
        label={label}
        title={row ? `${row.merchant} · ${ref}` : ref}
        onClick={() => onSelect({ kind: 'row', ref, source: 'statement' })}
      />
    );
  };
  const statementCell = (g: ReceiptGroup) => {
    if (g.status === 'REVIEW') {
      return g.review.length
        ? g.review.map(([ref, score]) => rowChip(ref, score))
        : <span className="text-xs text-muted-foreground">its candidates were taken by other receipts</span>;
    }
    return g.refs.length ? g.refs.map(ref => rowChip(ref)) : <span className="text-xs text-muted-foreground">{g.reason}</span>;
  };
  const amountCell = (g: ReceiptGroup) => {
    if (typeof g.total === 'number') return money(g.total);
    if (g.amounts.length) return g.amounts.slice(0, 3).map(money).join(', ');
    return <span className="text-muted-foreground">no amount read</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {RECEIPT_FILTERS.map(f => (
          <FilterChip key={f.key} label={f.label} count={counts[f.key] ?? 0} active={status === f.key} onClick={() => setStatus(f.key)} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={TABLE_HEAD_BAND}>Status</TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Receipt</TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Receipt date</TableHead>
              <TableHead className={cn(TABLE_HEAD_BAND, 'text-right')}>Amount</TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Merchant</TableHead>
              <TableHead className={TABLE_HEAD_BAND}>Statement rows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No receipts match</TableCell>
              </TableRow>
            )}
            {visible.map(g => (
              <TableRow
                key={g.id}
                aria-selected={selectedId === g.id}
                onClick={() => onSelect({ kind: 'receipt', id: g.id, source: 'receipt' })}
                className={cn('cursor-pointer', selectedId === g.id ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/40')}
              >
                <TableCell><StatusChip status={g.status} /></TableCell>
                <TableCell>
                  {/* A real button: an orphan receipt has no statement chip, so this is the keyboard route into the pane. */}
                  <button
                    type="button"
                    aria-label={`Open receipt ${g.id} on page ${g.page}`}
                    onClick={e => {
                      e.stopPropagation();
                      onSelect({ kind: 'receipt', id: g.id, source: 'receipt' });
                    }}
                    className="flex items-center gap-2 rounded-md text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {g.crop && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(kbId, g.crop)} alt="" className="h-10 w-auto max-w-16 rounded border border-border bg-white object-cover object-top" />
                    )}
                    <span className="font-mono text-xs">p{g.page} · {g.id}</span>
                  </button>
                </TableCell>
                <TableCell className="font-mono text-xs">{g.date ?? <span className="text-muted-foreground">no date</span>}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{amountCell(g)}</TableCell>
                <TableCell className="max-w-[220px]">
                  {g.merchant ? <div className="truncate" title={g.merchant}>{g.merchant}</div> : <span className="text-muted-foreground">no merchant read</span>}
                </TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{statementCell(g)}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ledger-table.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TABLE_HEAD_BAND } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { money, type LedgerLine, type PettyReport } from '@/lib/petty-cash-report';
import { FilterChip, StatusChip } from './chips';

/** The ledger lines table; shared by the Ledger tab and the pane's Ledger source (which highlights one code). */
export function LedgerLines({ lines, highlightCode }: { lines: LedgerLine[]; highlightCode?: string }) {
  const firstHit = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    firstHit.current?.scrollIntoView({ block: 'center' });
  }, [highlightCode]);
  // The first highlighted line gets the scroll ref (a render-time flag would trip react-hooks/immutability).
  const firstHitIdx = highlightCode === undefined ? -1 : lines.findIndex(l => l.code === highlightCode);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TABLE_HEAD_BAND}>Code</TableHead>
            <TableHead className={TABLE_HEAD_BAND}>Date</TableHead>
            <TableHead className={cn(TABLE_HEAD_BAND, 'text-right')}>Debit</TableHead>
            <TableHead className={cn(TABLE_HEAD_BAND, 'text-right')}>Credit</TableHead>
            <TableHead className={TABLE_HEAD_BAND}>Text</TableHead>
            <TableHead className={TABLE_HEAD_BAND}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No ledger lines</TableCell>
            </TableRow>
          )}
          {lines.map((l, i) => {
            const hit = highlightCode !== undefined && l.code === highlightCode;
            const ref = i === firstHitIdx ? firstHit : undefined;
            return (
              <TableRow key={`${l.row}-${l.code}`} ref={ref} className={cn(hit && 'bg-primary/10 hover:bg-primary/10')}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{l.code}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">{l.date}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{money(l.debit)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{money(l.credit)}</TableCell>
                <TableCell className="max-w-[360px] text-xs"><div className="truncate" title={l.text}>{l.text}</div></TableCell>
                <TableCell>{l.status ? <StatusChip status={l.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function LedgerTable({ report }: { report: PettyReport }) {
  const [all, setAll] = useState(false);
  const thisMonth = report.ledger.filter(l => l.month === report.meta.month);
  const t = report.tieout;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <FilterChip label="This month" count={thisMonth.length} active={!all} onClick={() => setAll(false)} />
        <FilterChip label="All months" count={report.ledger.length} active={all} onClick={() => setAll(true)} />
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Loads vs top-ups: {money(t.loads_vs_topups.statement)} vs {money(t.loads_vs_topups.ledger)} (diff {money(t.loads_vs_topups.diff)}).</p>
        <p>ATM cash: {money(t.atm_vs_withdrawals.statement)} on the card, {money(t.atm_vs_withdrawals.ledger)} withdrawn in the ledger.</p>
        <p>Card spend {money(t.purchases_vs_rollup.statement)} vs roll-up {money(t.purchases_vs_rollup.ledger)}: diff {money(t.purchases_vs_rollup.diff)}.</p>
      </div>
      <LedgerLines lines={all ? report.ledger : thisMonth} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected: no lines.

Run: `bunx eslint src/components/petty-cash/receipts-table.tsx src/components/petty-cash/ledger-table.tsx`
Expected: no output. If eslint reports the `<img>` line despite the disable comment, move the comment to the line directly above `<img` inside the JSX expression (`{/* eslint-disable-next-line @next/next/no-img-element */}`).

- [ ] **Step 4: Commit**

```bash
git add src/components/petty-cash/receipts-table.tsx src/components/petty-cash/ledger-table.tsx
git commit -m "Petty-cash report: Receipts and Ledger tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `PageStack` image viewer

**Files:**
- Create: `src/components/petty-cash/page-stack.tsx`

**Interfaces:**
- Consumes: `boxStyle`, type `Box` from `@/lib/petty-cash-report`; `cn`.
- Produces: `PageStack({ images: string[]; boxes: PageBox[]; activeIndex: number; jumpSignal: number; zoom: number; onPageInView?: (page: number) => void })` and `type PageBox = { page: number; box: Box; primary: boolean; label: string }`. Page numbers are 1-based and index `images`. `zoom` is a percentage of the pane width (100 = fit). Task 7 renders it.

- [ ] **Step 1: Write `page-stack.tsx`**

```tsx
'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { boxStyle, type Box } from '@/lib/petty-cash-report';
import { cn } from '@/lib/utils';

export type PageBox = { page: number; box: Box; primary: boolean; label: string };

const DEFAULT_ASPECT = 1.414; // A4 until the image reports its own size

/**
 * DocAI's image-mode page viewer, rebuilt small: every page of the file as a lazy <img> with the cited boxes drawn
 * in 0-1000 space on top, centred on the primary box whenever the citation, zoom or jump signal changes.
 *
 * Structure per page: an OUTER element that is sized, positioned, carries the ref, the page number and the paper
 * look (shadow, ring), with no containment; and an INNER absolute child that carries `content-visibility` and holds
 * the <img> and the boxes. Containment on the outer element would clip the label and the shadow (paint containment
 * clips overflow), which is what the first version of this component did.
 */
export function PageStack({ images, boxes, activeIndex, jumpSignal, zoom, onPageInView }: {
  images: string[];
  boxes: PageBox[];
  activeIndex: number;
  jumpSignal: number;
  zoom: number;
  onPageInView?: (page: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const rafRef = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Per-image state keyed by src, so switching the stack to another file (statement ↔ receipts) never reuses a
  // stale aspect or a stale failure from the previous file's page with the same number.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const active = boxes[activeIndex] ?? boxes[0] ?? null;
  const citedPage = active?.page ?? 1;
  const activeKey = active ? `${active.page}:${active.box.join(',')}` : '';
  const citedSrc = images[citedPage - 1];
  const citedLoaded = citedSrc !== undefined && aspects[citedSrc] !== undefined;
  // contentRect is the content box, so the scroller's padding is already excluded: 100 means fit.
  const pageWidth = Math.max(200, Math.round(containerWidth * (zoom / 100)));

  // The pane's width drives page width (100% = fit); measured, not assumed, so a resized pane re-fits.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Centre the primary box. Offsets are read from the page element, so they are right at every zoom.
  useEffect(() => {
    const scroller = scrollRef.current;
    const pageEl = active ? pageRefs.current.get(active.page) : null;
    if (!scroller || !pageEl || !active) return;
    const [x0, y0, x1, y1] = active.box;
    const top = pageEl.offsetTop + ((y0 + y1) / 2000) * pageEl.offsetHeight - scroller.clientHeight / 2;
    const left = pageEl.offsetLeft + ((x0 + x1) / 2000) * pageEl.offsetWidth - scroller.clientWidth / 2;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, jumpSignal, zoom, pageWidth, citedLoaded]);

  // A frame still pending at unmount would find no scroller; cancel it anyway.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const trackPageInView = () => {
    if (!onPageInView || rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const mid = scroller.scrollTop + scroller.clientHeight / 2;
      for (const [page, el] of pageRefs.current) {
        if (el.offsetTop <= mid && mid < el.offsetTop + el.offsetHeight) {
          onPageInView(page);
          return;
        }
      }
    });
  };

  return (
    <div ref={scrollRef} onScroll={trackPageInView} className="relative h-full overflow-auto bg-muted/40 p-3">
      <div className="flex w-max min-w-full flex-col items-center gap-6">
        {/* Pages render only once the pane is measured: a 200px placeholder frame would pull far more images into
            the lazy-load window than the real width ever shows, and those fetches cannot be taken back. */}
        {containerWidth > 0 &&
          images.map((src, i) => {
            const page = i + 1;
            const aspect = aspects[src] ?? DEFAULT_ASPECT;
            const isCited = page === citedPage;
            const height = Math.round(pageWidth * aspect);
            const pageBoxes = boxes.filter(b => b.page === page);
            return (
              <div
                key={page}
                data-page={page}
                ref={el => {
                  if (el) pageRefs.current.set(page, el);
                  else pageRefs.current.delete(page);
                }}
                className="relative shrink-0 rounded-sm bg-white shadow-lg ring-1 ring-black/5"
                style={{ width: pageWidth, height }}
              >
                <div className="absolute -top-4 left-0 select-none text-[10px] font-medium text-muted-foreground">{page}</div>
                <div
                  className="absolute inset-0 overflow-hidden rounded-sm"
                  // Off-screen pages skip layout and image loads; the cited one must load so the centring has a real height.
                  style={{ contentVisibility: isCited ? 'visible' : 'auto' } as CSSProperties}
                >
                  {failed[src] ? (
                    <div className="flex h-full w-full items-center justify-center bg-card text-xs text-muted-foreground">
                      Page image missing
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`Page ${page}`}
                      loading={isCited ? 'eager' : 'lazy'}
                      decoding="async"
                      className="block h-full w-full"
                      onLoad={e => {
                        const im = e.currentTarget;
                        if (im.naturalWidth) setAspects(a => (a[src] ? a : { ...a, [src]: im.naturalHeight / im.naturalWidth }));
                      }}
                      onError={() => setFailed(f => ({ ...f, [src]: true }))}
                    />
                  )}
                  {pageBoxes.map((b, j) => (
                    <div
                      key={j}
                      title={b.label}
                      className={cn('pointer-events-none absolute rounded-sm', b.primary ? 'bg-primary/10 ring-2 ring-primary' : 'bg-primary/5 ring-1 ring-primary/50')}
                      style={boxStyle(b.box)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected: no lines.

Run: `bunx eslint src/components/petty-cash/page-stack.tsx`
Expected: no output. If `react-hooks/exhaustive-deps` still complains about the centring effect, keep the dependency list exactly as written (it is keyed on `activeKey`, a string, so the box array identity does not matter) and leave the disable comment in place; if `react-hooks/set-state-in-effect` complains about `setContainerWidth`, it is inside a ResizeObserver callback, not the effect body — report it rather than restructuring.

- [ ] **Step 3: Commit**

```bash
git add src/components/petty-cash/page-stack.tsx
git commit -m "Petty-cash report: PageStack image viewer with cited boxes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `CitationPane`

**Files:**
- Create: `src/components/petty-cash/citation-pane.tsx`

**Interfaces:**
- Consumes: `PageStack`, `PageBox` (Task 6); `LedgerLines` (Task 5); from `@/lib/petty-cash-report`: `imageUrl`, `money`, types `PaneSources`, `PettyReport`, `Source`; `Button` from `@/components/ui/button`; icons `LocateFixed`, `Loader2`, `XIcon`, `ZoomIn`, `ZoomOut` from `lucide-react`.
- Produces: `CitationPane({ report: PettyReport; kbId: string; sources: PaneSources; initialSource: Source; onClose: () => void })`. Task 8 mounts it with `key={selectionKey}` so its tab, zoom and jump state reset per selection.

- [ ] **Step 1: Write `citation-pane.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { LocateFixed, XIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { imageUrl, money, type PaneSources, type PettyReport, type Source } from '@/lib/petty-cash-report';
import { LedgerLines } from './ledger-table';
import { PageStack, type PageBox } from './page-stack';

const ZOOM_MIN = 50;
const ZOOM_MAX = 300;
const ZOOM_STEP = 25;

const SOURCE_TABS: Array<{ key: Source; label: string }> = [
  { key: 'statement', label: 'Statement' },
  { key: 'receipt', label: 'Receipt' },
  { key: 'ledger', label: 'Ledger' },
];

/** Docked evidence pane: file header, zoom, jump-to-citation, and Statement / Receipt / Ledger tabs for one selection. */
export function CitationPane({ report, kbId, sources, initialSource, onClose }: {
  report: PettyReport;
  kbId: string;
  sources: PaneSources;
  initialSource: Source;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [zoom, setZoom] = useState(100);
  const [jump, setJump] = useState(0);
  const [pageInView, setPageInView] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const available: Record<Source, boolean> = {
    statement: sources.statement.length > 0,
    receipt: sources.receipts.length > 0,
    ledger: sources.ledger !== null,
  };
  const isPages = source !== 'ledger';
  const images = isPages
    ? (source === 'statement' ? report.meta.page_images.statement : report.meta.page_images.receipts).map(p => imageUrl(kbId, p))
    : [];
  const boxes: PageBox[] =
    source === 'statement'
      ? sources.statement.flatMap((c, i) => (c.box ? [{ page: c.page, box: c.box, primary: i === 0, label: 'Statement row' }] : []))
      : source === 'receipt'
        ? sources.receipts.map((c, i) => ({ page: c.page, box: c.box, primary: i === sources.index, label: c.group_id }))
        : [];
  const activeIndex = source === 'receipt' ? sources.index : 0;
  const citedPage = boxes[activeIndex]?.page ?? boxes[0]?.page ?? 1;
  const fileName = report.meta.files[source === 'receipt' ? 'receipts' : source] ?? '';
  const ledger = sources.ledger;

  return (
    <aside aria-label="Evidence" className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={sources.title}>{sources.title}</p>
        {isPages && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" title="Zoom out" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))}>
              <ZoomOut className="size-4" />
            </Button>
            <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">{zoom}%</span>
            <Button variant="ghost" size="icon-sm" title="Zoom in" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))}>
              <ZoomIn className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Jump to citation" aria-label="Jump to citation" onClick={() => setJump(j => j + 1)}>
              <LocateFixed className="size-4" />
            </Button>
          </div>
        )}
        <Button variant="ghost" size="icon-sm" title="Close" aria-label="Close evidence pane" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <div role="tablist" className="flex gap-1">
          {SOURCE_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={source === t.key}
              disabled={!available[t.key]}
              onClick={() => {
                setSource(t.key);
                setPageInView(null); // the indicator belongs to the file being shown; a fresh stack reports its own page
              }}
              className={cn(
                'h-7 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-40',
                source === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:hover:bg-transparent'
              )}
            >
              {t.label}
              {t.key === 'receipt' && sources.receipts.length > 1 && <span className="ml-1 tabular-nums opacity-70">{sources.receipts.length}</span>}
            </button>
          ))}
        </div>
        <p className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground" title={fileName}>
          {fileName}
          {isPages && images.length > 0 && ` · page ${pageInView ?? citedPage} of ${images.length}`}
        </p>
      </div>
      <div className="min-h-0 flex-1">
        {isPages ? (
          // Keyed by source: the statement file and the receipts file each get their own stack (fresh scroll, fresh image nodes).
          <PageStack key={source} images={images} boxes={boxes} activeIndex={activeIndex} jumpSignal={jump} zoom={zoom} onPageInView={setPageInView} />
        ) : ledger ? (
          <div className="h-full space-y-2 overflow-auto p-3">
            <p className="text-xs text-muted-foreground">
              {ledger.cell} · {ledger.code} · {money(ledger.amount)} ·{' '}
              {ledger.relation === 'rolled-up'
                ? 'this row is rolled up into the line below'
                : ledger.relation === 'tied'
                  ? 'this row is tied to the line below'
                  : ledger.relation}
            </p>
            <LedgerLines lines={report.ledger.filter(l => l.month === report.meta.month)} highlightCode={ledger.code} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected: no lines.

Run: `bunx eslint src/components/petty-cash/citation-pane.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/petty-cash/citation-pane.tsx
git commit -m "Petty-cash report: docked citation pane with Statement, Receipt and Ledger sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `PettyCashReport` and the Report tab

**Files:**
- Create: `src/components/petty-cash/report.tsx`
- Modify: `src/components/reconcile-runner.tsx` (imports at lines 2–5; the petty-cash block around lines 276–350)

**Interfaces:**
- Consumes: `TransactionsTable` (Task 4), `ReceiptsTable`, `LedgerTable` (Task 5), `CitationPane` (Task 7); from `@/lib/petty-cash-report`: `money`, `paneSources`, `pct`, types `PettyReport`, `Selection`; `Card`, `Button`; `Loader2` icon.
- Produces: `PettyCashReport({ kbId: string; version: number })`, mounted by `ReconcileRunner` when the pill is on.

- [ ] **Step 1: Write `report.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { money, paneSources, pct, type PettyReport, type Selection } from '@/lib/petty-cash-report';
import { CitationPane } from './citation-pane';
import { LedgerTable } from './ledger-table';
import { ReceiptsTable } from './receipts-table';
import { TransactionsTable } from './transactions-table';

type Tab = 'transactions' | 'receipts' | 'ledger';
const TABS: Array<{ key: Tab; label: string; count: (r: PettyReport) => number }> = [
  { key: 'transactions', label: 'Transactions', count: r => r.rows.length },
  { key: 'receipts', label: 'Receipts', count: r => r.receipts.length },
  { key: 'ledger', label: 'Ledger', count: r => r.ledger.length },
];

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card size="sm" className="gap-1 px-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[28px] font-semibold leading-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

/** The petty-cash report for one workspace: KPI tiles, three tabbed tables and the docked citation pane. */
export function PettyCashReport({ kbId, version }: { kbId: string; version: number }) {
  const [state, setState] = useState<{ report: PettyReport | null; error: string | null }>({ report: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('transactions');
  const [selection, setSelection] = useState<Selection | null>(null);

  // `version` is the Run counter: a new run re-fetches; the previous report stays on screen until the new one lands.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/petty-cash/${kbId}/report.json?v=${version}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as PettyReport;
      })
      .then(report => {
        if (!cancelled) setState({ report, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ report: null, error: e instanceof Error ? e.message : 'Failed to load' });
      });
    return () => {
      cancelled = true;
    };
  }, [kbId, version, attempt]);

  const closePane = useCallback(() => setSelection(null), []);
  const onSelect = useCallback((s: Selection) => setSelection(s), []);

  if (state.error) {
    return (
      <Card className="px-6 py-6 text-sm">
        <p className="mb-3">Couldn&apos;t load the petty-cash report ({state.error}).</p>
        <Button
          size="sm"
          onClick={() => {
            setState({ report: null, error: null });
            setAttempt(a => a + 1);
          }}
        >
          Retry
        </Button>
      </Card>
    );
  }
  const report = state.report;
  if (!report) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sources = selection ? paneSources(report, selection) : null;
  const selectionKey = selection ? JSON.stringify(selection) : '';
  const k = report.kpis;
  const built = new Date(report.meta.built_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className={cn('gap-4', sources && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,45%)]')}>
      <div className="min-w-0 space-y-4">
        <header>
          <h3 className="text-h3">{report.meta.client} · {report.meta.month_label}</h3>
          <p className="text-xs text-muted-foreground">Statement · receipts · ledger · built {built}</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Card spend" value={money(k.card_spend)} sub={`SAR · ${k.purchase_count} purchases + ${k.atm_count} ATM withdrawals`} />
          <Tile label="Evidenced" value={pct(k.evidenced_amount, k.purchases_amount)} sub={`${money(k.evidenced_amount)} of ${money(k.purchases_amount)} SAR has a matched receipt`} />
          <Tile label="Open gap" value={money(k.open_gap)} sub={`ledger roll-up ${money(k.rollup)} minus card spend`} />
          <Tile label="Receipts to find" value={String(k.missing_count)} sub={`${money(k.missing_amount)} SAR without a receipt`} />
        </div>
        <div role="tablist" className="flex flex-wrap gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'h-8 rounded-full px-3 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {t.label} <span className="tabular-nums opacity-70">{t.count(report)}</span>
            </button>
          ))}
        </div>
        {tab === 'transactions' && <TransactionsTable rows={report.rows} selection={selection} onSelect={onSelect} />}
        {tab === 'receipts' && <ReceiptsTable report={report} kbId={kbId} selection={selection} onSelect={onSelect} />}
        {tab === 'ledger' && <LedgerTable report={report} />}
      </div>
      {sources && selection && (
        <div className="fixed inset-0 z-50 bg-background/95 p-3 lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:h-[calc(100vh-7rem)] lg:bg-transparent lg:p-0">
          <CitationPane key={selectionKey} report={report} kbId={kbId} sources={sources} initialSource={selection.source} onClose={closePane} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `reconcile-runner.tsx`**

Imports (top of file): change

```ts
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
```

to

```ts
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
```

and add, after the `import AgentPlan, { Task } from './ui/agent-plan';` line:

```ts
import { PettyCashReport } from './petty-cash/report';
```

Delete this block entirely (it was the iframe's theme sync):

```ts
  const { resolvedTheme } = useTheme();
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The report keys its dark tokens off :root.dark; mirror the app's theme onto the iframe document.
  const syncFrameTheme = useCallback(() => {
    frameRef.current?.contentDocument?.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);
  useEffect(() => { syncFrameTheme(); }, [syncFrameTheme, showPettyCash]);
```

In the probe effect change

```ts
  // One probe per workspace: a 200 means the scripts' report exists for this kbId.
  useEffect(() => {
    const url = `/api/petty-cash/${kbId}/report.html`;
```

to

```ts
  // One probe per workspace: a 200 means the scripts' report.json exists for this kbId.
  useEffect(() => {
    const url = `/api/petty-cash/${kbId}/report.json`;
```

Replace the iframe branch

```tsx
      {showPettyCash && pettyCashUrl ? (
        <iframe
          ref={frameRef}
          onLoad={syncFrameTheme}
          src={pettyRun.version ? `${pettyCashUrl}?v=${pettyRun.version}` : pettyCashUrl}
          title="Petty-cash report"
          className="w-full rounded-xl border border-border bg-white"
          style={{ height: 'calc(100vh - 160px)' }}
        />
      ) : (
```

with

```tsx
      {showPettyCash && pettyCashUrl ? (
        <PettyCashReport kbId={kbId} version={pettyRun.version} />
      ) : (
```

`pettyCashUrl` keeps its role as the "report exists" flag; nothing else in the file changes.

- [ ] **Step 3: Typecheck, lint, full test run**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "__tests__" | grep -v "\.test\.ts"`
Expected: no lines.

Run: `bunx eslint src/components/petty-cash/report.tsx src/components/reconcile-runner.tsx`
Expected: no output (an unused `useCallback`/`useTheme` import means Step 2 was not applied in full).

Run: `bun test`
Expected: 0 fail (277 pass: 262 before, plus 15 from Task 3; Task 2 changed counts within its file).

Do not start a dev server in this task; the controller runs the page in Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/components/petty-cash/report.tsx src/components/reconcile-runner.tsx
git commit -m "Report tab renders the petty-cash report in React instead of an iframe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Browser verification against the snapshot (controller)

This task is run by the controlling session with the built-in browser, not by an implementer subagent. Findings become one fix dispatch.

**Files:** none planned; fixes go to the files above.

- [ ] **Step 1: Start the worktree's dev server** with the launch entry `reconai-3002` (`.claude/launch.json` in the worktree) and open `http://localhost:3002`. Sign in if the session cookie is not carried over from port 3001.

- [ ] **Step 2: Open the ABUJHD workspace → Report tab → "Petty-cash report" pill.** Check against `data/abujhd/report.json`:
  - KPI tiles read Card spend 17,439.10 · Evidenced {pct} · Open gap 1,981.70 · Receipts to find 9.
  - Tab counts: Transactions 129 · Receipts 172 · Ledger 77.
  - Filter chip counts equal `counts.rows` (Matched 76, Needs a decision 14, Missing receipt 9, Amounts differ 5, Not in ledger 19, Tied to ledger 6).

- [ ] **Step 3: Citations.** Click a Matched row: the pane docks right, Receipt tab active, the receipt page scrolls into view with the purple box around the receipt. Click the `Stmt` chip: the statement page with the thin strip box. Click `Ledger B82`: the ledger table with the roll-up line highlighted. Zoom in twice, jump to citation re-centres. Escape closes. Below `lg` (resize the pane to 900px wide) the pane covers the screen and closes with the X.

- [ ] **Step 4: Receipts tab.** Filter "Needs a decision"; click a candidate chip: the pane switches to that row's statement strip; the Transactions tab still shows the row selected when switched back. An orphan group has only the Receipt tab enabled.

- [ ] **Step 5: Dark mode and Run.** Toggle the theme: tables, chips, pane and tiles follow; page images stay white with their ring. Click "Run petty-cash reconciliation": the note line appears and the tiles re-render from the fresh `report.json`.

- [ ] **Step 6: Record** anything off as findings for one fix dispatch, then screenshots for the user.

---

### Post-review amendments (applied in the fix wave after Task 9; the code is the reference)

- `LedgerLines` scrolls the highlighted line to the centre of the nearest `[data-scroll-container]` (the pane body)
  instead of `scrollIntoView`, which also scrolled the document; highlighted rows carry `aria-current`.
- `report.tsx` picks docked vs overlay with a `matchMedia('(min-width: 1024px)')` hook (`useSyncExternalStore`) and
  renders the overlay through `createPortal(…, document.body)` so it sits above the sidebar rail.
- `TransactionsTable` gains `compact?: boolean` (hides the Note column); `report.tsx` passes `compact={Boolean(sources)}`.
- Review minors folded in: `Object.hasOwn` in `statusMeta` (with a test), same-tab click guard and `defaultPrevented`
  guard in the pane, Jump disabled with no boxes, `rafRef` reset after cancel, lazy crop images, `aria-hidden` sort
  glyphs, selection cleared when a re-run drops its ref, runner comment updated.
