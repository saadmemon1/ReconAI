# scripts/abujhd/a_refine.py
"""Step A: refine DocAI's parsed chunks — clean, group, link, heal. See the spec."""
import argparse, re, subprocess, sys, pathlib
from datetime import datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import numpy as np
from PIL import Image
import common
from common import ascii_digits, norm_text, find_amounts, find_dates, load_json, save_json, _days, total_flags

# --- Statement (bank-card grid) from the PDF's own text layer ---------------------------
_ROW = re.compile(
    r"^\s*(?P<ref>\d{10,20})\s+(?P<txn>[\d.]+)\s+(?P<date>\d{8}) (?P<time>\d{6,7})\s+\d{8}\s+Err:509 \w+\s+"
    r"(?P<balance>[\d.]+)\s+(?P<bill>[\d.]+)\s+(?P<type>Financial|Load)\s+(?P<merchant>.*?)\s{2,}"
    r"(?P<cortex>\d{8})\s+(?P<avail>[\d,.()]+)\s+\S+\s+(?P<code>\d+)\s+(?P<signed>-?[\d.]+)\s+"
    r"(?P<load_type>.*?)\s{2,}(?P<load_src>\S+)\s*$")

KIND = {"201": "load", "1": "atm", "30": "inquiry", "35": "inquiry"}   # 30/35: balance inquiries, amount 0

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
    n_ref = sum(1 for l in text.splitlines() if re.match(r"\s*\d{10,20}\b", l))
    if n_ref != len(rows):
        raise RuntimeError(f"statement: {n_ref} ref lines but {len(rows)} parsed — layout changed?")
    # y of each ref from the bbox layout (PDF points), mapped to the 200 ppi render for orange detection.
    bbox = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages = re.findall(r'<page width="[\d.]+" height="([\d.]+)"', bbox)
    if len(pages) != 1:
        raise RuntimeError(f"statement: expected a one-page PDF, found {len(pages)} pages")
    page_h = float(pages[0])
    ys = {m.group(3): (float(m.group(1)) + float(m.group(2))) / 2
          for m in re.finditer(r'<word xMin="[\d.]+" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">(\d{10,20})</word>', bbox)}
    png = common.PAGES / "statement-200.png"
    subprocess.run(["pdftoppm", "-r", "200", "-png", "-singlefile", str(pdf), str(png.with_suffix(""))], check=True)
    bands = _orange_bands(png)
    scale = 200 / 72
    for r in rows:
        y = ys.get(r["ref"])
        r["y"] = y
        if y is not None:
            yp = y * scale
            r["orange"] = any(s <= yp <= e for s, e in bands)
    return rows, page_h

def _num(s):
    s = ascii_digits(s).replace(",", "").strip()
    return round(float(s), 2) if re.fullmatch(r"-?\d+(\.\d+)?", s) else None

def parse_ledger(segments, sheet="General Ledger"):
    rows = []
    for seg in segments:
        if (seg.get("coordinates") or {}).get("sheetName") != sheet:
            continue
        start = (seg.get("coordinates") or {}).get("startRow")
        # pipe rows are [header, separator, data…]; data row i is sheet row startRow + i
        pipes = [l for l in seg.get("markdown", "").split("\n") if l.startswith("|")][2:]
        for i, line in enumerate(pipes):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 9 or not cells[1].startswith("MISC/"):
                continue
            # the ledger writes MM/DD/YYYY (09/30/2026), unlike the day-first receipts, so parse it here
            m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", ascii_digits(cells[2]))
            rows.append({"code": cells[1], "date": f"{m[3]}-{m[1]}-{m[2]}" if m else None, "text": norm_text(cells[3]),
                         "debit": _num(cells[6]), "credit": _num(cells[7]), "balance": _num(cells[8]),
                         "month": cells[1][5:12].replace("/", "-"),
                         "sheet": sheet, "row": start + i, "cell": f"B{start + i}"})
    return rows


# --- cleaning and grouping ---------------------------------------------------------------
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
    # DocAI describes pictures in figure segments ("KIND: photo ... TEXT: ..."): prose about the image, not OCR.
    # The box stays for geometry; the prose must not become amounts, dates or a merchant.
    if seg.get("type") == "figure" and text.startswith("KIND:"):
        text = ""
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
    # merge small components into the nearest larger one; with no large one, the largest small one anchors
    small = [g for g in groups if len(g) < 2 or (union_box(g)[2] - union_box(g)[0]) < 150]
    big = [g for g in groups if g not in small]
    if not big and small:
        anchor = max(small, key=lambda g: (len(g), union_box(g)[2] - union_box(g)[0]))
        big = [anchor]
        small = [g for g in small if g is not anchor]
    for g in small:
        cx, cy = center(g)
        nearest = min(big, key=lambda h: (center(h)[0] - cx) ** 2 + (center(h)[1] - cy) ** 2)
        nearest.extend(g)
    return big


_APPROVAL = re.compile(r"approval[^\d]{0,20}(\d{5,8})", re.I)
_JUNK_MERCHANT = re.compile(r"^(KIND:|[\d\s.,:/()-]*$)")   # a caption, a date, a number or an amount is not a merchant
_INVOICE = re.compile(r"(?:\binv(?:oice)?\.?\s*(?:no|#|num|رقم)?[.:\s]*|رقم الفاتورة[:\s]*|bill no\.?[:\s]*)(?=[A-Z0-9\-/]*\d)([A-Z0-9][A-Z0-9\-/]{3,})", re.I)

def derive_fields(text, segs):
    t = ascii_digits(text)
    flags = total_flags(t)  # value -> total_candidate, in first-appearance order
    amounts = [{"value": v, "total_candidate": f} for v, f in flags.items()]
    heads = [s["text"].split("\n")[0][:60] for s in segs if s.get("type") in ("title", "header") and s["text"]]
    first = text.strip().split("\n")[0][:60] if text.strip() else ""
    merchants = [m for m in dict.fromkeys([h for h in heads if h] + ([first] if first else [])) if not _JUNK_MERCHANT.match(m.strip())]
    ap = _APPROVAL.search(t); inv = _INVOICE.search(t)
    return {"amounts": amounts, "dates": list(dict.fromkeys(find_dates(t))), "merchant_candidates": merchants,
            "approval_code": ap.group(1) if ap else None, "invoice_no": inv.group(1) if inv else None}


_CONT = re.compile(r"page\s*(\d+)\s*of\s*(\d+)|continued|تابع", re.I)

def _is_continuation(text):
    # "continued"/تابع always mark a continuation; "page K of N" only when it is a later page of a multi-page receipt
    return any(m.group(1) is None or (int(m.group(1)) > 1 and int(m.group(2)) > 1) for m in _CONT.finditer(text))

def _xo(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0]))

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
                           "segment_ids": [s["id"] for s in g], "text": text, "_segs": g, **derive_fields(text, g)})
    # cross-page merge: continuation marker or same invoice_no as a group on the previous page
    merged = []
    for g in groups:
        prev = [h for h in merged if h["pages"][-1] == g["page"] - 1]
        target = None
        if prev and (_is_continuation(g["text"]) or (g["invoice_no"] and any(h["invoice_no"] == g["invoice_no"] for h in prev))):
            same = [h for h in prev if g["invoice_no"] and h["invoice_no"] == g["invoice_no"]]
            # no invoice match: the previous-page group sharing the most x-range with g, lowest on the page on ties
            target = same[0] if same else max(prev, key=lambda h: (_xo(h["box"], g["box"]), h["box"][3]))
        if target:
            tb, gb = target["box"], g["box"]
            target["box"] = [min(tb[0], gb[0]), min(tb[1], gb[1]), max(tb[2], gb[2]), max(tb[3], gb[3])]
            target["pages"].append(g["page"]); target["segment_ids"] += g["segment_ids"]; target["text"] += "\n" + g["text"]
            target["_segs"] += g["_segs"]
            target.update(derive_fields(target["text"], target["_segs"]))
            target["merchant_candidates"] = target["merchant_candidates"] or g["merchant_candidates"]
        else:
            merged.append(g)
    for h in merged:
        del h["_segs"]
    return merged


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
    if not group.get("merchant_candidates"): rules.append("no_merchant")   # the matcher scores on the merchant; without one, let the healer read it
    return rules


# ---- orchestration ----
def render_pages(pdf, n_pages):
    if not (common.PAGES / f"page-{n_pages:02d}.png").exists():
        subprocess.run(["pdftoppm", "-r", "150", "-png", str(pdf), str(common.PAGES / "page")], check=True)
        # pdftoppm pads page numbers to the digit count of the last page (page-01.png … page-87.png)

def crop_group(g, segs_by_id):
    im = Image.open(common.PAGES / f"page-{g['page']:02d}.png")
    W, H = im.size; pad = 30
    x0, y0, x1, y1 = g["box"]
    if len(g["pages"]) > 1:   # ponytail: multi-page groups are cropped from their first page only
        bs = [_box(s) for i in g["segment_ids"] if (s := segs_by_id.get(i)) and (s.get("coordinates") or {}).get("pageNumber") == g["page"]]
        if bs: x0, y0, x1, y1 = min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)
    path = common.CROPS / f"{g['id']}.png"
    im.crop((max(0, int(x0 / 1000 * W) - pad), max(0, int(y0 / 1000 * H) - pad), min(W, int(x1 / 1000 * W) + pad), min(H, int(y1 / 1000 * H) + pad))).save(path)
    return path.read_bytes()

def apply_fields(g, segs, f):
    """Set g['fields'] = f and make the group's derived values honour it (healed/override values win)."""
    g["fields"] = f; g["kind"] = f.get("kind")
    g.update(derive_fields(g["text"], segs))
    total = [round(f[k], 2) for k in ("total", "card_slip_amount") if f.get(k) is not None]
    for v in total:
        if all(a["value"] != v for a in g["amounts"]):
            g["amounts"].append({"value": v, "total_candidate": True})
    if total:   # a given total beats whatever derive_fields flagged
        for a in g["amounts"]: a["total_candidate"] = a["value"] in total
    if f.get("date") and f["date"] not in g["dates"]: g["dates"].insert(0, f["date"])
    elif f.get("date"): g["dates"].insert(0, g["dates"].pop(g["dates"].index(f["date"])))
    if f.get("merchant"): g["merchant_candidates"] = [f["merchant"]] + [m for m in g["merchant_candidates"] if m != f["merchant"]]
    g["approval_code"] = f.get("approval_code") or g["approval_code"]; g["invoice_no"] = f.get("invoice_no") or g["invoice_no"]

def apply_heal(g, segs_by_id, result, backend):
    for s in result.get("segments", []):
        seg = segs_by_id.get(s["id"])
        if seg is not None and s["text"] and s["text"] != seg["text"]:
            seg["text"] = s["text"]; seg["healed"] = True; seg["healer"] = backend
    segs = [segs_by_id[i] for i in g["segment_ids"] if i in segs_by_id]
    g["confidence"] = result.get("confidence"); g["notes"] = result.get("notes")
    g["text"] = "\n".join(s["text"] for s in segs if s["text"])
    apply_fields(g, segs, result.get("fields") or {})


def write_eda(path, statement, ledger, groups, segs, healed_n, backend, month):
    import collections
    L = [f"# EDA — ABUJHD {datetime.strptime(month, '%Y-%m').strftime('%B %Y')}", ""]
    kinds = collections.Counter(r["kind"] for r in statement)
    L += ["## Statement", f"- rows: {len(statement)} — " + ", ".join(f"{k}: {v} (sum {sum(r['amount'] for r in statement if r['kind']==k):,.2f})" for k, v in kinds.items()),
          f"- dates: {min(r['date'] for r in statement)} … {max(r['date'] for r in statement)}; orange rows: {sum(r['orange'] for r in statement)}", ""]
    sep = [r for r in ledger if r["month"] == month]
    L += [f"## Ledger ({month})"] + [f"- {r['code']} {r['date']} D {r['debit'] or ''} C {r['credit'] or ''} — {r['text'][:70]}" for r in sep] + [""]
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
    cfg = common.config()
    overrides = load_json(common.DATA / "overrides.json") if (common.DATA / "overrides.json").exists() else {}

    statement, page_h = build_statement(common.RAW / "statement.bin")
    ledger = parse_ledger(load_json(common.RAW / "ledger.segments.json"), cfg["sheet"])
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
                res = healer.heal(g, [segs_by_id[j] for j in g["segment_ids"]], crop_group(g, segs_by_id), a.healer)
                apply_heal(g, segs_by_id, res, a.healer); healed += 1
                g["candidates"] = link_candidates(g, statement); g["linkable"] = bool(g["candidates"])
            except Exception as e:
                g["notes"] = f"heal failed: {e}"
            print(f"heal {i}/{len(todo)} {g['id']} {g['broken']} -> {g.get('fields') and g['fields'].get('total')}", file=sys.stderr)
    for gid, fix in (overrides.get("groups") or {}).items():
        g = next((g for g in groups if g["id"] == gid), None)
        if not g: print(f"override: unknown group id {gid}", file=sys.stderr); continue
        fix = dict(fix)
        for k in ("total", "card_slip_amount"):
            if k in fix and not (isinstance(fix[k], (int, float)) and not isinstance(fix[k], bool)):
                print(f"override: {gid}.{k}={fix[k]!r} is not a number, ignored", file=sys.stderr); del fix[k]
        apply_fields(g, [segs_by_id[i] for i in g["segment_ids"] if i in segs_by_id], {**(g["fields"] or {}), **fix})
        g["notes"] = (g["notes"] or "") + " [override]"
        g["candidates"] = link_candidates(g, statement); g["linkable"] = bool(g["candidates"])
    for g in groups: crop_group(g, segs_by_id)   # every group gets a fresh crop for the report

    page = Image.open(common.PAGES / "statement-200.png"); W = page.size[0]
    for r in statement:   # one strip per statement row, always rewritten (cheap)
        if r["y"] is None:
            r["crop"] = r["box"] = None; continue
        y_px = round(r["y"] * 200 / 72)
        page.crop((0, y_px - 9, W, y_px + 9)).save(common.CROPS / f"stmt-{r['ref']}.png")
        r["crop"] = f"crops/stmt-{r['ref']}.png"
        r["box"] = [0, round((r["y"] - 2.3) / page_h * 1000), 1000, round((r["y"] + 2.3) / page_h * 1000)]

    save_json(common.DATA / "statement.json", statement); save_json(common.DATA / "ledger.json", ledger)
    save_json(common.DATA / "segments.refined.json", segs); save_json(common.DATA / "groups.json", groups)
    write_eda(common.DATA / "eda.md", statement, ledger, groups, segs, healed, a.healer, cfg["month"])
    print(f"statement {len(statement)} rows, ledger {len(ledger)} rows, groups {len(groups)}, broken {sum(bool(g['broken']) for g in groups)}, healed {healed}")

if __name__ == "__main__":
    main()
