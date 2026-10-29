# ABUJHD Petty-Cash Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three Python scripts that refine DocAI's parsed chunks of the client's September 2026 petty-cash sources, link every bank-card transaction to its receipt evidence and ledger line, and render a whiteboard HTML report a human can verify and fix from.

**Architecture:** `a_refine.py` cleans and geometrically groups DocAI segments into receipt-level groups, heals only clearly broken groups through a pluggable vision model, and writes JSON; `b_match.py` is pure logic over that JSON (score, greedy 1:1, ledger tie-out, statuses); `c_report.py` renders `report.html`. Spec: `docs/superpowers/specs/2026-10-22-abujhd-petty-cash-recon-design.md`.

**Tech Stack:** Python 3.14, PIL + numpy (present), `requests` (present), `anthropic` SDK (install), poppler `pdftoppm` / `pdftotext` (present at `/opt/homebrew/bin`). No TypeScript, no app changes.

## Global Constraints

- Branch `feat/abujhd-petty-cash`; `data/abujhd/` is git-ignored (already in `.gitignore`).
- Scripts live in `scripts/abujhd/`; every script accepts `--data data/abujhd` (default) and is idempotent.
- Inputs are DocAI's existing segments; Step A refines, never re-extracts (one exception: the statement table is rebuilt from the PDF's own text layer, marked `healer: "pdf-text-layer"`).
- Healer models: `--healer openai` → `gpt-5.6-luna` (Responses API, JSON schema); `--healer claude` → `claude-sonnet-5-5` (Messages API, `output_config.format` JSON schema). Keys from `.env.local`: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- Only groups matching a broken rule are sent to the healer; responses cached by `sha256(crop + segments)`.
- Page space for all boxes is DocAI's 1000×1000; page renders are 150 ppi (1240×1754 for A4).
- Tests are plain `python3 scripts/abujhd/test_*.py` with `assert`, no framework.
- DocAI ids and file names are per-client config in the git-ignored `data/abujhd/config.json` (template: `scripts/abujhd/config.example.json`; also holds `month` and the ledger `sheet`). DocAI base `http://localhost:8080`, key `DOCAI_API_KEY` in `.env.local` (needed only when `raw/` lacks a file).
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/abujhd/common.py` | Paths, `.env.local` loader, lenient JSON io, DocAI raw fetch, text normalisers (digits, amounts, dates). Nothing domain-specific beyond that. |
| `scripts/abujhd/a_refine.py` | Step A entry point: statement + ledger parsing, segment clean, geometric grouping, derived fields, link, broken detection, healing orchestration, EDA. |
| `scripts/abujhd/healer.py` | The two model backends behind one `heal(group, crop_png_bytes, backend) -> dict` function, plus the on-disk cache. |
| `scripts/abujhd/b_match.py` | Step B entry point: pure functions `collapse_card_slips`, `score`, `match_receipts`, `tie_out_ledger`, `assign_statuses`, `main`. |
| `scripts/abujhd/c_report.py` | Step C entry point: builds `report.html` from `matches.json` + `groups.json` + crops. |
| `scripts/abujhd/test_refine.py` | Asserts for A's pure functions (normalisers, statement line regex, grouping, derived fields, broken rules). |
| `scripts/abujhd/test_match.py` | Asserts for B (6-row fixture: exact, ±1 day, tie→REVIEW, orphan, missing, override). |
| `scripts/abujhd/requirements.txt` | `anthropic` only (everything else is present). |

Data (`data/abujhd/`): `raw/{receipts,statement,ledger}.{bin,segments.json}`, `pages/page-NN.png`, `crops/<group-id>.png`, `cache/<sha>.json`, `segments.refined.json`, `groups.json`, `statement.json`, `ledger.json`, `matches.json`, `eda.md`, `report.html`, optional `overrides.json`.

---

### Task 1: `common.py` — paths, env, lenient JSON, raw fetch, normalisers

**Files:**
- Create: `scripts/abujhd/common.py`
- Create: `scripts/abujhd/requirements.txt`
- Test: `scripts/abujhd/test_refine.py`

**Interfaces:**
- Produces:
  - `DATA: Path` (resolved from `--data`, set by `set_data(path)`), `RAW, PAGES, CROPS, CACHE: Path`
  - `env(name: str) -> str | None` — reads `.env.local` at repo root once, then `os.environ`
  - `load_json(path) -> Any` (strict=False), `save_json(path, obj)` (indent 1, ensure_ascii=False)
  - `ensure_raw() -> None` — downloads the 3 files' bytes + segments into `RAW` if missing
  - `ascii_digits(s: str) -> str` — Arabic-Indic `٠١٢٣٤٥٦٧٨٩` and `۰..۹` → `0-9`
  - `norm_text(s: str) -> str` — `ascii_digits` + NFKC + strip `#` heading marks + collapse whitespace
  - `find_amounts(text) -> list[float]` — every `x.xx` amount (thousands separators allowed)
  - `find_dates(text) -> list[str]` — ISO `YYYY-MM-DD` strings; day-first for slashed/dashed dates, month names (`SEP`, `Sep`) supported
  - `config() -> dict` — `data/abujhd/config.json`: `{"files": {receipts, statement, ledger ids}, "names": {…file names…}, "month": "YYYY-MM", "sheet": "General Ledger"}`

- [ ] **Step 1: Write the failing test**

```python
# scripts/abujhd/test_refine.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import ascii_digits, norm_text, find_amounts, find_dates

def test_normalisers():
    assert ascii_digits("٢٨٠٨٠٢٠٢") == "28080202"
    assert norm_text("## Total  ٤١.٠٠ ") == "Total 41.00"
    assert find_amounts("Total 1,144.25 VAT 5.35 x 20") == [1144.25, 5.35]
    # unique ISO dates in order of first appearance ("0 1 SEP 2026" and "01-09-2026" repeat 2026-09-01)
    assert find_dates("Date 01/09/2026 05:17 PM, 2026/09/02, 0 1 SEP 2026, 01-09-2026") == ["2026-09-01", "2026-09-02"]

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ModuleNotFoundError: No module named 'common'`

- [ ] **Step 3: Write `common.py`**

```python
# scripts/abujhd/common.py
"""Shared helpers for the ABUJHD petty-cash scripts: paths, env, JSON, raw fetch, normalisers."""
import json, os, re, unicodedata
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "abujhd"
RAW = PAGES = CROPS = CACHE = DATA  # re-bound by set_data()

DOCAI = "http://localhost:8080"


def set_data(path):
    global DATA, RAW, PAGES, CROPS, CACHE
    DATA = Path(path).resolve()
    RAW, PAGES, CROPS, CACHE = DATA / "raw", DATA / "pages", DATA / "crops", DATA / "cache"
    for d in (RAW, PAGES, CROPS, CACHE):
        d.mkdir(parents=True, exist_ok=True)


_env = None
def env(name):
    global _env
    if _env is None:
        _env = {}
        p = ROOT / ".env.local"
        if p.exists():
            for line in p.read_text().splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    _env[k.strip()] = v.strip()
    return os.environ.get(name) or _env.get(name) or None


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"), strict=False)


def save_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def config():
    return load_json(DATA / "config.json")   # git-ignored per-client settings


def ensure_raw():
    """Fetch bytes + DocAI segments for the three files into RAW if missing."""
    for name, fid in config()["files"].items():
        for suffix, path in (("content", RAW / f"{name}.bin"), ("segments", RAW / f"{name}.segments.json")):
            if path.exists():
                continue
            key = env("DOCAI_API_KEY")
            assert key, "DOCAI_API_KEY missing from .env.local"
            r = requests.get(f"{DOCAI}/v1/files/{fid}/{suffix}", headers={"x-api-key": key}, timeout=120)
            r.raise_for_status()
            path.write_bytes(r.content)


_AR = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
def ascii_digits(s):
    return s.translate(_AR)


def norm_text(s):
    s = unicodedata.normalize("NFKC", ascii_digits(s or ""))
    s = re.sub(r"^\s*#{1,6}\s*", "", s, flags=re.M)
    return re.sub(r"\s+", " ", s).strip()


_AMT = re.compile(r"(?<![\d.])(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?!\d)")
def find_amounts(text):
    return [float(m.replace(",", "")) for m in _AMT.findall(ascii_digits(text or ""))]


_MONTHS = {m: i for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(), 1)}
_DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b"), lambda m: (m[1], m[2], m[3])),           # yyyy-mm-dd
    (re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b"), lambda m: (m[3], m[2], m[1])),       # dd/mm/yyyy
    (re.compile(r"\b(\d)\s?(\d)\s+([A-Za-z]{3})\s+(\d{4})\b"), lambda m: (m[4], _MONTHS.get(m[3].upper(), 0), m[1] + m[2])),  # 0 1 SEP 2026
    (re.compile(r"\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b"), lambda m: (m[3], _MONTHS.get(m[2].upper(), 0), m[1])),           # 1 SEP 2026
]
def find_dates(text):
    """Unique ISO dates in order of first appearance."""
    found = []
    t = ascii_digits(text or "")
    for rx, pick in _DATE_PATTERNS:
        for m in rx.finditer(t):
            y, mo, d = pick(m)
            y, mo, d = int(y), int(mo), int(d)
            if 1 <= mo <= 12 and 1 <= d <= 31 and 2000 <= y <= 2100:
                found.append((m.start(), f"{y:04d}-{mo:02d}-{d:02d}"))
    return list(dict.fromkeys(iso for _, iso in sorted(found)))
```

```
# scripts/abujhd/requirements.txt
anthropic
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ok test_normalisers`

- [ ] **Step 5: Install the SDK and fetch raw data once**

Run: `pip3 install -r scripts/abujhd/requirements.txt && python3 -c "import sys; sys.path.insert(0,'scripts/abujhd'); import common; common.set_data('data/abujhd'); common.ensure_raw(); print(sorted(p.name for p in common.RAW.iterdir()))"`
Expected: six files listed: `ledger.bin ledger.segments.json receipts.bin receipts.segments.json statement.bin statement.segments.json`

- [ ] **Step 6: Commit**

```bash
git add scripts/abujhd/common.py scripts/abujhd/requirements.txt scripts/abujhd/test_refine.py
git commit -m "abujhd: shared helpers, raw fetch, normalisers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Statement rows from the PDF text layer + orange flags

**Files:**
- Create: `scripts/abujhd/a_refine.py`
- Test: `scripts/abujhd/test_refine.py`

**Interfaces:**
- Consumes: `common.ascii_digits`, `common.RAW`
- Produces:
  - `parse_statement_line(line: str) -> dict | None` with keys `ref, amount, date (YYYY-MM-DD), time (HH:MM:SS), balance, type, merchant, txn_code, load_type, kind, y` (`y` is None until orange mapping)
  - `build_statement(pdf: Path) -> list[dict]` — 129 rows with `orange: bool`

- [ ] **Step 1: Write the failing test**

```python
# append to scripts/abujhd/test_refine.py (above the __main__ block)
from a_refine import parse_statement_line

# synthetic lines in the statement's exact layout (the real ones stay in git-ignored data); see scripts/abujhd/test_refine.py
LINE_PURCHASE = "611111111111       290                    20260930 0819200   20260930   Err:509 Sep             854.24556           290 Financial              SAMPLE FUEL STATIONCITY ONECITY AAU      30092026          854.25     -    0                                    -290 Unknown                 Unknown"
LINE_LOAD = "9260928090900000001   0                      20260928 0909150   20260928   Err:509 Sep           2511.24556           2500 Load                   FROM0000000000000000000000000                      28092026        2,511.25     -    201                                 2500 Incoming Fund Transfer   SAMP"
LINE_ATM = "622222222222       50                     20260928 1156070   20260928   Err:509 Sep           1333.24556            50 Financial             SAMPLE BANK ATM CITY ONE                   28092026        1,333.25     -    1                                     -50 Unknown                 Unknown"

def test_statement_line():
    p = parse_statement_line(LINE_PURCHASE)
    assert p["ref"] == "611111111111" and p["amount"] == 290.0 and p["kind"] == "purchase"
    assert p["date"] == "2026-09-30" and p["time"] == "08:19:20" and p["balance"] == 854.25
    assert p["merchant"].startswith("SAMPLE FUEL STATION")
    l = parse_statement_line(LINE_LOAD)
    assert l["kind"] == "load" and l["amount"] == 2500.0 and l["load_type"] == "Incoming Fund Transfer"
    a = parse_statement_line(LINE_ATM)
    assert a["kind"] == "atm" and a["txn_code"] == "1"
    assert parse_statement_line("     Ref. Num        Transaction Amount") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ModuleNotFoundError: No module named 'a_refine'`

- [ ] **Step 3: Write the statement part of `a_refine.py`**

```python
# scripts/abujhd/a_refine.py
"""Step A: refine DocAI's parsed chunks — clean, group, link, heal. See the spec."""
import argparse, re, subprocess, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import numpy as np
from PIL import Image
import common
from common import ascii_digits, norm_text, find_amounts, find_dates, load_json, save_json

# --- Statement (bank-card grid) from the PDF's own text layer ---------------------------
_ROW = re.compile(
    r"^\s*(?P<ref>\d{10,20})\s+(?P<txn>[\d.]+)\s+(?P<date>\d{8}) (?P<time>\d{6,7})\s+\d{8}\s+Err:509 \w+\s+"
    r"(?P<balance>[\d.]+)\s+(?P<bill>[\d.]+)\s+(?P<type>Financial|Load)\s+(?P<merchant>.*?)\s{2,}"
    r"(?P<cortex>\d{8})\s+(?P<avail>[\d,.()]+)\s+\S+\s+(?P<code>\d+)\s+(?P<signed>-?[\d.]+)\s+"
    r"(?P<load_type>.*?)\s{2,}(?P<load_src>\S+)\s*$")

KIND = {"201": "load", "1": "atm", "30": "atm", "35": "atm"}

def parse_statement_line(line):
    m = _ROW.match(line)
    if not m:
        return None
    g = m.groupdict()
    amount = float(g["bill"]) if g["type"] == "Load" else float(g["txn"])
    d, t = g["date"], g["time"][:6]
    return {
        "ref": g["ref"], "amount": round(amount, 2),
        "date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "time": f"{t[:2]}:{t[2:4]}:{t[4:6]}",
        "balance": round(float(g["balance"]), 2), "type": g["type"],
        "merchant": g["merchant"].strip(), "txn_code": g["code"],
        "load_type": g["load_type"].strip(), "kind": KIND.get(g["code"], "purchase"),
        "y": None, "orange": False,
    }


def _orange_bands(png):
    im = np.asarray(Image.open(png).convert("RGB")).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    on = ((r > 200) & (g > 80) & (g < 170) & (b < 120)).mean(axis=1) > 0.15
    bands, start = [], None
    for y, v in enumerate(on):
        if v and start is None: start = y
        if not v and start is not None: bands.append((start, y)); start = None
    return bands


def build_statement(pdf):
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    rows = [r for r in (parse_statement_line(l) for l in text.splitlines()) if r]
    # y of each ref from the bbox layout (PDF points), mapped to the 200 ppi render for orange detection.
    bbox = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    ys = {m.group(2): float(m.group(1)) for m in re.finditer(r'<word xMin="[\d.]+" yMin="([\d.]+)"[^>]*>(\d{10,20})</word>', bbox)}
    png = common.PAGES / "statement-200.png"
    subprocess.run(["pdftoppm", "-r", "200", "-png", "-singlefile", str(pdf), str(png.with_suffix(""))], check=True)
    bands = _orange_bands(png)
    scale = 200 / 72
    for r in rows:
        y = ys.get(r["ref"])
        r["y"] = y
        if y is not None:
            yp = y * scale
            r["orange"] = any(s - 3 <= yp <= e + 3 for s, e in bands)
    return rows
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ok test_normalisers`, `ok test_statement_line`

- [ ] **Step 5: Sanity-run on the real file**

Run: `python3 -c "import sys; sys.path.insert(0,'scripts/abujhd'); import common, a_refine; common.set_data('data/abujhd'); rows=a_refine.build_statement(common.RAW/'statement.bin'); import collections; print(len(rows), collections.Counter(r['kind'] for r in rows), sum(r['orange'] for r in rows))"`
Expected: `129 Counter({'purchase': 104, 'atm': 19, 'load': 6}) 79` (orange count may differ by ±2; anything far from 79 means the y mapping is off — check `scale`).

- [ ] **Step 6: Commit**

```bash
git add scripts/abujhd/a_refine.py scripts/abujhd/test_refine.py
git commit -m "abujhd: statement rows from the PDF text layer with orange flags

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Ledger rows from the xlsx segments

**Files:**
- Modify: `scripts/abujhd/a_refine.py`
- Test: `scripts/abujhd/test_refine.py`

**Interfaces:**
- Produces: `parse_ledger(segments: list[dict]) -> list[dict]` with keys `code, date (YYYY-MM-DD), text, debit, credit, balance, month (YYYY-MM)`

- [ ] **Step 1: Write the failing test**

```python
# append to test_refine.py
from a_refine import parse_ledger

LEDGER_SEG = {"coordinates": {"sheetName": "General Ledger", "startRow": 2, "startCol": 1},
    "markdown": "Sheet: General Ledger\nRange: A2:I4\n\n| Column 1 | Column 2 | From 04/01/2026 to 09/30/2026 | c4 | c5 | c6 | c7 | c8 | c9 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
                "| Code | Account Name | Date | Communication | Partner | Currency | Debit | Credit | Balance |\n"
                "|  | MISC/2026/09/0031 | 09/30/2026 | Petty Cash for SEP |  |  |  | 19420.8 | -1272.31 |\n"
                "|  | MISC/2026/09/0020 | 09/01/2026 | Top up |  |  | 3000 |  | 3793.34 |\n"}

def test_ledger():
    rows = parse_ledger([LEDGER_SEG, {"coordinates": {"sheetName": "Filters"}, "markdown": "| x |"}])
    assert [r["code"] for r in rows] == ["MISC/2026/09/0031", "MISC/2026/09/0020"]
    assert rows[0]["date"] == "2026-09-30" and rows[0]["credit"] == 19420.8 and rows[0]["debit"] is None
    assert rows[1]["debit"] == 3000.0 and rows[1]["month"] == "2026-09"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ImportError: cannot import name 'parse_ledger'`

- [ ] **Step 3: Add `parse_ledger`**

```python
# a_refine.py — after build_statement
def _num(s):
    s = ascii_digits(s).replace(",", "").strip()
    return round(float(s), 2) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None

def parse_ledger(segments):
    rows = []
    for seg in segments:
        if (seg.get("coordinates") or {}).get("sheetName") != "General Ledger":
            continue
        for line in seg.get("markdown", "").split("\n"):
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 9 or not cells[1].startswith("MISC/"):
                continue
            # the ledger writes MM/DD/YYYY (09/30/2026), unlike the day-first receipts, so parse it here
            m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", ascii_digits(cells[2]))
            rows.append({"code": cells[1], "date": f"{m[3]}-{m[1]}-{m[2]}" if m else None, "text": norm_text(cells[3]),
                         "debit": _num(cells[6]), "credit": _num(cells[7]), "balance": _num(cells[8]),
                         "month": cells[1][5:12].replace("/", "-")})
    return rows
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: three `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/abujhd/a_refine.py scripts/abujhd/test_refine.py
git commit -m "abujhd: ledger rows from the xlsx segments

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Clean segments and group them geometrically into receipts

**Files:**
- Modify: `scripts/abujhd/a_refine.py`
- Test: `scripts/abujhd/test_refine.py`

**Interfaces:**
- Produces:
  - `NOISE = {"footer", "page_number", "logo"}`
  - `clean_segment(seg) -> dict` — returns the segment with `raw` (original markdown), `text` (normalised; HTML tables → ` | `-joined rows), `noise: bool`, `healed: False`, `healer: None`
  - `group_page(segs: list[dict]) -> list[list[dict]]` — connected components by the spec's geometry rule, small components merged into the nearest
  - `derive_fields(text: str, segs: list[dict]) -> dict` — `amounts: [{value, total_candidate}], dates: [...], merchant_candidates: [...], approval_code, invoice_no`
  - `build_groups(segments: list[dict]) -> list[dict]` — all pages; group ids `p{page:02d}-g{n}`; cross-page merge; each group `{id, page, pages, box, segment_ids, text, ...derive_fields}`

- [ ] **Step 1: Write the failing test**

```python
# append to test_refine.py
from a_refine import clean_segment, group_page, derive_fields, build_groups

def seg(i, page, x0, y0, x1, y1, text, typ="text"):
    return {"id": f"s{i}", "type": typ, "markdown": text,
            "coordinates": {"pageNumber": page, "xmin": x0, "ymin": y0, "xmax": x1, "ymax": y1}}

def test_clean_and_group():
    c = clean_segment(seg(0, 1, 0, 0, 10, 10, "<table><tr><td>A</td><td>٤١.٠٠</td></tr></table>", "table"))
    assert c["text"] == "A | 41.00" and c["raw"].startswith("<table") and c["noise"] is False
    assert clean_segment(seg(1, 1, 0, 0, 1, 1, "Page 1 of 1", "page_number"))["noise"] is True
    # two receipts side by side (left column y 0..600, right column y 0..500), plus a far-apart footer-less text
    segs = [seg(1, 1, 50, 50, 300, 120, "stc"), seg(2, 1, 60, 130, 290, 300, "Total 57.50"),
            seg(3, 1, 400, 40, 700, 200, "MAZA REST"), seg(4, 1, 410, 215, 690, 400, "Net 41.00 Date 01/09/2026"),
            seg(5, 1, 60, 320, 295, 600, "VAT included")]
    groups = group_page([clean_segment(s) for s in segs])
    ids = sorted(sorted(s["id"] for s in g) for g in groups)
    assert ids == [["s1", "s2", "s5"], ["s3", "s4"]]
    f = derive_fields("MAZA REST\nNet 41.00 Date 01/09/2026 APPROVAL CODE 053920 Inv No. 53076", [clean_segment(seg(3, 1, 0, 0, 1, 1, "MAZA REST", "title"))])
    assert f["amounts"] == [{"value": 41.0, "total_candidate": True}]
    assert f["dates"] == ["2026-09-01"] and f["approval_code"] == "053920" and f["invoice_no"] == "53076"
    assert f["merchant_candidates"] == ["MAZA REST"]

def test_build_groups_cross_page():
    segs = [seg(1, 2, 50, 50, 900, 300, "Ibrahim Al-Fares Inv No. 896409 page 1 of 2"),
            seg(2, 3, 50, 50, 900, 300, "continued Inv No. 896409 Total 218.50")]
    groups = build_groups([clean_segment(s) for s in segs])
    assert len(groups) == 1 and groups[0]["pages"] == [2, 3] and groups[0]["id"] == "p02-g1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ImportError: cannot import name 'clean_segment'`

- [ ] **Step 3: Add clean, group, derive, build**

```python
# a_refine.py — cleaning and grouping
NOISE = {"footer", "page_number", "logo"}
_TABLE = re.compile(r"<table\b[^>]*>([\s\S]*?)(?:</table\s*>|$)", re.I)
_CELL = re.compile(r"<t[dh]\b[^>]*>([\s\S]*?)(?=<t[dh]\b|</tr|</table|$)", re.I)

def _tables_to_rows(text):
    def rows(m):
        out = []
        for row in re.split(r"<tr\b[^>]*>", m.group(1), flags=re.I):
            cells = [norm_text(re.sub(r"<[^>]*>", " ", c)) for c in _CELL.findall(row)]
            if cells: out.append(" | ".join(cells))
        return "\n".join(out)
    return _TABLE.sub(rows, text)

def clean_segment(seg):
    raw = seg.get("markdown") or ""
    text = "\n".join(norm_text(l) for l in _tables_to_rows(raw).split("\n")).strip()
    return {**seg, "raw": raw, "text": text, "noise": seg.get("type") in NOISE, "healed": False, "healer": None}


def _box(s):
    c = s["coordinates"]; return c["xmin"], c["ymin"], c["xmax"], c["ymax"]

def _together(a, b):
    ax0, ay0, ax1, ay1 = _box(a); bx0, by0, bx1, by1 = _box(b)
    shared = min(ax1, bx1) - max(ax0, bx0)
    narrower = max(1, min(ax1 - ax0, bx1 - bx0))
    vgap = max(by0 - ay1, ay0 - by1, 0)
    return shared >= 0.4 * narrower and vgap < 40

def group_page(segs):
    segs = [s for s in segs if not s["noise"] and s.get("coordinates")]
    parent = list(range(len(segs)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            if _together(segs[i], segs[j]): parent[find(i)] = find(j)
    comps = {}
    for i, s in enumerate(segs): comps.setdefault(find(i), []).append(s)
    groups = list(comps.values())
    def union_box(g):
        bs = [_box(s) for s in g]; return (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))
    def center(g):
        b = union_box(g); return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    # merge small components into the nearest larger one
    small = [g for g in groups if len(g) < 2 or (union_box(g)[2] - union_box(g)[0]) < 150]
    big = [g for g in groups if g not in small]
    for g in small:
        if not big: big.append(g); continue
        cx, cy = center(g)
        nearest = min(big, key=lambda h: (center(h)[0] - cx) ** 2 + (center(h)[1] - cy) ** 2)
        nearest.extend(g)
    return big


_TOTAL_KW = re.compile(r"(total|net|grand|purchase amount|amount|الإجمالي|إجمالي|الصافي|المجموع|المبلغ|مبلغ الشراء)", re.I)
_APPROVAL = re.compile(r"approval[^\d]{0,20}(\d{5,8})", re.I)
_INVOICE = re.compile(r"(?:inv(?:oice)?\.?\s*(?:no|#|num|رقم)?[.:\s]*|رقم الفاتورة[:\s]*|bill no\.?[:\s]*)([A-Z0-9][A-Z0-9\-/]{3,})", re.I)

def derive_fields(text, segs):
    t = ascii_digits(text)
    amounts, seen = [], set()
    for m in re.finditer(r"(?<![\d.])(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?!\d)", t):
        v = float(m.group(1).replace(",", ""))
        if v in seen: continue
        seen.add(v)
        before = t[max(0, m.start() - 40):m.start()]
        amounts.append({"value": v, "total_candidate": bool(_TOTAL_KW.search(before))})
    heads = [s["text"].split("\n")[0][:60] for s in segs if s.get("type") in ("title", "header") and s["text"]]
    first = text.strip().split("\n")[0][:60] if text.strip() else ""
    merchants = list(dict.fromkeys([h for h in heads if h] + ([first] if first else [])))
    ap = _APPROVAL.search(t); inv = _INVOICE.search(t)
    return {"amounts": amounts, "dates": list(dict.fromkeys(find_dates(t))), "merchant_candidates": merchants,
            "approval_code": ap.group(1) if ap else None, "invoice_no": inv.group(1) if inv else None}


_CONT = re.compile(r"(page\s*\d+\s*of\s*\d+|continued|تابع)", re.I)

def build_groups(segments):
    by_page = {}
    for s in segments:
        p = (s.get("coordinates") or {}).get("pageNumber")
        if p: by_page.setdefault(p, []).append(s)
    groups = []
    for page in sorted(by_page):
        for n, g in enumerate(sorted(group_page(by_page[page]), key=lambda g: (min(_box(s)[0] for s in g), min(_box(s)[1] for s in g))), 1):
            bs = [_box(s) for s in g]
            text = "\n".join(s["text"] for s in sorted(g, key=lambda s: (_box(s)[1], _box(s)[0])) if s["text"])
            groups.append({"id": f"p{page:02d}-g{n}", "page": page, "pages": [page],
                           "box": [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)],
                           "segment_ids": [s["id"] for s in g], "text": text, **derive_fields(text, g)})
    # cross-page merge: continuation marker or same invoice_no as a group on the previous page
    merged = []
    for g in groups:
        prev = [h for h in merged if h["pages"][-1] == g["page"] - 1]
        target = None
        if prev and (_CONT.search(g["text"]) or (g["invoice_no"] and any(h["invoice_no"] == g["invoice_no"] for h in prev))):
            target = next((h for h in prev if h["invoice_no"] == g["invoice_no"]), prev[-1])
        if target:
            target["pages"].append(g["page"]); target["segment_ids"] += g["segment_ids"]; target["text"] += "\n" + g["text"]
            target.update(derive_fields(target["text"], []))
            target["merchant_candidates"] = target["merchant_candidates"] or g["merchant_candidates"]
        else:
            merged.append(g)
    return merged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: five `ok` lines. If `test_clean_and_group` fails on the ids, print the groups — the `_together` thresholds (0.4, 40) are the spec's; the fixture is built to respect them.

- [ ] **Step 5: Commit**

```bash
git add scripts/abujhd/a_refine.py scripts/abujhd/test_refine.py
git commit -m "abujhd: clean segments and group them into receipts by geometry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Link groups to statement rows and detect broken groups

**Files:**
- Modify: `scripts/abujhd/a_refine.py`
- Test: `scripts/abujhd/test_refine.py`

**Interfaces:**
- Produces:
  - `link_candidates(group, statement_rows) -> list[str]` — refs of purchase rows with equal amount and date within ±1 day of any group date (date check skipped when the group has no dates)
  - `broken_rules(group, segs) -> list[str]` — subset of `["unlinked_no_total", "no_date", "conflicting_totals", "garbage", "bad_table"]`
  - `garbage_rate(text) -> float`

- [ ] **Step 1: Write the failing test**

```python
# append to test_refine.py
from a_refine import link_candidates, broken_rules, garbage_rate

ROWS = [{"ref": "A", "amount": 41.0, "date": "2026-09-01", "kind": "purchase"},
        {"ref": "B", "amount": 41.0, "date": "2026-09-05", "kind": "purchase"},
        {"ref": "L", "amount": 41.0, "date": "2026-09-01", "kind": "load"}]

def test_link_and_broken():
    g = {"amounts": [{"value": 41.0, "total_candidate": True}], "dates": ["2026-09-02"], "text": "Net 41.00 01/09/2026"}
    assert link_candidates(g, ROWS) == ["A"]
    g2 = {"amounts": [{"value": 41.0, "total_candidate": True}], "dates": [], "text": "x"}
    assert link_candidates(g2, ROWS) == ["A", "B"]
    assert broken_rules({"amounts": [], "dates": [], "candidates": [], "text": "hello"}, []) == ["unlinked_no_total", "no_date"]
    assert broken_rules({"amounts": [{"value": 1, "total_candidate": True}, {"value": 2, "total_candidate": True}], "dates": ["2026-09-01"], "candidates": ["A"], "text": "ok"}, []) == ["conflicting_totals"]
    assert garbage_rate("���� ���") > 0.3 and garbage_rate("Total 41.00") == 0.0
    assert broken_rules({"amounts": [{"value": 1, "total_candidate": True}], "dates": ["2026-09-01"], "candidates": ["A"], "text": "ok"},
                        [{"type": "table", "cellsSource": "grid-estimate"}]) == ["bad_table"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: `ImportError: cannot import name 'link_candidates'`

- [ ] **Step 3: Add link and broken detection**

```python
# a_refine.py
from datetime import date as _date

def _days(a, b):
    return abs((_date.fromisoformat(a) - _date.fromisoformat(b)).days)

def link_candidates(group, rows):
    values = {a["value"] for a in group["amounts"]}
    out = []
    for r in rows:
        if r["kind"] != "purchase" or r["amount"] not in values: continue
        if group["dates"] and not any(_days(d, r["date"]) <= 1 for d in group["dates"]): continue
        out.append(r["ref"])
    return out

def garbage_rate(text):
    if not text: return 1.0
    bad = sum(1 for ch in text if ch == "�" or (ord(ch) < 32 and ch not in "\n\t") or 0xE000 <= ord(ch) <= 0xF8FF)
    return bad / max(1, len(text))

def broken_rules(group, segs):
    rules = []
    totals = [a for a in group["amounts"] if a["total_candidate"]]
    if not group["candidates"] and not totals: rules.append("unlinked_no_total")
    if not group["dates"]: rules.append("no_date")
    if len({a["value"] for a in totals}) > 1: rules.append("conflicting_totals")
    if garbage_rate(group["text"]) > 0.3: rules.append("garbage")
    if any(s.get("type") == "table" and (s.get("cellsSource") == "grid-estimate" or s.get("contentStatus") not in (None, "ok")) for s in segs):
        rules.append("bad_table")
    return rules
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: six `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/abujhd/a_refine.py scripts/abujhd/test_refine.py
git commit -m "abujhd: link groups to statement rows and flag broken groups

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `healer.py` — OpenAI Luna and Claude Sonnet backends with cache

**Files:**
- Create: `scripts/abujhd/healer.py`

**Interfaces:**
- Consumes: `common.env`, `common.CACHE`
- Produces: `heal(group: dict, segs: list[dict], crop_png: bytes, backend: str) -> dict` returning
  `{"segments": [{"id", "text"}], "fields": {merchant, date, time, total, vat, card_slip_amount, approval_code, invoice_no, currency, kind}, "confidence": float, "notes": str}`; raises `RuntimeError` with the API message on failure. Cached on disk under `CACHE/<sha256>.json`.

- [ ] **Step 1: Write `healer.py`**

```python
# scripts/abujhd/healer.py
"""Pluggable healer: shows one broken group (crop + its segments) to a vision model and gets corrected text per segment id plus structured fields."""
import base64, hashlib, json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import requests
import common

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["segments", "fields", "confidence", "notes"],
    "properties": {
        "segments": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                     "required": ["id", "text"], "properties": {"id": {"type": "string"}, "text": {"type": "string"}}}},
        "fields": {"type": "object", "additionalProperties": False,
                   "required": ["merchant", "date", "time", "total", "vat", "card_slip_amount", "approval_code", "invoice_no", "currency", "kind"],
                   "properties": {
                       "merchant": {"type": ["string", "null"]}, "date": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
                       "time": {"type": ["string", "null"]}, "total": {"type": ["number", "null"]}, "vat": {"type": ["number", "null"]},
                       "card_slip_amount": {"type": ["number", "null"]}, "approval_code": {"type": ["string", "null"]},
                       "invoice_no": {"type": ["string", "null"]}, "currency": {"type": ["string", "null"]},
                       "kind": {"type": "string", "enum": ["receipt", "invoice", "card_slip", "other"]}}},
        "confidence": {"type": "number"}, "notes": {"type": "string"},
    },
}

PROMPT = """You are correcting OCR output for one scanned petty-cash document from Saudi Arabia (Arabic and English, amounts in SAR).
You get the crop image of the document (page {page}) and the OCR segments found inside it, each with an id, type, bounding box (1000x1000 page space) and the OCR text.
Return, for EVERY segment id given, the corrected text as it actually reads in the image (keep ids, add none, keep Arabic as Arabic, write digits as ASCII 0-9).
Then fill the structured fields from the image: merchant name, document date (YYYY-MM-DD, day-first when ambiguous), time, grand total, VAT, the amount printed on a card/POS slip if one is present, the approval code, invoice number, currency, and kind.
If the crop seems to contain more than one document, say so in notes and fill the fields for the largest one.
confidence is 0-1 for the fields. The image wins over the OCR text.

Segments:
{segments}"""


def _key(crop_png, segs):
    h = hashlib.sha256(crop_png)
    h.update(json.dumps([(s["id"], s["text"]) for s in segs], ensure_ascii=False).encode())
    return h.hexdigest()


def _prompt(group, segs):
    return PROMPT.format(page=group["page"], segments=json.dumps(
        [{"id": s["id"], "type": s.get("type"), "bbox": list(map(int, (s["coordinates"]["xmin"], s["coordinates"]["ymin"], s["coordinates"]["xmax"], s["coordinates"]["ymax"]))), "text": s["text"]} for s in segs],
        ensure_ascii=False, indent=0))


def _openai(prompt, crop_png):
    key = common.env("OPENAI_API_KEY"); assert key, "OPENAI_API_KEY missing"
    body = {
        "model": "gpt-5.6-luna",
        "input": [{"role": "user", "content": [
            {"type": "input_image", "image_url": "data:image/png;base64," + base64.b64encode(crop_png).decode()},
            {"type": "input_text", "text": prompt}]}],
        "text": {"format": {"type": "json_schema", "name": "healed_group", "schema": SCHEMA, "strict": True}},
    }
    r = requests.post("https://api.openai.com/v1/responses", json=body, timeout=180,
                      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    if r.status_code != 200:
        raise RuntimeError(f"openai {r.status_code}: {r.text[:300]}")
    out = r.json()
    text = out.get("output_text") or next(c["text"] for o in out["output"] if o.get("type") == "message" for c in o["content"] if c.get("type") == "output_text")
    return json.loads(text)


def _claude(prompt, crop_png):
    import anthropic
    client = anthropic.Anthropic(api_key=common.env("ANTHROPIC_API_KEY"))
    resp = client.messages.create(
        model="claude-sonnet-5-5", max_tokens=16000,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.standard_b64encode(crop_png).decode()}},
            {"type": "text", "text": prompt}]}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError(f"claude refusal: {resp.stop_details}")
    return json.loads(next(b.text for b in resp.content if b.type == "text"))


BACKENDS = {"openai": _openai, "claude": _claude}


def heal(group, segs, crop_png, backend):
    cache = common.CACHE / f"{backend}-{_key(crop_png, segs)}.json"
    if cache.exists():
        return common.load_json(cache)
    result = BACKENDS[backend](_prompt(group, segs), crop_png)
    common.save_json(cache, result)
    return result
```

- [ ] **Step 2: Smoke-test the OpenAI backend on one real crop**

First make one crop by hand (page 1 of the receipts, left receipt — the stc one):

Run: `pdftoppm -r 150 -f 1 -l 1 -png -singlefile data/abujhd/raw/receipts.bin data/abujhd/pages/page-01 && python3 -c "
from PIL import Image; im=Image.open('data/abujhd/pages/page-01.png'); im.crop((0,0,im.width//3,im.height)).save('data/abujhd/crops/smoke.png')"`

Then:

Run: `python3 -c "
import sys; sys.path.insert(0,'scripts/abujhd'); import common, healer; common.set_data('data/abujhd')
segs=[{'id':'x1','type':'text','coordinates':{'xmin':0,'ymin':0,'xmax':330,'ymax':1000},'text':'stc Ocean Shell Grocery SAWA 57.50 SAR'}]
r=healer.heal({'page':1}, segs, open('data/abujhd/crops/smoke.png','rb').read(), 'openai'); print(r['fields'], r['confidence'])"`
Expected: a dict with `total` or `card_slip_amount` `57.5`, `merchant` mentioning stc / Ocean Shell, confidence > 0.5. A second run returns instantly (cache hit: a file now exists under `data/abujhd/cache/`). If the OpenAI call 400s on the schema, the error text names the field — nullable types are written as `["number","null"]` which the Responses API accepts in strict mode.

- [ ] **Step 3: Smoke-test the Claude backend (only if `ANTHROPIC_API_KEY` is set in `.env.local`)**

Run: same command with `'claude'` in place of `'openai'`.
Expected: same shape. If the key is absent, skip and note it; `--healer openai` is the default.

- [ ] **Step 4: Commit**

```bash
git add scripts/abujhd/healer.py
git commit -m "abujhd: pluggable healer (OpenAI Luna / Claude Sonnet) with on-disk cache

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `a_refine.py` main — orchestration, crops, healing, EDA, outputs; Checkpoint A

**Files:**
- Modify: `scripts/abujhd/a_refine.py`

**Interfaces:**
- Consumes: everything above; `healer.heal`
- Produces on disk: `segments.refined.json`, `groups.json`, `statement.json`, `ledger.json`, `eda.md`, `pages/page-NN.png`, `crops/<group-id>.png`
- CLI: `python3 scripts/abujhd/a_refine.py [--data data/abujhd] [--healer openai|claude|none] [--limit N]`
- `groups.json` group record gains: `candidates: [ref]`, `linkable: bool`, `broken: [rule]`, `fields: dict|None`, `confidence: float|None`, `notes: str|None`, `kind: str|None`, `crop: "crops/<id>.png"`

- [ ] **Step 1: Add render, crop, apply-heal, EDA and `main`**

```python
# a_refine.py — orchestration
def render_pages(pdf, n_pages):
    if not (common.PAGES / f"page-{n_pages:02d}.png").exists():
        subprocess.run(["pdftoppm", "-r", "150", "-png", str(pdf), str(common.PAGES / "page")], check=True)
        # pdftoppm pads page numbers to the digit count of the last page (page-01.png … page-87.png)

def crop_group(g):
    path = common.CROPS / f"{g['id']}.png"
    if path.exists():
        return path.read_bytes()
    im = Image.open(common.PAGES / f"page-{g['page']:02d}.png")
    W, H = im.size; x0, y0, x1, y1 = g["box"]; pad = 30
    box = (max(0, int(x0 / 1000 * W) - pad), max(0, int(y0 / 1000 * H) - pad), min(W, int(x1 / 1000 * W) + pad), min(H, int(y1 / 1000 * H) + pad))
    im.crop(box).save(path)
    return path.read_bytes()

def apply_heal(g, segs_by_id, result, backend):
    for s in result.get("segments", []):
        seg = segs_by_id.get(s["id"])
        if seg is not None and s["text"] and s["text"] != seg["text"]:
            seg["text"] = s["text"]; seg["healed"] = True; seg["healer"] = backend
    f = result.get("fields") or {}
    g["fields"] = f; g["confidence"] = result.get("confidence"); g["notes"] = result.get("notes"); g["kind"] = f.get("kind")
    # re-derive from healed text, then let healed fields override the key values
    g["text"] = "\n".join(segs_by_id[i]["text"] for i in g["segment_ids"] if i in segs_by_id and segs_by_id[i]["text"])
    g.update(derive_fields(g["text"], [segs_by_id[i] for i in g["segment_ids"] if i in segs_by_id]))
    for v in (f.get("total"), f.get("card_slip_amount")):
        if v is not None and all(a["value"] != round(v, 2) for a in g["amounts"]):
            g["amounts"].append({"value": round(v, 2), "total_candidate": True})
    if f.get("date") and f["date"] not in g["dates"]: g["dates"].insert(0, f["date"])
    if f.get("merchant"): g["merchant_candidates"] = [f["merchant"]] + [m for m in g["merchant_candidates"] if m != f["merchant"]]
    g["approval_code"] = f.get("approval_code") or g["approval_code"]; g["invoice_no"] = f.get("invoice_no") or g["invoice_no"]


def write_eda(path, statement, ledger, groups, segs, healed_n, backend):
    import collections
    L = ["# EDA — ABUJHD September 2026", ""]
    kinds = collections.Counter(r["kind"] for r in statement)
    L += ["## Statement", f"- rows: {len(statement)} — " + ", ".join(f"{k}: {v} (sum {sum(r['amount'] for r in statement if r['kind']==k):,.2f})" for k, v in kinds.items()),
          f"- dates: {min(r['date'] for r in statement)} … {max(r['date'] for r in statement)}; orange rows: {sum(r['orange'] for r in statement)}", ""]
    sep = [r for r in ledger if r["month"] == "2026-09"]
    L += ["## Ledger (September)"] + [f"- {r['code']} {r['date']} D {r['debit'] or ''} C {r['credit'] or ''} — {r['text'][:70]}" for r in sep] + [""]
    per_page = collections.Counter(g["page"] for g in groups)
    pages = sorted({(s.get('coordinates') or {}).get('pageNumber') for s in segs if s.get('coordinates')} - {None})
    L += ["## Receipts", f"- segments: {len(segs)}; noise: {sum(s['noise'] for s in segs)}; garbage>30%: {sum(garbage_rate(s['text'])>0.3 for s in segs if not s['noise'])}",
          f"- groups: {len(groups)} over {len(pages)} pages; groups/page histogram: {dict(sorted(collections.Counter(per_page[p] for p in pages).items()))}",
          f"- pages with 0 groups: {[p for p in pages if per_page[p]==0]}",
          f"- linkable groups: {sum(g['linkable'] for g in groups)}; unlinked: {sum(not g['linkable'] for g in groups)}",
          f"- broken rules: {dict(collections.Counter(r for g in groups for r in g['broken']))}",
          f"- healed groups: {healed_n} (healer: {backend}); confidence histogram: {dict(sorted(collections.Counter(round(g['confidence'] or 0, 1) for g in groups if g['fields']).items()))}",
          f"- same-day duplicate amounts in statement (ambiguity risk): {sum(v>1 for v in collections.Counter((r['date'], r['amount']) for r in statement if r['kind']=='purchase').values())}", ""]
    pathlib.Path(path).write_text("\n".join(L), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/abujhd"); ap.add_argument("--healer", default="openai", choices=["openai", "claude", "none"])
    ap.add_argument("--limit", type=int, default=None, help="heal at most N broken groups (smoke runs)")
    a = ap.parse_args(); common.set_data(a.data); common.ensure_raw()
    overrides = load_json(common.DATA / "overrides.json") if (common.DATA / "overrides.json").exists() else {}

    statement = build_statement(common.RAW / "statement.bin")
    ledger = parse_ledger(load_json(common.RAW / "ledger.segments.json"))
    raw_segs = load_json(common.RAW / "receipts.segments.json")
    raw_segs = raw_segs.get("segments") if isinstance(raw_segs, dict) else raw_segs
    segs = [clean_segment(s) for s in raw_segs]
    segs_by_id = {s["id"]: s for s in segs}
    groups = build_groups(segs)
    for g in groups:
        g["candidates"] = link_candidates(g, statement); g["linkable"] = bool(g["candidates"])
        g["broken"] = broken_rules(g, [segs_by_id[i] for i in g["segment_ids"]])
        g.update({"fields": None, "confidence": None, "notes": None, "kind": None, "crop": f"crops/{g['id']}.png"})

    n_pages = max(g["page"] for g in groups)
    render_pages(common.RAW / "receipts.bin", n_pages)
    healed = 0
    if a.healer != "none":
        import healer
        todo = [g for g in groups if g["broken"]][: a.limit]
        for i, g in enumerate(todo, 1):
            try:
                res = healer.heal(g, [segs_by_id[j] for j in g["segment_ids"]], crop_group(g), a.healer)
                apply_heal(g, segs_by_id, res, a.healer); healed += 1
                g["candidates"] = link_candidates(g, statement); g["linkable"] = bool(g["candidates"])
            except Exception as e:
                g["notes"] = f"heal failed: {e}"
            print(f"heal {i}/{len(todo)} {g['id']} {g['broken']} -> {g.get('fields') and g['fields'].get('total')}", file=sys.stderr)
    for gid, fix in (overrides.get("groups") or {}).items():
        g = next((g for g in groups if g["id"] == gid), None)
        if g: g["fields"] = {**(g["fields"] or {}), **fix}; g["notes"] = (g["notes"] or "") + " [override]"
    for g in groups: crop_group(g)   # every group gets a crop for the report

    save_json(common.DATA / "statement.json", statement); save_json(common.DATA / "ledger.json", ledger)
    save_json(common.DATA / "segments.refined.json", segs); save_json(common.DATA / "groups.json", groups)
    write_eda(common.DATA / "eda.md", statement, ledger, groups, segs, healed, a.healer)
    print(f"statement {len(statement)} rows, ledger {len(ledger)} rows, groups {len(groups)}, broken {sum(bool(g['broken']) for g in groups)}, healed {healed}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Dry run without healing**

Run: `python3 scripts/abujhd/a_refine.py --healer none`
Expected: last line like `statement 129 rows, ledger 82 rows, groups ~150-260, broken N, healed 0`; `data/abujhd/eda.md` exists; `data/abujhd/crops/` has one PNG per group; `pages/page-01.png … page-87.png` exist. Read `eda.md`: if groups/page is mostly 1 with a long tail, grouping is sane; if most pages have ≥ 6 groups, the vertical gap threshold (40) is too tight — raise to 60 in `_together` and re-run (note the change in the commit).

- [ ] **Step 3: Heal a sample, then everything**

Run: `python3 scripts/abujhd/a_refine.py --healer openai --limit 5`
Expected: 5 `heal i/5 …` lines on stderr, each ending with a number (the healed total) or `None`; no `heal failed`. Then:

Run: `python3 scripts/abujhd/a_refine.py --healer openai`
Expected: all broken groups healed (cache makes the first 5 instant). Re-running is instant.

- [ ] **Step 4: Run tests and commit**

Run: `python3 scripts/abujhd/test_refine.py`
Expected: six `ok` lines.

```bash
git add scripts/abujhd/a_refine.py
git commit -m "abujhd: a_refine main — crops, healing, EDA, outputs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: CHECKPOINT A (human)**

Show the user `data/abujhd/eda.md`, the count of healed groups, a before/after text diff for 5 healed groups (`raw` vs `text` of their segments), and the crops of the 10 lowest-`confidence` healed groups (read the PNGs). Ask: OK to proceed to matching, or corrections? Corrections go to `data/abujhd/overrides.json` as `{"groups": {"<id>": {"total": 41.0, "date": "2026-09-01"}}}` and A is re-run (`--healer openai`, instant via cache).

---

### Task 8: `b_match.py` — collapse, score, greedy 1:1, overrides

**Files:**
- Create: `scripts/abujhd/b_match.py`
- Create: `scripts/abujhd/test_match.py`

**Interfaces:**
- Consumes: `groups.json` records (`id, page, pages, amounts, dates, merchant_candidates, fields, kind, notes, candidates`), `statement.json` rows (`ref, amount, date, merchant, kind`)
- Produces:
  - `norm_merchant(s: str) -> set[str]` — lowercase ASCII tokens ≥ 3 chars, Arabic kept, alias map applied (`ajmy→ajmi`, `asdaf→اسواق`, `masdar`…)
  - `receipt_amounts(g) -> set[float]` — healed `total`/`card_slip_amount` if present, else `total_candidate` values, else all amounts
  - `collapse_card_slips(groups) -> list[dict]` — merges a `card_slip` group into a same-amount receipt/invoice on the same or previous page (`boxes` list, `ids` list)
  - `score(g, row) -> int` — amount 3 (required), date same day 2 / ±1 day 1 / else 0, merchant overlap 0–2
  - `match_receipts(groups, rows, overrides) -> (links: dict[gid, ref|None], review: dict[gid, list[(ref, score)]])` — greedy 1:1, score < 4 or tie → review
  
- [ ] **Step 1: Write the failing test**

```python
# scripts/abujhd/test_match.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from b_match import norm_merchant, receipt_amounts, collapse_card_slips, score, match_receipts

def G(id, page, amounts, dates, merchant, kind="receipt", fields=None, notes=None):
    return {"id": id, "page": page, "pages": [page], "amounts": [{"value": a, "total_candidate": True} for a in amounts],
            "dates": dates, "merchant_candidates": [merchant], "fields": fields, "kind": kind, "notes": notes, "candidates": []}

def R(ref, amount, date, merchant, kind="purchase"):
    return {"ref": ref, "amount": amount, "date": date, "merchant": merchant, "kind": kind}

ROWS = [R("r1", 41.0, "2026-09-01", "MAZA RESTALAYOUNAL AHSASAU"),
        R("r2", 218.5, "2026-09-02", "AL FARES HOLDING COH alhazmMUBARRASAU"),
        R("r3", 50.0, "2026-09-10", "GREEN STAR FUEL STATIONALHASA"),
        R("r4", 50.0, "2026-09-10", "GREEN STAR FUEL STATIONALHASA"),
        R("r5", 9.0, "2026-09-20", "ASDAF ALMUHITAl Oyoun"),
        R("l1", 3000.0, "2026-09-01", "FROM0000", kind="load")]

def test_scoring_and_greedy():
    assert norm_merchant("Ibrahim A. Al-Fares & Bros.") >= {"ibrahim", "fares", "bros"}
    assert "ajmi" in norm_merchant("AJMY COMPANY")
    exact = G("g1", 1, [41.0], ["2026-09-01"], "MAZA REST")              # exact + same day + merchant → MATCHED
    near = G("g2", 2, [218.5], ["2026-09-01"], "Ibrahim A. Al-Fares")    # ±1 day
    tie_a = G("g3", 3, [50.0], ["2026-09-10"], "Green Star")             # two identical rows → REVIEW
    orphan = G("g4", 4, [99.0], ["2026-09-03"], "Nobody")                # no row
    weak = G("g5", 5, [9.0], [], "xyz")                                  # amount only → score 3 → REVIEW
    assert score(exact, ROWS[0]) >= 6 and score(near, ROWS[1]) >= 4 and score(weak, ROWS[4]) == 3
    links, review = match_receipts([exact, near, tie_a, orphan, weak], ROWS, {})
    assert links["g1"] == "r1" and links["g2"] == "r2" and links["g4"] is None
    assert "g3" in review and {r for r, _ in review["g3"]} == {"r3", "r4"} and links["g3"] is None
    assert "g5" in review
    links2, _ = match_receipts([exact, near, tie_a, orphan, weak], ROWS, {"links": {"g3": "r4", "g1": None}})
    assert links2["g3"] == "r4" and links2["g1"] is None

def test_collapse_and_amounts():
    inv = G("g1", 2, [218.5, 190.0], ["2026-09-01"], "Al-Fares", kind="invoice")
    slip = G("g2", 2, [218.5], ["2026-09-01"], "Al-Fares", kind="card_slip")
    out = collapse_card_slips([inv, slip])
    assert len(out) == 1 and out[0]["ids"] == ["g1", "g2"]
    healed = G("g9", 9, [1.0, 2.0], [], "x", fields={"total": 773.0, "card_slip_amount": None})
    assert receipt_amounts(healed) == {773.0}
    assert receipt_amounts(G("g8", 8, [5.0], [], "x")) == {5.0}

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_match.py`
Expected: `ModuleNotFoundError: No module named 'b_match'`

- [ ] **Step 3: Write the matching half of `b_match.py`**

```python
# scripts/abujhd/b_match.py
"""Step B: key relation + gap analysis. Pure functions over Step A's JSON. No network."""
import argparse, re, sys, pathlib, unicodedata
from datetime import date as _date
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import common
from common import load_json, save_json

ALIASES = {"ajmy": "ajmi", "ajmi": "ajmi", "asdaf": "اسواق", "اسواق": "اسواق", "أسواق": "اسواق", "masdarusa": "masdar", "masdarman": "masdar", "masdarjana": "masdar",
           "almuhitai": "almuhit", "muhit": "almuhit", "alfares": "fares", "al-fares": "fares"}
STOP = {"company", "co", "est", "trading", "ltd", "llc", "the", "and", "for", "شركة", "مؤسسة", "للتجارة", "التجارية", "sau", "ahsasau", "ahsa", "riyadh"}

def norm_merchant(s):
    s = unicodedata.normalize("NFKC", s or "").lower().replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    toks = set()
    for t in re.split(r"[^a-z0-9؀-ۿ]+", s):
        if len(t) < 3 or t in STOP: continue
        t = ALIASES.get(t, t)
        toks.add(t)
        # ALHASA SOUTHAL AHSASAU style run-ons: also add 5-char prefixes so "fuelhfof" still meets "fuel"
        if len(t) > 6: toks.add(t[:5])
    return toks

def receipt_amounts(g):
    f = g.get("fields") or {}
    healed = {round(v, 2) for v in (f.get("total"), f.get("card_slip_amount")) if isinstance(v, (int, float))}
    if healed: return healed
    totals = {a["value"] for a in g["amounts"] if a["total_candidate"]}
    return totals or {a["value"] for a in g["amounts"]}

def _dates(g):
    f = g.get("fields") or {}
    return ([f["date"]] if f.get("date") else []) + [d for d in g["dates"] if d != f.get("date")]

def _merchants(g):
    f = g.get("fields") or {}
    return ([f["merchant"]] if f.get("merchant") else []) + g["merchant_candidates"]

def collapse_card_slips(groups):
    """A card_slip group joins a same-amount receipt/invoice on the same or previous page (merchant must agree when the slip names one)."""
    out, used = [], set()
    for g in groups:
        if g["id"] in used: continue
        rec = {**g, "ids": [g["id"]], "boxes": [(g["page"], g.get("box"))]}
        if g.get("kind") != "card_slip":
            for s in groups:
                if s.get("kind") != "card_slip" or s["id"] in used or s["page"] not in (g["page"], g["page"] + 1): continue
                if not (receipt_amounts(s) & receipt_amounts(g)): continue
                if _merchants(s) and not (norm_merchant(" ".join(_merchants(s))) & norm_merchant(" ".join(_merchants(g)))): continue
                used.add(s["id"]); rec["ids"].append(s["id"]); rec["boxes"].append((s["page"], s.get("box")))
                rec["fields"] = {**(rec.get("fields") or {}), "card_slip_amount": next(iter(receipt_amounts(s) & receipt_amounts(g)))}
        used.add(g["id"]); out.append(rec)
    return out

def _days(a, b):
    try: return abs((_date.fromisoformat(a) - _date.fromisoformat(b)).days)
    except Exception: return 99

def score(g, row):
    if row["kind"] != "purchase" or row["amount"] not in receipt_amounts(g): return 0
    s = 3
    ds = [_days(d, row["date"]) for d in _dates(g)]
    s += 2 if 0 in ds else 1 if 1 in ds else 0
    overlap = norm_merchant(" ".join(_merchants(g))) & norm_merchant(row["merchant"])
    s += min(2, len(overlap))
    return s

def match_receipts(groups, rows, overrides):
    forced = (overrides or {}).get("links") or {}
    links, review, taken = {}, {}, set()
    for gid, ref in forced.items():
        links[gid] = ref
        if ref: taken.add(ref)
    cands = []
    for g in groups:
        if g["id"] in forced: continue
        scored = sorted(((score(g, r), r["ref"]) for r in rows if score(g, r) > 0), reverse=True)
        cands.append((g["id"], scored))
    # greedy from the best score overall
    pending = {gid: scored for gid, scored in cands}
    while pending:
        gid, scored = max(pending.items(), key=lambda kv: (kv[1][0][0] if kv[1] else -1))
        scored = [(s, r) for s, r in scored if r not in taken]
        if not scored: links[gid] = None
        elif scored[0][0] < 4 or (len(scored) > 1 and scored[1][0] == scored[0][0]):
            links[gid] = None; review[gid] = [(r, s) for s, r in scored[:3]]
        else:
            links[gid] = scored[0][1]; taken.add(scored[0][1])
        del pending[gid]
    return links, review
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/abujhd/test_match.py`
Expected: `ok test_scoring_and_greedy`, `ok test_collapse_and_amounts`.

- [ ] **Step 5: Commit**

```bash
git add scripts/abujhd/b_match.py scripts/abujhd/test_match.py
git commit -m "abujhd: receipt→statement matching with greedy 1:1 and overrides

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `b_match.py` — ledger tie-out, statuses, `matches.json`; Checkpoint B

**Files:**
- Modify: `scripts/abujhd/b_match.py`
- Test: `scripts/abujhd/test_match.py`

**Interfaces:**
- Produces:
  - `tie_out_ledger(statement, ledger) -> dict` with `loads_vs_topups`, `atm_vs_withdrawals`, `purchases_vs_rollup`, `small_credits`, and `ledger_status: {code+text: "TIED"|"UNEXPLAINED"}`
  - `assign_statuses(statement, groups, links, review) -> (rows, receipts)` — statement rows get `status` ∈ `MATCHED | MISSING_RECEIPT | AMOUNT_MISMATCH | REVIEW | TIED | UNEXPLAINED`, `receipt_ids`, `reason`; receipts get `status` ∈ `LINKED | ORPHAN | REVIEW`, `ref`, `reason`
  - `matches.json`: `{rows, receipts, ledger, tieout, orange_vs_status, summary}`

- [ ] **Step 1: Write the failing test**

```python
# append to test_match.py
from b_match import tie_out_ledger, assign_statuses

def test_tieout_and_statuses():
    stmt = [R("p1", 41.0, "2026-09-01", "MAZA"), R("p2", 9.0, "2026-09-02", "ASDAF"), R("a1", 500.0, "2026-09-03", "BANKX", kind="atm"), R("l1", 3000.0, "2026-09-01", "FROM", kind="load")]
    for r in stmt: r["orange"] = r["ref"] == "p2"
    ledger = [{"code": "MISC/2026/09/0020", "date": "2026-09-01", "text": "Top up", "debit": 3000.0, "credit": None, "month": "2026-09"},
              {"code": "MISC/2026/09/0008", "date": "2026-09-13", "text": "Top up", "debit": 3000.0, "credit": None, "month": "2026-09"},
              {"code": "MISC/2026/09/0031", "date": "2026-09-30", "text": "Petty Cash for SEP", "debit": None, "credit": 1600.0, "month": "2026-09"},
              {"code": "MISC/2026/09/0034", "date": "2026-09-01", "text": "against INV", "debit": None, "credit": 9.0, "month": "2026-09"}]
    t = tie_out_ledger(stmt, ledger)
    assert t["loads_vs_topups"]["statement"] == 3000.0 and t["loads_vs_topups"]["ledger"] == 6000.0 and t["loads_vs_topups"]["diff"] == -3000.0
    assert t["purchases_vs_rollup"]["statement"] == 550.0 and t["purchases_vs_rollup"]["ledger"] == 1600.0 and t["purchases_vs_rollup"]["diff"] == -1050.0
    assert t["ledger_status"]["MISC/2026/09/0020|Top up"] == "TIED" and t["ledger_status"]["MISC/2026/09/0008|Top up"] == "UNEXPLAINED"
    assert t["small_credits"][0]["ref"] == "p2"
    groups = [G("g1", 1, [41.0], ["2026-09-01"], "MAZA"), G("g2", 2, [77.0], [], "x"), G("g3", 3, [9.0], [], "y")]
    rows, receipts = assign_statuses(stmt, groups, {"g1": "p1", "g2": None, "g3": None}, {"g3": [("p2", 3)]})
    st = {r["ref"]: r["status"] for r in rows}
    assert st == {"p1": "MATCHED", "p2": "REVIEW", "a1": "TIED", "l1": "TIED"}
    rc = {r["id"]: r["status"] for r in receipts}
    assert rc == {"g1": "LINKED", "g2": "ORPHAN", "g3": "REVIEW"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/abujhd/test_match.py`
Expected: `ImportError: cannot import name 'tie_out_ledger'`

- [ ] **Step 3: Add tie-out, statuses and `main`**

```python
# b_match.py — ledger tie-out, statuses, main
def _r2(x): return round(x, 2)

def tie_out_ledger(statement, ledger, month="2026-09"):
    led = [l for l in ledger if l["month"] == month]
    loads = [r for r in statement if r["kind"] == "load"]; atm = [r for r in statement if r["kind"] == "atm"]; purch = [r for r in statement if r["kind"] == "purchase"]
    topups = [l for l in led if l["debit"] and re.search(r"top ?up|payment to|reconciliation - top", l["text"], re.I)]
    withdrawals = [l for l in led if l["credit"] and re.search(r"cash withdrawal", l["text"], re.I)]
    rollup = [l for l in led if l["credit"] and re.search(r"petty cash for|petty cash expenses", l["text"], re.I) and l["credit"] > 1000]
    small = [l for l in led if l["credit"] and l not in rollup and l not in withdrawals]
    status = {}
    used = set()
    for l in topups:
        hit = next((r for r in loads if r["ref"] not in used and r["amount"] == l["debit"] and _days(r["date"], l["date"]) <= 2), None)
        if hit: used.add(hit["ref"])
        status[f"{l['code']}|{l['text']}"] = "TIED" if hit else "UNEXPLAINED"
    for l in withdrawals:
        status[f"{l['code']}|{l['text']}"] = "TIED" if any(r["amount"] == l["credit"] for r in atm) else "UNEXPLAINED"
    for l in rollup:
        status[f"{l['code']}|{l['text']}"] = "TIED" if _r2(sum(r["amount"] for r in purch + atm)) == _r2(l["credit"]) else "UNEXPLAINED"
    small_credits = []
    for l in small:
        hit = next((r for r in purch if r["amount"] == l["credit"]), None)
        small_credits.append({"code": l["code"], "text": l["text"], "credit": l["credit"], "ref": hit["ref"] if hit else None})
        status[f"{l['code']}|{l['text']}"] = "TIED" if hit else "UNEXPLAINED"
    S = lambda rows, k: _r2(sum(r[k] or 0 for r in rows))
    return {
        "loads_vs_topups": {"statement": S(loads, "amount"), "ledger": S(topups, "debit"), "diff": _r2(S(loads, "amount") - S(topups, "debit")), "n_statement": len(loads), "n_ledger": len(topups)},
        "atm_vs_withdrawals": {"statement": S(atm, "amount"), "ledger": S(withdrawals, "credit"), "diff": _r2(S(atm, "amount") - S(withdrawals, "credit"))},
        "purchases_vs_rollup": {"statement": S(purch + atm, "amount"), "purchases_only": S(purch, "amount"), "ledger": S(rollup, "credit"), "diff": _r2(S(purch + atm, "amount") - S(rollup, "credit")), "rollup_codes": [l["code"] for l in rollup]},
        "small_credits": small_credits, "ledger_status": status,
    }

def assign_statuses(statement, groups, links, review):
    by_ref = {}
    for gid, ref in links.items():
        if ref: by_ref.setdefault(ref, []).append(gid)
    review_refs = {r for cands in review.values() for r, _ in cands}
    rows = []
    for r in statement:
        row = {**r, "receipt_ids": by_ref.get(r["ref"], []), "status": None, "reason": ""}
        if r["kind"] != "purchase":
            row["status"] = "TIED"; row["reason"] = "ledger tie-out row (load/ATM), see tieout"
        elif row["receipt_ids"]:
            g = next(g for g in groups if g["id"] == row["receipt_ids"][0])
            mism = r["amount"] not in receipt_amounts(g)
            row["status"] = "AMOUNT_MISMATCH" if mism else "MATCHED"; row["reason"] = f"receipt {row['receipt_ids'][0]} p{g['page']}"
        elif r["ref"] in review_refs:
            row["status"] = "REVIEW"; row["reason"] = "candidate receipts need a human pick"
        else:
            row["status"] = "MISSING_RECEIPT"; row["reason"] = "no receipt with this amount within ±1 day"
        rows.append(row)
    receipts = []
    for g in groups:
        ref = links.get(g["id"])
        st = "LINKED" if ref else "REVIEW" if g["id"] in review else "ORPHAN"
        receipts.append({**g, "ref": ref, "status": st, "review": review.get(g["id"], []),
                         "reason": "linked" if ref else "ambiguous or weak candidates" if st == "REVIEW" else "no statement row with this amount (cash purchase? wrong total?)"})
    return rows, receipts

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/abujhd"); a = ap.parse_args(); common.set_data(a.data)
    statement = load_json(common.DATA / "statement.json"); ledger = load_json(common.DATA / "ledger.json"); groups = load_json(common.DATA / "groups.json")
    overrides = load_json(common.DATA / "overrides.json") if (common.DATA / "overrides.json").exists() else {}
    groups = collapse_card_slips(groups)
    links, review = match_receipts(groups, statement, overrides)
    rows, receipts = assign_statuses(statement, groups, links, review)
    tieout = tie_out_ledger(statement, ledger)
    import collections
    ovs = collections.Counter((r["orange"], r["status"]) for r in rows if r["kind"] == "purchase")
    summary = {"rows": dict(collections.Counter(r["status"] for r in rows)), "receipts": dict(collections.Counter(r["status"] for r in receipts))}
    save_json(common.DATA / "matches.json", {"rows": rows, "receipts": receipts, "ledger": ledger, "tieout": tieout,
                                              "orange_vs_status": {f"{'orange' if o else 'plain'}|{s}": n for (o, s), n in ovs.items()}, "summary": summary})
    print("rows:", summary["rows"]); print("receipts:", summary["receipts"]); print("tieout:", {k: v for k, v in tieout.items() if k != "ledger_status" and k != "small_credits"})
    for gid, cands in review.items(): print("REVIEW", gid, cands)

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests, then the real data**

Run: `python3 scripts/abujhd/test_match.py`
Expected: three `ok` lines.

Run: `python3 scripts/abujhd/b_match.py`
Expected: a `rows:` line with counts over MATCHED / MISSING_RECEIPT / REVIEW / TIED (104 purchases + 25 others), a `receipts:` line, a `tieout:` line showing `purchases_vs_rollup.diff` ≈ `-1981.70` and `loads_vs_topups.diff` ≈ `-3000.0`, then the `REVIEW` list.

- [ ] **Step 5: Commit**

```bash
git add scripts/abujhd/b_match.py scripts/abujhd/test_match.py
git commit -m "abujhd: ledger tie-out, statuses and matches.json

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: CHECKPOINT B (human)**

Show the summary counts, the orange-vs-status cross-tab, the tie-out numbers, and the `REVIEW` list with each candidate's statement line and the receipt crop. The user confirms or writes `overrides.json` `{"links": {"<group-id>": "<ref>" | null}}`; re-run `b_match.py`.

---

### Task 10: `c_report.py` — the whiteboard; Checkpoint C

**Files:**
- Create: `scripts/abujhd/c_report.py`

**Interfaces:**
- Consumes: `matches.json` (`rows, receipts, tieout, orange_vs_status, summary`), crops under `crops/`, pages under `pages/`
- Produces: `data/abujhd/report.html` — self-contained except for relative `crops/` and `pages/` image references

- [ ] **Step 1: Write `c_report.py`**

```python
# scripts/abujhd/c_report.py
"""Step C: whiteboard report. One statement row per line with its evidence; sections for everything a human must fix."""
import argparse, html, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import common
from common import load_json

CSS = """
:root{--bg:#fff;--fg:#111;--mute:#667;--line:#ddd;--chip:#eef;--ok:#1f8a4c;--warn:#b26a00;--bad:#c0392b;--rev:#5b4ac9}
@media(prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8e8e8;--mute:#9aa;--line:#2a2f36;--chip:#1e2430}}
body{margin:0;padding:16px;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.tie{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:12px 0}
.card{border:1px solid var(--line);border-radius:10px;padding:10px 12px}.card b{font-size:18px}.card small{color:var(--mute)}
table{border-collapse:collapse;width:100%}th,td{border-top:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;font-size:13px}
th{color:var(--mute);font-weight:600}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--chip)}
.MATCHED{color:var(--ok)}.TIED{color:var(--ok)}.LINKED{color:var(--ok)}.MISSING_RECEIPT,.ORPHAN,.UNEXPLAINED{color:var(--bad)}.AMOUNT_MISMATCH{color:var(--warn)}.REVIEW{color:var(--rev)}
.thumb{height:64px;border:1px solid var(--line);border-radius:4px;cursor:zoom-in;margin-right:4px}
.orange{background:rgba(255,140,0,.18);padding:0 4px;border-radius:3px;font-size:11px}
#ov{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:20px;z-index:9}
#ov .wrap{position:relative}#ov img{max-width:90vw}#ov .box{position:absolute;border:3px solid #ff3b3b;box-shadow:0 0 0 9999px rgba(0,0,0,.35)}
.mute{color:var(--mute)}.mono{font-family:ui-monospace,monospace;font-size:12px}
"""
JS = """
const ov=document.getElementById('ov');ov.onclick=()=>ov.style.display='none';
document.querySelectorAll('.thumb').forEach(t=>t.onclick=e=>{e.stopPropagation();
 const [x0,y0,x1,y1]=t.dataset.box.split(',').map(Number);const img=ov.querySelector('img');img.src='pages/page-'+t.dataset.page.padStart(2,'0')+'.png';
 img.onload=()=>{const b=ov.querySelector('.box');b.style.left=(x0/1000*img.width)+'px';b.style.top=(y0/1000*img.height)+'px';b.style.width=((x1-x0)/1000*img.width)+'px';b.style.height=((y1-y0)/1000*img.height)+'px'};
 ov.style.display='flex'});
"""

def chip(s): return f'<span class="chip {s}">{s}</span>'
def money(x): return f"{x:,.2f}" if isinstance(x, (int, float)) else ""
def esc(s): return html.escape(str(s or ""))

def thumbs(receipts_by_id, ids):
    out = []
    for i in ids:
        g = receipts_by_id.get(i)
        if not g: continue
        # a collapsed receipt carries one crop id per box (ids[k] ↔ boxes[k])
        for crop_id, (page, box) in zip(g.get("ids") or [g["id"]], g.get("boxes") or [(g["page"], g.get("box"))]):
            if box: out.append(f'<img class="thumb" src="crops/{esc(crop_id)}.png" data-page="{page}" data-box="{",".join(map(str, box))}" title="{esc(crop_id)} p{page}">')
    return "".join(out)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/abujhd"); a = ap.parse_args(); common.set_data(a.data)
    m = load_json(common.DATA / "matches.json")
    rows, receipts, t = m["rows"], m["receipts"], m["tieout"]
    rby = {r["id"]: r for r in receipts}
    for r in receipts:
        for i in r.get("ids", []): rby.setdefault(i, r)
    H = [f"<!doctype html><meta charset=utf-8><title>ABUJHD petty cash — September 2026</title><style>{CSS}</style><body>",
         "<h1>ABUJHD petty cash — September 2026</h1><div class=mute>Statement rows are the key. Every line cites its receipt crop (click to see it on the page), its statement ref and its ledger code.</div>"]
    H.append("<h2>Tie-out</h2><div class=tie>")
    for label, k in (("Card loads vs ledger top-ups", "loads_vs_topups"), ("ATM vs ledger cash withdrawals", "atm_vs_withdrawals"), ("Purchases + ATM vs ledger roll-up", "purchases_vs_rollup")):
        v = t[k]; H.append(f'<div class=card><small>{label}</small><br><b>{money(v["statement"])}</b> statement<br>{money(v["ledger"])} ledger<br><span class="{"MISSING_RECEIPT" if v["diff"] else "MATCHED"}">diff {money(v["diff"])}</span></div>')
    s = m["summary"]["rows"]; H.append('<div class=card><small>Statement rows</small><br>' + "<br>".join(f'{chip(k)} {n}' for k, n in sorted(s.items())) + "</div>")
    s = m["summary"]["receipts"]; H.append('<div class=card><small>Receipts (groups)</small><br>' + "<br>".join(f'{chip(k)} {n}' for k, n in sorted(s.items())) + "</div>")
    H.append('<div class=card><small>Orange highlight vs status</small><br>' + "<br>".join(f'<span class=mono>{esc(k)}</span> {n}' for k, n in sorted(m["orange_vs_status"].items())) + "</div></div>")

    H.append("<h2>Statement</h2><table><tr><th>Status</th><th>Date</th><th class=num>Amount</th><th>Merchant</th><th>Evidence</th><th>Ref / reason</th></tr>")
    for r in sorted(rows, key=lambda r: (r["date"], r["time"])):
        H.append(f'<tr><td>{chip(r["status"])}</td><td class=mono>{r["date"]} {r["time"][:5]}{" <span class=orange>orange</span>" if r["orange"] else ""}</td><td class=num>{money(r["amount"])}</td>'
                 f'<td>{esc(r["merchant"][:48])}<br><span class=mute>{r["kind"]}</span></td><td>{thumbs(rby, r["receipt_ids"])}</td><td class=mono>{esc(r["ref"])}<br><span class=mute>{esc(r["reason"])}</span></td></tr>')
    H.append("</table>")

    def section(title, items, render):
        if not items: return
        H.append(f"<h2>{title} <span class=mute>({len(items)})</span></h2><table>" + "".join(render(i) for i in items) + "</table>")
    section("Missing receipts — find or request the document", [r for r in rows if r["status"] == "MISSING_RECEIPT"],
            lambda r: f'<tr><td class=mono>{r["date"]}</td><td class=num>{money(r["amount"])}</td><td>{esc(r["merchant"])}</td><td class=mono>{esc(r["ref"])}</td><td class=mute>What to check: a receipt dated {r["date"]}±1 for {money(r["amount"])} SAR at this merchant; if paid by card, the POS slip shows the amount.</td></tr>')
    section("Orphan receipts — document with no card transaction", [g for g in receipts if g["status"] == "ORPHAN"],
            lambda g: f'<tr><td>{thumbs(rby, [g["id"]])}</td><td class=mono>p{g["page"]} {esc(g["id"])}</td><td class=num>{", ".join(money(v) for v in sorted({a["value"] for a in g["amounts"]})[:4])}</td><td>{esc((g.get("fields") or {}).get("merchant") or (g["merchant_candidates"] or [""])[0])}</td><td class=mute>What to check: cash purchase (not on the card), wrong total read, or belongs to another month. {esc(g.get("notes") or "")}</td></tr>')
    section("Amount mismatch", [r for r in rows if r["status"] == "AMOUNT_MISMATCH"],
            lambda r: f'<tr><td class=mono>{r["date"]}</td><td class=num>{money(r["amount"])}</td><td>{thumbs(rby, r["receipt_ids"])}</td><td class=mute>Statement and receipt totals differ — check tips, VAT, or a partial card payment.</td></tr>')
    section("Review — pick the right link", [g for g in receipts if g["status"] == "REVIEW"],
            lambda g: f'<tr><td>{thumbs(rby, [g["id"]])}</td><td class=mono>p{g["page"]} {esc(g["id"])}</td><td>' + "<br>".join(f'<span class=mono>{esc(ref)}</span> score {sc}' for ref, sc in g["review"]) + f'</td><td class=mute>{esc(g["reason"])} — set overrides.json links["{esc(g["id"])}"].</td></tr>')
    section("Ledger lines not explained by the statement", [(k, v) for k, v in t["ledger_status"].items() if v == "UNEXPLAINED"],
            lambda kv: f'<tr><td class=mono>{esc(kv[0].split("|")[0])}</td><td>{esc(kv[0].split("|")[1])}</td><td class=mute>No statement row ties to this ledger line (amount/date). Check the bank side or the posting.</td></tr>')
    H.append('<div id=ov><div class=wrap><img><div class=box></div></div></div>' + f"<script>{JS}</script>")
    (common.DATA / "report.html").write_text("\n".join(H), encoding="utf-8")
    print("wrote", common.DATA / "report.html")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate and open**

Run: `python3 scripts/abujhd/c_report.py`
Expected: `wrote …/data/abujhd/report.html`. Open it in the browser pane (`file://` path or via a tiny `python3 -m http.server 8765 --directory data/abujhd`): the tie-out cards show the 1,981.70 and 3,000 differences; the Statement table lists 129 rows with chips; clicking a thumbnail shows the page with a red box on the crop.

- [ ] **Step 3: Commit**

```bash
git add scripts/abujhd/c_report.py
git commit -m "abujhd: whiteboard report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: CHECKPOINT C (human)**

The user opens `report.html`; one iteration on clarity (wording of "what to check", column order, thumbnail size). Apply, re-run `c_report.py`, commit.

---

## Self-review against the spec

- Spec §Step A 1 EDA → Task 7 `write_eda`; 2 Clean → Task 4 `clean_segment`; 3 Group + cross-page → Task 4 `group_page`/`build_groups`; 4 Link → Task 5; 5 Heal (rules, payload, two backends, cache, provenance, statement from text layer, orange flag) → Tasks 2, 5, 6, 7; 6 Outputs → Task 7. Checkpoint A → Task 7 step 5.
- Spec §Step B 1 collapse → Task 8 `collapse_card_slips`; 2 scoring/greedy/overrides → Task 8; 3 ledger tie-out → Task 9; 4 statuses + orange cross-tab → Task 9; 5 `matches.json` → Task 9; test fixture → Task 8/9 tests. Checkpoint B → Task 9 step 6.
- Spec §Step C → Task 10 (tie-out block, statement table with thumbnails and overlay, sections with "what to check", citations). Checkpoint C → Task 10 step 4.
- Deviations from the spec, deliberate: the healer lives in `healer.py` (a module `a_refine.py` imports) so each step still has a single entry script; a second test file `test_refine.py` covers A's pure functions, which the spec's single `test_match.py` could not.
- Type consistency: `group["amounts"]` is always `[{value, total_candidate}]`; `fields` is `None` until healed; `links` maps group id → ref or `None`; `review` maps group id → `[(ref, score)]`; `tieout` keys are the four names used by `c_report.py`.
