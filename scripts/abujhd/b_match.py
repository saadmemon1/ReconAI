# scripts/abujhd/b_match.py
"""Step B: key relation + gap analysis. Pure functions over Step A's JSON. No network."""
import argparse, re, sys, pathlib, unicodedata
from datetime import date, timedelta
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import common
from common import load_json, save_json, _days, total_flags

ALIASES = {"ajmy": "ajmi", "ajmi": "ajmi", "asdaf": "اسواق", "اسواق": "اسواق", "أسواق": "اسواق", "masdarusa": "masdar", "masdarman": "masdar", "masdarjana": "masdar",
           "almuhitai": "almuhit", "muhit": "almuhit", "alfares": "fares", "al-fares": "fares"}
STOP = {"company", "co", "est", "trading", "ltd", "llc", "the", "and", "for", "شركة", "مؤسسة", "للتجارة", "التجارية", "sau", "ahsasau", "ahsa", "riyadh"}

def _fold(s):
    return unicodedata.normalize("NFKC", s or "").lower().replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")

def norm_merchant(s):
    s = _fold(s)
    toks = set()
    for t in re.split(r"[^a-z0-9؀-ۿ]+", s):
        if len(t) < 3 or t in STOP or t.isdigit(): continue   # a number is not a name (p78 footer: "Total Invoice | 275.00")
        toks.add(ALIASES.get(t, t))
    return toks

def _prefixes(toks):
    """5-char prefixes of long run-on tokens (ALHASA SOUTHAL AHSASAU style), used only as a fallback when full tokens miss."""
    return {t[:5] for t in toks if len(t) > 6}

def receipt_amounts(g):
    if g.get("unreadable"): return set()   # withheld by gate_amounts: never matched on a guess
    f = g.get("fields") or {}
    healed = {round(v, 2) for v in (f.get("total"), f.get("card_slip_amount")) if isinstance(v, (int, float))}
    if healed: return healed
    # an unmerged record re-ranks its totals from its own text (groups.json may predate the keyword rules); a merged one keeps its merged flags
    if g.get("text") and len(g.get("ids") or [1]) == 1:
        totals = {round(v, 2) for v, t in total_flags(g["text"]).items() if t}
    else:
        totals = {a["value"] for a in g["amounts"] if a["total_candidate"]}
    return totals or {a["value"] for a in g["amounts"]}

def _dates(g):
    f = g.get("fields") or {}
    return ([f["date"]] if f.get("date") else []) + [d for d in g["dates"] if d != f.get("date")]

def _merchants(g):
    f = g.get("fields") or {}
    return ([f["merchant"]] if f.get("merchant") else []) + g["merchant_candidates"]

_SLIP_TEXT = re.compile(r"\bmada\b|مدى|purchase amount|مبلغ الشراء|approval code|رمز الموافقة", re.I)

def _is_slip(g):
    """A healed group says what it is; an unhealed one is a card slip when its text reads like one (p38-g3, p65-g1)."""
    return g.get("kind") == "card_slip" or (not g.get("fields") and bool(_SLIP_TEXT.search(g.get("text") or "")))

def _slip_row_amounts(s, rows):
    """Amounts of the purchase rows whose reference number the slip prints: a mada slip's RRN is the statement ref (p38-g3: 091017099294)."""
    refs = set(re.findall(r"\b\d{12}\b", s.get("text") or ""))
    return {round(r["amount"], 2) for r in rows if r["ref"] in refs and r.get("kind", "purchase") == "purchase"}

AUDIT_KEYS = ("by", "reason", "at", "proposed")

def _author(fx):
    """Who made an override and why, as recorded in overrides.json. A missing author is reported as such, never filled in."""
    return {"by": common.author_name(fx.get("by")) or None, "reason": fx.get("reason") or None, "at": fx.get("at") or None, "proposed": bool(fx.get("proposed"))}

def apply_group_overrides(groups, overrides):
    """overrides.json's groups section (a human's total/date/merchant for a group) the way Step A applies it, so a fix lands on the cached
    groups without a healer run: the fix wins over the healed fields, its amounts become the total candidates, its date and merchant go first.
    `by`, `reason`, `at` and `proposed` say who made the fix; `unreadable: true` withholds the group's amounts (see gate_amounts)."""
    by_id = {g["id"]: g for g in groups}
    for gid, fix in ((overrides or {}).get("groups") or {}).items():
        g = by_id.get(gid)
        if not g: print(f"override: unknown group id {gid}", file=sys.stderr); continue
        g["override"] = {**_author(fix), "fields": sorted(k for k in fix if k not in AUDIT_KEYS + ("unreadable",))}
        if fix.get("unreadable"): g["unreadable_by"] = _author(fix)
        fix = {k: v for k, v in fix.items() if k not in AUDIT_KEYS + ("unreadable",)}
        for k in ("total", "card_slip_amount"):
            if k in fix and not (isinstance(fix[k], (int, float)) and not isinstance(fix[k], bool)):
                print(f"override: {gid}.{k}={fix[k]!r} is not a number, ignored", file=sys.stderr); del fix[k]
        f = {**(g.get("fields") or {}), **fix}; g["fields"] = f
        if fix.get("kind"): g["kind"] = fix["kind"]
        totals = [round(f[k], 2) for k in ("total", "card_slip_amount") if isinstance(f.get(k), (int, float))]
        for v in totals:
            if all(a["value"] != v for a in g["amounts"]): g["amounts"].append({"value": v, "total_candidate": True})
        if totals:
            for a in g["amounts"]: a["total_candidate"] = a["value"] in totals
        if f.get("date"): g["dates"] = [f["date"]] + [d for d in g["dates"] if d != f["date"]]
        if f.get("merchant"): g["merchant_candidates"] = [f["merchant"]] + [m for m in g["merchant_candidates"] if m != f["merchant"]]
        if "[override]" not in (g.get("notes") or ""): g["notes"] = ((g.get("notes") or "") + " [override]").strip()
    return groups

def collapse_card_slips(groups, rows=()):
    """A card slip joins a same-amount receipt/invoice on the same or previous page (merchant must agree when the slip names one),
    or the same-page receipt whose total is the amount of the statement row the slip's printed reference names (OCR may garble
    the slip's own amount: p65-g1 reads 335.55 for 330.00). The slip's date then dates the purchase.
    Order-independent: receipts/invoices first in input order, then any slip that found no receipt as its own record."""
    out, used = [], set()
    for g in groups:
        if _is_slip(g) or g["id"] in used: continue
        rec = {**g, "ids": [g["id"]], "boxes": [(g["page"], g.get("box"))]}
        for s in groups:
            if not _is_slip(s) or s["id"] in used or s["page"] not in (g["page"], g["page"] + 1): continue
            amt = receipt_amounts(s) & receipt_amounts(g)
            if amt and _merchants(s) and not (norm_merchant(" ".join(_merchants(s))) & norm_merchant(" ".join(_merchants(g)))): amt = set()
            if not amt and s["page"] == g["page"]: amt = _slip_row_amounts(s, rows) & receipt_amounts(g)
            if not amt: continue
            used.add(s["id"]); rec["ids"].append(s["id"]); rec["boxes"].append((s["page"], s.get("box")))
            rec["notes"] = " ".join(filter(None, [rec.get("notes"), s.get("notes")])) or None
            rec["fields"] = {**(rec.get("fields") or {}), "card_slip_amount": next(iter(amt))}
            rec["dates"] = rec["dates"] + [d for d in s["dates"] if d not in rec["dates"]]
        used.add(g["id"]); out.append(rec)
    for s in groups:
        if _is_slip(s) and s["id"] not in used:
            out.append({**s, "ids": [s["id"]], "boxes": [(s["page"], s.get("box"))]})
    return out

GENERIC = {_fold(t) for t in ("total", "invoice", "tax", "amount", "words", "kind", "diagram", "logo", "simplified", "customer", "sig", "branch", "main", "details", "payment", "bill", "receipt",
           "التفاصيل", "الكمية", "السعر", "تفاصيل", "الدفع", "فاتورة", "ضريبية", "مبسطة", "المجموع", "الإجمالي", "إجمالي", "الصافي", "توقيع", "المستلم")}

def real_merchant_tokens(g):
    return norm_merchant(" ".join(_merchants(g))) - GENERIC

def _own_total_line(g):
    """The piece's own text prints the amount it calls its total: a whole document, not the header or the footer half of one."""
    return bool({v for v, t in total_flags(g.get("text") or "").items() if t} & receipt_amounts(g))

def _same_invoice(a, b):
    """Invoice numbers agree when equal, missing, or one is the other with an OCR digit dropped (p80/p81: AYNS/2026/1016 vs 10164)."""
    a, b = (re.sub(r"\s", "", x or "") for x in (a, b))
    return a.startswith(b) or b.startswith(a)

def collapse_fragments(records):
    """Same-/adjacent-page pieces of one document (same total, compatible merchant) merge into the earliest record.
    Each record tracks `_rm`, the real merchant tokens of everything merged into it, so two different shops never share a record (p10: same 10.00),
    `_inv`, the invoice numbers seen, and `_tl`, whether a piece printed its own total line: two numbers or two total lines are two documents
    (p23/p24: invoices 1634 and 1635, both 10.01; p82/p83: two copies of one receipt), never fragments of one.
    Merchant-less pieces go last (order-independent) and stay unmerged when two different shops would both accept them.
    Last, a page with one priced, undated document: its unpriced dated piece (an online invoice's date block, p87-g3) dates that document."""
    def fold(A, B, tb):
        A["ids"] += B["ids"]; A["boxes"] += B["boxes"]; A["_rm"] |= tb; A["_inv"] |= {(B.get("fields") or {}).get("invoice_no")} - {None}; A["_tl"] = A["_tl"] or _own_total_line(B)
        A["notes"] = " ".join(filter(None, [A.get("notes"), B.get("notes")])) or None   # a multi-document note on any piece must survive
        for x in B["amounts"]:
            m = next((y for y in A["amounts"] if y["value"] == x["value"]), None)
            if m: m["total_candidate"] = m["total_candidate"] or x["total_candidate"]
            else: A["amounts"].append(dict(x))
        A["dates"] += [d for d in B["dates"] if d not in A["dates"]]
        if not (A.get("fields") or {}).get("merchant") and (B.get("fields") or {}).get("merchant"):
            # B fills what A lacks; a value A holds (a person's or a page check's total, VAT) is never lost to the merge (p84: 460 kept)
            A["fields"] = {**B["fields"], **{k: v for k, v in (A.get("fields") or {}).items() if v is not None}}
        A["pages"] = sorted(set(A["pages"]) | set(B["pages"]))
    out = []
    for i, B in sorted(enumerate(records), key=lambda p: not real_merchant_tokens(p[1])):
        tb = real_merchant_tokens(B); ib = (B.get("fields") or {}).get("invoice_no"); lb = _own_total_line(B)
        same_day_ok = lambda A: not _dates(A) or not _dates(B) or set(_dates(A)) & set(_dates(B))   # two days = two purchases, never one record
        one_doc = lambda A: all(_same_invoice(x, ib) for x in A["_inv"]) and not (A["_tl"] and lb)
        ok = [A for A in out if abs(A["page"] - B["page"]) <= 1 and receipt_amounts(A) & receipt_amounts(B) and (not A["_rm"] or not tb or A["_rm"] & tb) and same_day_ok(A) and one_doc(A)]
        if not tb and len({frozenset(A["_rm"]) for A in ok if A["_rm"]}) > 1: ok = []
        if not ok:
            out.append({**B, "ids": list(B["ids"]), "boxes": list(B["boxes"]), "amounts": [dict(x) for x in B["amounts"]], "dates": list(B["dates"]), "pages": list(B["pages"]),
                        "_rm": set(tb), "_i": i, "_inv": {ib} - {None}, "_tl": lb})
            continue
        fold(ok[0], B, tb)
    for B in [B for B in out if not receipt_amounts(B) and _dates(B)]:
        priced = [A for A in out if A["page"] == B["page"] and receipt_amounts(A)]
        if len(priced) == 1 and not _dates(priced[0]):
            fold(priced[0], B, set()); out.remove(B)
    out.sort(key=lambda A: A["_i"])
    return [{k: v for k, v in A.items() if k not in ("_rm", "_i", "_inv", "_tl")} for A in out]

CONFIDENCE_MIN = 0.7   # an AI read below this is not used: the amount is withheld and a human reads the receipt

def _inside(pt, box):
    return box and box[0] <= pt[0] <= box[2] and box[1] <= pt[1] <= box[3]

def _apply_qr(r, z, meta):
    """One decoded code on one record, parsed document first: the QR confirms a usable parsed total, fills one that is missing or too weak
    to use, and when the two disagree nobody picks: the amounts are withheld and a person checks. A person's own total is kept."""
    r["qr"] = {**z, **meta}
    if z.get("total") is None: return
    f = r.get("fields") or {}
    qt = round(z["total"], 2)
    human = r.get("override") and "total" in r["override"]["fields"]
    read = f.get("total") if isinstance(f.get("total"), (int, float)) else None
    usable = read is not None and (human or (r.get("confidence") or 0) >= CONFIDENCE_MIN)
    if usable and round(read, 2) == qt:
        r["qr_confirms"] = True
        if z.get("vat") is not None and f.get("vat") is None: r["fields"] = {**f, "vat": z["vat"]}
        return
    if usable:
        r["qr_conflict"] = {"read": read, "qr": z["total"], "kept": "human" if human else "none"}
        if not human: r["unreadable_by"] = {"by": None, "reason": f"the invoice reads {read:.2f} but its QR code says {z['total']:.2f}; a person must check which is right", "at": None, "proposed": False}
        return
    r["qr_fills"] = {"read": read}
    r["fields"] = {**f, "total": z["total"], **({"vat": z["vat"]} if z.get("vat") is not None else {})}
    slip = f.get("card_slip_amount")
    keep = {qt} | ({round(slip, 2)} if isinstance(slip, (int, float)) else set())
    if all(a["value"] != qt for a in r["amounts"]): r["amounts"].append({"value": qt, "total_candidate": True})
    for a in r["amounts"]: a["total_candidate"] = a["value"] in keep

def attach_qr(records, qr, parts=(), entered=None):
    """Tie each ZATCA code to its record: first the codes a person entered (overrides.json "qr": the text from a phone scan, checked and
    signed off in the app), then the decoded ones (qr.json, Step Q), each to the record whose crop holds the code's centre, or else the one
    record on its page (or the facing page) whose read amounts include the code's total. See _apply_qr for what a code does to the amounts.
    Returns the codes nobody could tie, so the report lists them instead of dropping them."""
    loose = []
    records = [r for r in records if r["id"] not in set(parts)]   # a recorded fragment (overrides.json PART) is never an invoice
    by_piece = {i: r for r in records for i in r.get("ids") or [r["id"]]}
    for gid, e in sorted((entered or {}).items()):
        r = by_piece.get(gid)
        if not r or not e.get("zatca"): print(f"override: QR entry for unknown receipt {gid}", file=sys.stderr); continue
        _apply_qr(r, e["zatca"], {"page": r["page"], "box": None, "entered": _author(e)})
    for name, page in sorted(((qr or {}).get("pages") or {}).items()):
        pno = int(re.sub(r"\D", "", name))
        for code in page["codes"]:
            z = code.get("zatca")
            if not z: continue
            x0, y0, x1, y1 = code["box"]
            c = ((x0 + x1) / 2 * 1000 / page["width"], (y0 + y1) / 2 * 1000 / page["height"])
            box_hits = [r for r in records if not r.get("qr") and any(p == pno and _inside(c, b) for p, b in r.get("boxes") or [])]
            same_total = lambda rs: [r for r in rs if z.get("total") is not None and round(z["total"], 2) in receipt_amounts(r)]
            on_page = same_total([r for r in records if not r.get("qr") and pno in r.get("pages", [r["page"]])])
            # inside one crop; or, when the crop is a bare QR/header piece (or several crops overlap), the one record on the page with its total
            hits = box_hits if len(box_hits) == 1 and receipt_amounts(box_hits[0]) else same_total(box_hits) if len(same_total(box_hits)) == 1 else on_page
            if len(hits) != 1:
                if not any(r.get("qr") and r["qr"].get("total") == z.get("total") and r["qr"].get("vat_no") == z.get("vat_no") for r in records):
                    loose.append({"page": pno, "box": code["box"], "zatca": z})
                continue
            _apply_qr(hits[0], z, {"page": pno, "box": code["box"], "decoder": code.get("decoder")})
    return loose

def amount_source(g):
    """Where the amount the matcher uses came from: the parsed invoice (AI read), the same confirmed by its QR code, a QR code alone
    (the parsed read was missing or too weak), or a person (overrides.json)."""
    if g.get("override") and "total" in g["override"]["fields"]: return override_kind(g["override"])
    if g.get("qr_fills"): return "qr"
    if g.get("qr_confirms"): return "ai_qr"
    return "ai"

def override_kind(a):
    """human: a named person; ai_check: the AI read the page again and said so; unattributed: an override with no author recorded."""
    if not a.get("by"): return "unattributed"
    return "ai_check" if a.get("proposed") or common.is_ai_author(a["by"]) else "human"

def gate_amounts(records):
    """Abstain: an amount only the AI read, at confidence below CONFIDENCE_MIN, or a receipt a person marked unreadable, is withheld from the
    matching. The amounts move to `withheld_amounts`, so the receipt can still be suggested by shop and date but never matched on a guess."""
    for g in records:
        src = amount_source(g)
        conf = g.get("confidence")
        why = None
        if g.get("unreadable_by"): why = "marked unreadable" + (f" by {g['unreadable_by']['by']}" if g["unreadable_by"]["by"] else "") + (f": {g['unreadable_by']['reason']}" if g["unreadable_by"]["reason"] else "")
        elif src == "ai" and conf is not None and conf < CONFIDENCE_MIN: why = f"AI read the amount at {conf:.2f} confidence, below the {CONFIDENCE_MIN:.2f} needed"
        g["amount_source"] = src
        if not why: continue
        g["unreadable"] = why
        g["withheld_amounts"] = sorted({a["value"] for a in g["amounts"]})
        g["amounts"] = []
        g["fields"] = {**(g.get("fields") or {}), "total": None, "card_slip_amount": None}
    return records

def _date_readings(d, year):
    """ISO dates a scanned date could really mean: as read, the year corrected, day and month swapped, the Arabic digits
    3/9 confused in the month. What OCR gets wrong on these receipts, so the matcher and the other-month check agree."""
    try: yy, mm, dd = (int(x) for x in d.split("-"))
    except (ValueError, AttributeError): return []
    swap = {3: 9, 9: 3}
    out = []
    for y_, m_, d_ in ((yy, mm, dd), (year, mm, dd), (yy, dd, mm), (year, dd, mm), (yy, swap.get(mm, mm), dd), (year, swap.get(mm, mm), dd)):
        try: out.append(date(y_, m_, d_).isoformat())
        except ValueError: pass
    return list(dict.fromkeys(out))

def _overlap(g, row):
    A = norm_merchant(" ".join(_merchants(g))); B = norm_merchant(row["merchant"])
    return A & B or _prefixes(A) & _prefixes(B)

def _inv_order(g):
    n = re.sub(r"\D", "", (g.get("fields") or {}).get("invoice_no") or "")
    return int(n) if n else None

def _amount_diff(g, row):
    return min((round(abs(a - row["amount"]), 2) for a in receipt_amounts(g)), default=99)

def score(g, row):
    if row["kind"] != "purchase": return 0
    diff = _amount_diff(g, row)
    if diff > 0.05: return 0
    s = 3 if diff == 0 else 2
    ry = int(row["date"][:4])
    ds = [_days(x, row["date"]) for d in _dates(g) for x in _date_readings(d, ry)]
    support = 2 if 0 in ds else 1 if 1 in ds else 0
    support += min(2, len(_overlap(g, row)))
    if s == 3 and not support and (g.get("fields") or {}).get("date"): return 0   # the healer dated it on another day and nothing else agrees: not this row's receipt (p73-g1 vs the 19/09 row)
    return s + support if s == 3 or support else 0  # a 5-halala drift alone is not a candidate: needs date or merchant support

_MULTI_DOC = re.compile(r"more than one|multiple documents|two documents|two receipts|separate receipts", re.I)
_ATTACHED_SLIP = re.compile(r"card slip|pos slip|card/pos|pos/card|mada|point[- ]of[- ]sale|payment slip|terminal receipt", re.I)

_CASH = re.compile(r"\bcash\b|نقد|كاش", re.I)

def _cash_after(g, row):
    """A receipt dated after the card charge and marked cash is not that charge's receipt (p64-g1: a 21/09 cash invoice vs a 20/09 card row):
    it stays a suggestion for a human, never a MATCHED link."""
    ds = _dates(g)
    return bool(ds) and ds[0] > row["date"] and bool(_CASH.search(f"{g.get('text') or ''} {g.get('notes') or ''}"))

def _looks_multi_document(notes):
    """A healer note about two documents forces review, unless the second one is the purchase's own card/POS slip."""
    n = notes or ""
    return bool(_MULTI_DOC.search(n)) and not _ATTACHED_SLIP.search(n)

LINK_HOW = {}   # group id -> how its link was made: {"rule": ..., plus the author for a forced link}. Filled by the matching passes.

def match_receipts(groups, rows, overrides):
    # a forced link may name any id merged into a record by collapse_*: resolve it to the record's head id
    head_of = {i: g["id"] for g in groups for i in g.get("ids") or [g["id"]]}
    refs = {r["ref"] for r in rows}
    forced = {}
    for gid, v in ((overrides or {}).get("links") or {}).items():
        ref = v.get("ref") if isinstance(v, dict) else v   # {"ref", "by", "reason"} or the bare ref
        if gid not in head_of: print(f"override: unknown group id {gid}", file=sys.stderr); continue
        if ref and ref not in refs: print(f"override: unknown statement ref {ref} for {gid}", file=sys.stderr); continue
        if not ref and not (isinstance(v, dict) and v.get("by")):
            # "this receipt has no card payment" with no author is not evidence: the matcher decides, and a person can still unlink it
            print(f"override: unsigned no-link for {gid} ignored", file=sys.stderr); continue
        forced[head_of[gid]] = ref
        LINK_HOW[head_of[gid]] = {"rule": "override", **_author(v if isinstance(v, dict) else {})}
    links, review, taken = {}, {}, set()
    for gid, ref in forced.items():
        links[gid] = ref
        if ref: taken.add(ref)
    # a mada slip stapled to the receipt prints the card payment's own reference (RRN): the link is read off the paper, not inferred
    purchase = {r["ref"] for r in rows if r.get("kind", "purchase") == "purchase"}
    printed = {g["id"]: set(g.get("printed_refs") or []) & purchase for g in groups if g["id"] not in forced}
    claimed = [x for v in printed.values() for x in v]
    for gid, refs_ in printed.items():
        if len(refs_) == 1 and claimed.count(next(iter(refs_))) == 1 and not refs_ & taken:
            links[gid] = next(iter(refs_)); taken |= refs_; LINK_HOW[gid] = {"rule": "slip_ref"}
    pending = {g["id"]: g for g in groups if g["id"] not in forced and g["id"] not in links}
    contested = set()  # rows that tied between groups: stay in review candidate lists, never auto-linked
    while pending:
        best = None  # (score, gid, filtered_scored)
        for gid, g in pending.items():
            scored = sorted(((score(g, r), r["ref"]) for r in rows if r["ref"] not in taken), reverse=True)
            scored = [(s, r) for s, r in scored if s > 0]
            top = scored[0][0] if scored else -1
            if best is None or top > best[0]:
                best = (top, gid, scored)
        top, gid, scored = best
        g = pending.pop(gid)
        if not scored:
            links[gid] = None
            # had candidates before others took them → human should see it
            if any(score(g, r) > 0 for r in rows):
                review[gid] = []
            continue
        tie = len(scored) > 1 and scored[1][0] == scored[0][0]
        # a different pending group wanting the same best row with the same score is also a tie
        rival = any(
            score(h, next(r for r in rows if r["ref"] == scored[0][1])) == scored[0][0]
            for hid, h in pending.items())
        row_ref = scored[0][1]
        if rival:
            contested.add(row_ref)
        # healer saw several documents in one crop: its fields describe only one of them, so a human decides
        if top < 4 or tie or rival or row_ref in contested or _looks_multi_document(g.get("notes")) or _cash_after(g, next(r for r in rows if r["ref"] == row_ref)):
            links[gid] = None; review[gid] = [(r, s) for s, r in scored[:3]]
        else:
            links[gid] = row_ref; taken.add(row_ref)
            LINK_HOW[gid] = {"rule": "score", "score": top}
    return links, review

def _r2(x): return round(x, 2)

def split_other_month(groups, month, rows=()):
    """Receipts that belong to another month: every readable date is outside the period (plus a day either side, since a
    card can post next day) under every plausible reading, within a year of it, and no amount on the receipt matches a
    purchase row of this statement. Plausible readings cover what OCR gets wrong on these scans: the year off (same
    month and day), day and month swapped, and the Arabic digits ٣/٩ confused (month 03 vs 09). A date years off is an
    unreadable date, not another month; no date means nothing to judge. The healer's date wins over derived dates."""
    from datetime import date, timedelta
    y, m = (int(x) for x in month.split("-"))
    start = date(y, m, 1) - timedelta(days=1)
    end = date(y + (m == 12), m % 12 + 1, 1)
    def verdict(d):
        readings = _date_readings(d, y)
        if not readings: return None
        if any(start <= date.fromisoformat(x) <= end for x in readings): return "in"
        return "other" if abs((date.fromisoformat(readings[0]) - start).days) <= 366 else None
    amounts_this_month = {round(r["amount"], 2) for r in rows if r.get("kind", "purchase") == "purchase"}
    keep, other = [], []
    for g in groups:
        f = g.get("fields") or {}
        ds = [f["date"]] if f.get("date") else list(g["dates"])
        vs = [verdict(d) for d in ds]
        dated_elsewhere = bool(vs) and "in" not in vs and "other" in vs
        amount_here = bool(receipt_amounts(g) & amounts_this_month)
        (other if dated_elsewhere and not amount_here else keep).append(g)
    return keep, other

def _refs(v): return v if isinstance(v, list) else [v] if v else []

def mark_duplicates(groups):
    """A second copy of a document (same healer invoice number, shop and total as an earlier group: p12/p30 invoice 4942, p82/p83
    fuel receipts) leaves the matching, so the first copy links alone instead of tying with its twin; it is reported as DUPLICATE."""
    keep, dups = [], []
    for g in groups:
        f = g.get("fields") or {}
        first = next((h for h in keep if f.get("invoice_no") and f.get("total") is not None and (h.get("fields") or {}).get("invoice_no") == f["invoice_no"]
                      and (h.get("fields") or {}).get("total") == f["total"] and real_merchant_tokens(h) & real_merchant_tokens(g)), None)
        (dups if first else keep).append({**g, "duplicate_of": first["id"]} if first else g)
    return keep, dups

_TIME = re.compile(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:(AM|PM|ص|م)\b)?", re.I)

def _minutes(t):
    """Minutes since midnight of the first clock time in a string (13:03:54, 2:21 PM, 09:29 ص), else None."""
    m = _TIME.search(t or "")
    if not m or int(m[1]) > 23 or int(m[2]) > 59: return None
    h, ap = int(m[1]), (m[3] or "").upper()
    h += 12 if ap in ("PM", "م") and h < 12 else -12 if ap in ("AM", "ص") and h == 12 else 0
    return h * 60 + int(m[2])

def _receipt_minutes(g):
    f = g.get("fields") or {}
    return _minutes(f["time"]) if f.get("time") else _minutes(g.get("text"))

def _same_day(g, r):
    """The row's day under some plausible reading of a receipt date: the year off (p10-g2: 2025 for 2026), day/month swapped, ٣ for ٩."""
    return any(x == r["date"] for d in _dates(g) for x in _date_readings(d, int(r["date"][:4])))

def second_pass(groups, rows, links, review, tol=3.0):
    """Pass 1's links are never touched; its ties are settled where the evidence allows, then leftovers (rows nobody linked or
    listed for review, groups with no link and no review entry) get the weaker rules.
    0) sequential invoices: k review groups of one shop tying over the same k same-day rows of that shop -> paired, invoice-number
       order = payment order (p23/p24: 1634 and 1635 paid at 13:06 and 13:10).
    1) split payment: two same-day unlinked rows (leftover or parked in a review list) with the identical statement merchant string
       summing exactly to an unlinked receipt's total -> both linked (p10-g2: 10.00 + 10.00 = 20.00).
    1a) bundle: same-merchant rows paid within one minute whose sum is the sum of the unlinked same-day receipts (not slips) on one run of
       consecutive pages -> every receipt of the run linked to all of them (p42-44: 115 + 34.50 + 57.50 paid as 202 + 5).
    1b) elimination: a review group whose candidate list the claims above shrank to one row of score >= 4 that nobody else lists -> linked.
    2) near amount: one row within `tol` SAR on the receipt's date, unique both ways, and the receipt names the shop, was printed within
       two minutes of the card charge (p12-g2: 48.00 at 2:21 PM, card 45.00 at 14:21) or the healer was confident -> linked
       (assign_statuses shows AMOUNT_MISMATCH); a taken near-twin means ambiguity unless the one leftover candidate is also the only
       twin that names the shop (p59: 24.15 vs 24.00 and a 25.00 of another shop).
    3) no total: a healed receipt with merchant+date but no amount and one same-day row whose merchant overlaps -> review suggestion."""
    links, review = dict(links), {k: list(v) for k, v in review.items()}
    by_ref = {r["ref"]: r for r in rows}; by_id = {g["id"]: g for g in groups}; n0 = {gid: len(c) for gid, c in review.items()}
    def claim(gid, ref, rule):   # link, and take the row(s) out of every other candidate list
        links[gid] = ref; review.pop(gid, None); LINK_HOW[gid] = {"rule": rule}
        for c in review.values(): c[:] = [(r, s) for r, s in c if r not in _refs(ref)]
    linked = lambda: {r for v in links.values() for r in _refs(v)}
    blocks = {}
    for gid, cands in review.items():
        top = [(r, sc) for r, sc in cands if sc == cands[0][1]]   # weaker candidates (another shop, a day off) do not break a block
        if len(top) > 1 and top[0][1] >= 4: blocks.setdefault(frozenset(r for r, _ in top), []).append(gid)
    for refs, gids in blocks.items():
        gs = [next(g for g in groups if g["id"] == gid) for gid in gids]; orders = [_inv_order(g) for g in gs]
        if len(gs) != len(refs) or None in orders or len(set(orders)) < len(orders) or not all(_overlap(g, by_ref[r]) for g in gs for r in refs): continue
        for g, ref in zip(sorted(gs, key=_inv_order), sorted(refs, key=lambda r: (by_ref[r]["date"], by_ref[r].get("time") or ""))): claim(g["id"], ref, "sequential")
    for g in [g for g in groups if not links.get(g["id"])]:
        for T in receipt_amounts(g):
            c = [r for r in rows if r["kind"] == "purchase" and r["ref"] not in linked() and _same_day(g, r)]
            pairs = [(a, b) for i, a in enumerate(c) for b in c[i + 1:] if a["merchant"] == b["merchant"] and abs(_r2(a["amount"] + b["amount"]) - T) <= 0.05]
            if len(pairs) == 1:
                claim(g["id"], [pairs[0][0]["ref"], pairs[0][1]["ref"]], "split"); break
    minute = {}
    for r in rows:
        if r["kind"] == "purchase": minute.setdefault((r["merchant"], r["date"], (r.get("time") or "")[:5]), []).append(r)
    for rs in minute.values():
        if len(rs) < 2 or all(r["ref"] in linked() for r in rs): continue
        S = _r2(sum(r["amount"] for r in rs))
        cands = sorted([g for g in groups if not links.get(g["id"]) and not review.get(g["id"]) and not _is_slip(g) and len(receipt_amounts(g)) == 1 and _same_day(g, rs[0])], key=lambda g: g["page"])
        runs = []
        for i in range(len(cands)):
            run, tot = [], 0
            for g in cands[i:]:
                if run and g["page"] > run[-1]["page"] + 1: break
                run.append(g); tot = _r2(tot + next(iter(receipt_amounts(g))))
                if tot > S + 0.05: break
                if abs(tot - S) <= 0.05 and len(run) > 1: runs.append(run); break
        if len(runs) == 1:
            for g in runs[0]: claim(g["id"], [r["ref"] for r in sorted(rs, key=lambda r: r.get("time") or "")], "bundle")
    for gid, c in list(review.items()):
        others = {r for h, cc in review.items() if h != gid for r, _ in cc}
        if len(c) == 1 < n0[gid] and c[0][1] >= 4 and c[0][0] not in others | linked() and not _looks_multi_document(by_id[gid].get("notes")): claim(gid, c[0][0], "elimination")
    parked = {r for c in review.values() for r, _ in c}
    left_rows = [r for r in rows if r["kind"] == "purchase" and r["ref"] not in linked() | parked]
    emptied = [gid for gid, c in review.items() if not c]   # candidates all taken by others: try the leftover rules, else back to review
    for gid in emptied: review.pop(gid)
    left = [g for g in groups if not links.get(g["id"]) and g["id"] not in review]
    same_day = _same_day
    real = lambda s: norm_merchant(s) - GENERIC - {"اسواق"}   # "markets" is generic here: the ASDAF alias maps to it
    close = lambda g, r: same_day(g, r) and _amount_diff(g, r) <= tol   # ambiguity is judged on this alone, support or not
    def names(g, r):   # the receipt names the row's shop
        A, B = real_merchant_tokens(g), real(r["merchant"])
        return bool(A & B or _prefixes(A) & _prefixes(B))
    def same_minute(g, r):   # printed when the card was charged
        a, b = _receipt_minutes(g), _minutes(r.get("time"))
        return a is not None and b is not None and abs(a - b) <= 2
    def near(g, r):   # a candidate link: close, within 10% of the row, and the merchant overlaps, the clock agrees or the healer was confident
        return close(g, r) and _amount_diff(g, r) <= 0.10 * r["amount"] and (names(g, r) or same_minute(g, r) or (g.get("confidence") or 0) >= 0.7)
    all_rows = [r for r in rows if r["kind"] == "purchase"]
    for g in left:   # unique both ways against EVERY same-day row/group, not only leftovers: a taken near-twin means ambiguity
        c = [r for r in left_rows if close(g, r) and _amount_diff(g, r) <= 0.10 * r["amount"]]
        twins = [r for r in all_rows if close(g, r)]
        if len(c) == 1 and (len(twins) == 1 or [r for r in twins if names(g, r)] == c) and sum(close(h, c[0]) for h in groups) == 1:
            if near(g, c[0]): links[g["id"]] = c[0]["ref"]; LINK_HOW[g["id"]] = {"rule": "near"}
            else: review[g["id"]] = [(c[0]["ref"], 0)]   # unique but unsupported: a human decides, never a silent miss
            left_rows.remove(c[0])
    left = [g for g in left if not links.get(g["id"]) and g["id"] not in review]
    for g in left:
        f = g.get("fields") or {}
        has_total = any(a["total_candidate"] for a in g["amounts"]) or any(isinstance(f.get(k), (int, float)) for k in ("total", "card_slip_amount"))
        if has_total or not (f.get("merchant") and f.get("date")): continue   # "no total was read", not "no amount at all": stray amounts must not block the suggestion
        toks = real(" ".join(_merchants(g)))   # healer merchant plus derived candidates, like score() does
        c = [r for r in left_rows if r["date"] == f["date"] and (toks & real(r["merchant"]) or _prefixes(toks) & _prefixes(real(r["merchant"])))]
        if len(c) == 1: review[g["id"]] = [(c[0]["ref"], 0)]; left_rows.remove(c[0])
    for gid in emptied:
        if not links.get(gid) and gid not in review: review[gid] = []
    return links, review

def tag_inquiries(statement):
    """Codes 30/35 are balance inquiries: no money moves. Step A files them as ATM rows; they are not withdrawals."""
    for r in statement:
        if r.get("kind") == "atm" and r.get("txn_code") in ("30", "35") and not r.get("amount"):
            r["kind"] = "inquiry"
    return statement

def tie_out_ledger(statement, ledger, month="2026-09"):
    led = [l for l in ledger if l["month"] == month]
    loads = [r for r in statement if r["kind"] == "load"]; atm = [r for r in statement if r["kind"] == "atm"]; purch = [r for r in statement if r["kind"] == "purchase"]
    topups = [l for l in led if l["debit"] and re.search(r"top ?up|payment to|reconciliation - top", l["text"], re.I)]
    withdrawals = [l for l in led if l["credit"] and re.search(r"cash withdrawal", l["text"], re.I)]
    rollup = [l for l in led if l["credit"] and re.search(r"petty cash for|petty cash expenses", l["text"], re.I) and l["credit"] > 1000]
    small = [l for l in led if l["credit"] and l not in rollup and l not in withdrawals]
    status = {f"{l['code']}|{l['text']}": "UNEXPLAINED" for l in led}   # every month line gets a status; the classifiers below upgrade it
    used = set()
    row_status = {r["ref"]: "UNEXPLAINED" for r in loads + atm}
    row_ledger = {}
    for l in topups:
        hit = next((r for r in loads if r["ref"] not in used and r["amount"] == l["debit"] and _days(r["date"], l["date"]) <= 2), None)
        if hit: used.add(hit["ref"]); row_status[hit["ref"]] = "TIED"; row_ledger[hit["ref"]] = l["code"]
        status[f"{l['code']}|{l['text']}"] = "TIED" if hit else "UNEXPLAINED"
    atm_used = set()
    for l in withdrawals:
        hit = next((r for r in atm if r["ref"] not in atm_used and r["amount"] == l["credit"] and _days(r["date"], l["date"]) <= 2), None)
        if hit: atm_used.add(hit["ref"]); row_status[hit["ref"]] = "TIED"; row_ledger[hit["ref"]] = l["code"]
        status[f"{l['code']}|{l['text']}"] = "TIED" if hit else "UNEXPLAINED"
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
        "small_credits": small_credits, "ledger_status": status, "row_status": row_status, "row_ledger": row_ledger,
    }

# file names cited in the report; main() replaces them with config()["names"] (git-ignored client data)
STATEMENT_FILE, RECEIPTS_FILE, LEDGER_FILE = "statement.pdf", "receipts.pdf", "ledger.xlsx"

def _receipt_cites(g):
    # a collapsed record carries one (page, box) per crop id (ids[k] <-> boxes[k])
    return [{"file": RECEIPTS_FILE, "page": p, "group_id": gid, "box": box, "crop": f"crops/{gid}.png"}
            for gid, (p, box) in zip(g.get("ids") or [g["id"]], g.get("boxes") or [(g["page"], g.get("box"))])]

def _invoiced(gs, paid):
    """What the linked invoice(s) say was due: each record's total (QR, person or AI read), else, for a record with no total, the read amount
    nearest the payment. None when a record has no amount at all."""
    total = 0.0
    if any(not _is_slip(g) for g in gs): gs = [g for g in gs if not _is_slip(g)]   # a card slip is the payment, not an invoice
    for g in gs:
        t = (g.get("fields") or {}).get("total")
        if isinstance(t, (int, float)): total += t; continue
        amts = receipt_amounts(g)
        if not amts: return None
        total += min(amts, key=lambda a: abs(a - paid)) if len(gs) == 1 else min(amts)
    return _r2(total)

def assign_statuses(statement, groups, links, review, tieout, ledger, other_month=(), month=None, duplicates=()):
    led = {l["code"]: l for l in ledger}
    rollup = (tieout["purchases_vs_rollup"]["rollup_codes"] or [None])[0]
    def ledger_cite(code, relation):
        l = led.get(code)
        return l and {"file": LEDGER_FILE, "sheet": l["sheet"], "row": l["row"], "cell": l["cell"], "code": code, "date": l["date"],
                      "amount": l["debit"] or l["credit"], "relation": relation}
    by_id = {g["id"]: g for g in groups}
    by_ref = {}
    for gid, v in links.items():
        for ref in _refs(v): by_ref.setdefault(ref, []).append(gid)
    review_refs = {r for cands in review.values() for r, _ in cands}
    rows = []
    for r in statement:
        row = {**r, "receipt_ids": by_ref.get(r["ref"], []), "status": None, "reason": ""}
        if r["kind"] == "inquiry":
            row["status"] = "INQUIRY"; row["reason"] = "balance inquiry, no money moved"
        elif r["kind"] != "purchase":
            row["status"] = tieout["row_status"].get(r["ref"], "UNEXPLAINED")
            row["ledger_code"] = tieout["row_ledger"].get(r["ref"]) if row["status"] == "TIED" else None
            row["reason"] = f"tied to ledger {row['ledger_code']}" if row["ledger_code"] else "no ledger top-up/withdrawal matches this row"
            if r["kind"] == "atm" and row["status"] != "TIED" and rollup:
                # no withdrawal line this month: the cash went on cash receipts, which the month's roll-up entry books
                row["status"] = "ATM_CASH"; row["reason"] = f"cash withdrawn; spent on cash receipts booked in {rollup}"
        elif row["receipt_ids"]:
            # MATCHED only when what the invoice(s) say equals what the card paid, to the halala; any difference is a proposal for a person
            gs = [by_id[i] for i in row["receipt_ids"]]
            refs = sorted({x for g in gs for x in _refs(links.get(g["id"]))}, key=lambda x: next(s.get("time") or "" for s in statement if s["ref"] == x))
            parts = [next(x for x in statement if x["ref"] == ref)["amount"] for ref in refs]
            paid, invoiced = _r2(sum(parts)), _invoiced(gs, _r2(sum(parts)))
            diff = None if invoiced is None else _r2(paid - invoiced)
            row["paid"], row["invoiced"], row["difference"] = paid, invoiced, diff
            row["status"] = "MATCHED" if diff == 0 else "AMOUNT_MISMATCH"
            rr = RULES.get("rounding")
            if diff and rr and abs(diff) <= rr["max"] + 1e-9 and (rr.get("applies") == "either" or diff < 0):
                row["rounding_rule"] = {"max": rr["max"], "applies": rr.get("applies", "card_less"), "by": common.author_name(rr.get("by")), "at": rr.get("at")}
            what = ", ".join(f"{g['id']} p{g['page']}" for g in gs)
            split = f" (split payment: {' + '.join(f'{p:.2f}' for p in parts)})" if len(parts) > 1 else ""
            row["reason"] = f"receipt {what}{split}" + ("" if diff == 0 else f" (total differs by {abs(diff):.2f})" if diff is not None else " (invoice total not read)")
        elif r["ref"] in review_refs:
            row["status"] = "REVIEW"; row["reason"] = "candidate receipts need a human pick"
        else:
            row["status"] = "MISSING_RECEIPT"; row["reason"] = "no receipt with this amount (±0.05 needs date/merchant support) within ±1 day"
        row["citations"] = {
            "statement": {"file": STATEMENT_FILE, "page": 1, "ref": r["ref"], "y": r.get("y"), "orange": r.get("orange"), "crop": r.get("crop"), "box": r.get("box")},
            "receipts": [c for i in row["receipt_ids"] for c in _receipt_cites(by_id[i])],
            "ledger": ledger_cite(rollup, "rolled-up") if r["kind"] == "purchase" or row["status"] == "ATM_CASH"
                      else ledger_cite(row.get("ledger_code"), "tied")}
        rows.append(row)
    cite_by_ref = {row["ref"]: row["citations"] for row in rows}
    receipts = []
    for g in groups:
        refs = _refs(links.get(g["id"])); ref = refs[0] if refs else None
        st = "LINKED" if ref else "REVIEW" if g["id"] in review else "ORPHAN"
        rc = cite_by_ref.get(ref) or {}
        receipts.append({**g, "ref": ref, "refs": refs, "status": st, "review": review.get(g["id"], []),
                         "citations": {"receipt": _receipt_cites(g), "statement": rc.get("statement"), "ledger": rc.get("ledger")},
                         "reason": "linked" if ref else "ambiguous or weak candidates" if st == "REVIEW" else "no statement row with this amount (cash purchase? wrong total?)"})
    from datetime import datetime
    month = month or (statement[0]["date"][:7] if statement else None)   # the statement is the period
    label = datetime.strptime(month, "%Y-%m").strftime("%B %Y") if month else "the period"
    for g in other_month:
        f = g.get("fields") or {}
        d = f.get("date") or (g["dates"][0] if g["dates"] else "?")
        receipts.append({**g, "ref": None, "refs": [], "status": "OTHER_MONTH", "review": [],
                         "citations": {"receipt": _receipt_cites(g), "statement": None, "ledger": None},
                         "reason": f"dated {d}, outside {label}: another month's pack, or a wrong date on the receipt"})
    for g in duplicates:
        first = next((r for r in receipts if r["id"] == g["duplicate_of"]), {})
        receipts.append({**g, "ref": None, "refs": [], "status": "DUPLICATE", "review": [],
                         "citations": {"receipt": _receipt_cites(g), "statement": (first.get("citations") or {}).get("statement"), "ledger": (first.get("citations") or {}).get("ledger")},
                         "reason": f"second copy of {g['duplicate_of']} p{first.get('page', '?')} (invoice {(g.get('fields') or {}).get('invoice_no')})"})
    return rows, receipts

RECEIPT_OVERRIDE_STATUSES = {"CASH", "OTHER_CARD", "PART"}

def apply_receipt_overrides(receipts, overrides):
    """overrides.json's receipts section: a reviewer's verdict for a receipt the card statement cannot explain.
    CASH (paid in cash), OTHER_CARD (paid with a card that is not the petty-cash card) or PART (a fragment of another
    document's crop, e.g. a header or stamp; c_report leaves these out). Linked and duplicate receipts are never changed."""
    fixes = (overrides or {}).get("receipts") or {}
    known = {g["id"] for g in receipts}
    for gid in fixes:
        if gid not in known: print(f"override: unknown receipt id {gid}", file=sys.stderr)
    for g in receipts:
        fx = fixes.get(g["id"])
        if not fx: continue
        if fx.get("status") not in RECEIPT_OVERRIDE_STATUSES:
            print(f"override: {g['id']} status {fx.get('status')!r} ignored", file=sys.stderr); continue
        if g["status"] in ("LINKED", "DUPLICATE"):
            print(f"override: {g['id']} is {g['status']}, receipt override ignored", file=sys.stderr); continue
        who = _author(fx)
        if fx["status"] != "PART" and override_kind(who) == "unattributed":
            # a payment verdict nobody signed is not applied: it waits for a person in the review queue
            g["proposal"] = {"status": fx["status"], "reason": fx.get("reason"), **who}; continue
        g["status"] = fx["status"]; g["reason"] = fx.get("reason") or g["reason"]; g["review"] = []; g["decided_by"] = who
        if fx.get("part_of"): g["part_of"] = fx["part_of"]
    return receipts

STRENGTH = {"qr": "machine", "ai_qr": "machine", "human": "human", "ai_check": "ai", "unattributed": "unattributed", "ai": "ai"}
SOURCE_WORD = {"qr": "from the invoice's ZATCA QR code (the parsed read was missing or too weak to use)",
               "ai_qr": "read from the parsed invoice and confirmed by its ZATCA QR code",
               "human": "entered by {by}", "ai_check": "read from the page by {by}",
               "unattributed": "entered by hand (author not recorded)", "ai": "read from the parsed invoice by AI at {conf} confidence"}

VAT_RATE = 0.15
VAT_TOLERANCE = 0.02   # VAT = total x 15/115 to within 2 halalas: shops round line by line
VAT_NO = re.compile(r"(?<!\d)3\d{13}3(?!\d)")   # a whole 15-digit number: digits run together across a line break are not one
BUYER_VAT = [None]     # the buyer's own VAT number: printed on most invoices, so never mistaken for the seller's
RULES = {}             # rules a person set in the app (overrides.json "rules")
TEXT_OF = {}           # each piece's parsed text, by group id, for the seller's VAT number
AMOUNTS_OF = {}        # each piece's parsed amounts, by group id (a recorded fragment's are its document's too)

def buyer_vat(texts):
    import collections
    c = collections.Counter(m for t in texts for m in set(VAT_NO.findall(common.ascii_digits(t or ""))))
    return c.most_common(1)[0][0] if c else None

def seller_vat(g, text_of):
    """The seller's VAT number: a person's entry first, then the QR code, then the one printed on the invoice that is not the buyer's."""
    o = g.get("override") or {}
    if "vat_no" in (o.get("fields") or []) and override_kind(o) == "human" and (g.get("fields") or {}).get("vat_no"): return g["fields"]["vat_no"], "person"
    if g.get("qr") and g["qr"].get("vat_no"): return g["qr"]["vat_no"], "qr"
    found = sorted({m for i in g.get("ids") or [g["id"]] for m in VAT_NO.findall(common.ascii_digits(text_of.get(i) or ""))} - {BUYER_VAT[0]})
    return (found[0], "parsed") if len(found) == 1 else (None, "ambiguous" if found else None)

def _digits_apart(a, b):
    """Edit distance: a misread drops, adds or swaps a digit or two (300188493310003 read as 300184933130003)."""
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]

def _distinct(nos):
    """How many different numbers, counting a misread (a few edits away) as the number it misreads."""
    reps = []
    for n in sorted(nos):
        if not any(_digits_apart(n, r) <= 3 for r in reps): reps.append(n)
    return len(reps)

def _vendor_name(name):
    """A whole vendor name, folded for comparison: two invoices are the same vendor only when the whole name agrees, never on one word."""
    return re.sub(r"[^a-z0-9\u0600-\u06ff]", "", _fold(name or ""))

def vendor_vat_numbers(receipts, rows_by_ref, buyer_words=()):
    """A vendor's VAT number, carried to its invoices that do not show one. Invoices are the same vendor when they were paid at the same
    card terminal (the statement's merchant text), or carry the same whole vendor name (as read, or as their QR code gives it); the buyer's
    own name never links anything. The vendor's number is the one its QR code gives, else the one read most often; numbers a few digits
    from it are misreads of it, and are shown as such. A vendor showing two genuinely different numbers lends nothing: a person decides."""
    own = {g["id"]: (g.get("seller_vat") or {}).get("no") for g in receipts}
    via_qr = {g["id"] for g in receipts if (g.get("seller_vat") or {}).get("source") in ("qr", "person")}   # machine-read or a person's: outweigh any reading
    keys = {}
    for g in receipts:
        ks = {f"terminal:{rows_by_ref[r]['merchant']}" for r in g.get("refs") or [] if r in rows_by_ref}
        for n in ((g.get("fields") or {}).get("merchant"), (g.get("qr") or {}).get("seller")):
            v = _vendor_name(n)
            if len(v) >= 6 and not any(w in v for w in buyer_words): ks.add(f"name:{v}")
        keys[g["id"]] = ks
    seen = {}
    for gid, ks in keys.items():
        for k in ks:
            if own[gid]: seen.setdefault(k, set()).add(own[gid])
    # a terminal or name seen with two different numbers is shared by two sellers (one terminal, two shops): it links nothing
    for gid in keys: keys[gid] = {k for k in keys[gid] if _distinct(seen.get(k, ())) < 2}
    # each number counts once per invoice it is printed on (a number repeated on one page is one reading)
    reads_of = {g["id"]: sorted({n for i in g.get("ids") or [g["id"]] for n in VAT_NO.findall(common.ascii_digits(TEXT_OF.get(i) or "")) if n != BUYER_VAT[0]}) for g in receipts}
    parent = {gid: gid for gid in keys}
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    first = {}
    for gid, ks in keys.items():
        for k in ks:
            if k in first: parent[find(gid)] = find(first[k])
            else: first[k] = gid
    groups = {}
    for gid in keys: groups.setdefault(find(gid), []).append(gid)
    by_id = {g["id"]: g for g in receipts}
    for members in groups.values():
        # every number read on the group's pages counts (the QR's above all), so the one read most often wins over a one-off misread
        reads = [(own[m], True, m) for m in members if m in via_qr] + [(n, False, m) for m in members if m not in via_qr for n in reads_of[m]]
        if not reads: continue
        # cluster numbers a few digits apart (one number, misread); the cluster's number: the QR's, else the most often read
        clusters = []
        for no, qr, m in sorted(reads, key=lambda x: (not x[1], x[2])):
            c = next((c for c in clusters if any(_digits_apart(no, r[0]) <= 3 for r in c["reads"])), None)
            if c: c["reads"].append((no, qr, m))
            else: clusters.append({"no": no, "first": no, "reads": [(no, qr, m)]})
        for c in clusters:
            counts = {}
            for no, qr, m in c["reads"]: counts[no] = counts.get(no, 0) + (100 if qr else 1)
            ranked = sorted(counts.items(), key=lambda x: -x[1])
            c["no"] = ranked[0][0] if len(ranked) == 1 or ranked[0][1] > ranked[1][1] else None
        if len(clusters) > 1 or clusters[0]["no"] is None:
            cands = sorted({no for no, _, _ in reads})
            for m in members:
                if not own[m] or len(clusters) == 1: by_id[m]["seller_vat"] = {"no": None, "source": "vendor_ambiguous", "candidates": cands}
            continue
        no = clusters[0]["no"]; donors = sorted({m for n, _, m in clusters[0]["reads"] if n == no})
        for m in members:
            g = by_id[m]; shared = sorted(k.split(":", 1)[1] for k in keys[m] & {k for d in donors for k in keys[d]})
            if not own[m] and (g.get("seller_vat") or {}).get("source") == "ambiguous":
                # two numbers printed on this invoice, both readings of the vendor's own: the vendor's number, the other noted as a misread
                odd = [n for n in reads_of[m] if n != no]
                if all(_digits_apart(n, no) <= 3 for n in odd):
                    g["seller_vat"] = {"no": no, "source": "vendor", "from": donors[:3], "via": shared[:2], **({"read_as": odd[0]} if odd else {})}
            elif not own[m]:
                g["seller_vat"] = {"no": no, "source": "vendor", "from": donors[:3], "via": shared[:2]}
            elif own[m] and own[m] != no:
                g["seller_vat"] = {"no": no, "source": "vendor", "from": donors[:3], "via": shared[:2], "read_as": own[m]}

_VAT_LABEL = re.compile(r"الرقم الضريبي|رقم تسجيل ضريبة القيمة المضافة|رقم التسجيل الضريبي|الرقم المميز|رقم ضريبي|VAT\s*(?:Reg\w*\.?\s*)?(?:No|Number|#|ID)|"
                        r"Tax\s*(?:Reg\w*\s*)?(?:No|Number)|\bTIN\b|\bTRN\b", re.I)
_BUYER_LABEL = re.compile(r"عميل|مشتري|customer|buyer|cust", re.I)   # the root, so "للعميل" (for the customer) counts too

def _doc_text(g):
    return "\n".join(TEXT_OF.get(i) or "" for i in g.get("ids") or [g["id"]])

def printed_vat(g):
    """The VAT as printed on the invoice: an amount on any piece of it (its header, its footer: the healer read some pieces separately)
    equal to 15% of the net on its total. Found, it is the invoice's own VAT figure, not a calculation."""
    f = g.get("fields") or {}
    t = f.get("total")
    amounts = sorted({a["value"] for a in g.get("amounts") or []})
    if not isinstance(t, (int, float)) and len(amounts) == 1: t = amounts[0]   # one amount and no total line: that amount is the total
    if not isinstance(t, (int, float)) or t <= 0: return None
    expected = round(t * VAT_RATE / (1 + VAT_RATE), 2)
    text = common.ascii_digits(_doc_text(g))
    # amounts as printed: 109.50, 109.5 (Alwan prints one decimal) or 109
    found = set(common.find_amounts(text)) | {float(m) for m in re.findall(r"(?<![\d.])(\d{1,6}(?:\.\d)?)(?![\d.])", text)}
    found |= {a for i in g.get("ids") or [g["id"]] for a in AMOUNTS_OF.get(i, [])} | {a["value"] for a in g.get("amounts") or []}
    hits = [a for a in found if abs(a - expected) <= VAT_TOLERANCE and a > 0]
    return min(hits, key=lambda a: abs(a - expected)) if hits else None

def labelled_vat_number(g):
    """A number printed beside a VAT-number label (Arabic or English) that is not the buyer's: a candidate for a person to confirm in the Edit
    form when no valid number was found. It may be a misread; it is never used on its own."""
    text = common.ascii_digits(_doc_text(g))
    for m in _VAT_LABEL.finditer(text):
        if _BUYER_LABEL.search(text[max(0, m.start() - 25):m.end() + 12]): continue
        near = text[max(0, m.start() - 45):m.end() + 45]
        for d in re.findall(r"(?<!\d)3[\d ]{13,18}\d(?!\d)", near):
            d = re.sub(r"\s", "", d)
            if len(d) == 15 and d != BUYER_VAT[0]: return d
    return None

def vat_label_without_digits(g):
    """The seller's VAT-number label is printed but the parse holds no number after it: the parser dropped the digits (often Arabic
    numerals, p60). Said plainly, so a person reads that one number from the page instead of searching the invoice."""
    text = common.ascii_digits(_doc_text(g))
    for m in _VAT_LABEL.finditer(text):
        if _BUYER_LABEL.search(text[max(0, m.start() - 25):m.end() + 12]): continue
        if not re.search(r"\d{10,}", re.sub(r"\s", "", text[m.end():m.end() + 40])): return True
    return False

def vat_check(g):
    """The arithmetic: VAT is 15% of the net, so VAT = total x 15/115. ok, zero (no VAT charged), mismatch, or missing."""
    f = g.get("fields") or {}
    t, v = f.get("total"), f.get("vat")
    amounts = sorted({a["value"] for a in g.get("amounts") or []})
    if not isinstance(t, (int, float)) and len(amounts) == 1 and not g.get("unreadable"): t = amounts[0]
    if not isinstance(t, (int, float)): return {"status": "missing", "why": "no total"}
    if not isinstance(v, (int, float)): return {"status": "missing", "why": "no VAT figure read", "total": t}
    expected = round(t * VAT_RATE / (1 + VAT_RATE), 2)
    if v == 0: return {"status": "zero", "total": t, "vat": v, "expected": expected}
    return {"status": "ok" if abs(v - expected) <= VAT_TOLERANCE else "mismatch", "total": t, "vat": v, "expected": expected}

def rules_of(overrides):
    """The rounding rule a person set in the app: accept a card payment up to `max` SAR below the invoice ("card_less") or either way."""
    r = ((overrides or {}).get("rules") or {}).get("rounding") or {}
    try: mx = float(r.get("max") or 0)
    except (TypeError, ValueError): mx = 0
    return {"rounding": {**r, "max": mx}} if mx > 0 and r.get("by") else {}

def _who(a):
    return a.get("by") or "author not recorded"

def receipt_evidence(g, rows_by_ref):
    """What the report knows about one receipt and how: the amount's source, the QR, how it was paid. Each item names its strength:
    machine (bank statement, decoded QR, ledger cell), human (a named person), ai (an AI read or proposal), unattributed, missing."""
    ev = []
    src = g.get("amount_source") or "ai"
    if g.get("unreadable"):
        ev.append({"what": "amount", "text": f"Amount withheld: {g['unreadable']}", "strength": "missing"})
    else:
        t = (g.get("fields") or {}).get("total")
        word = SOURCE_WORD[src].format(by=_who(g.get("override") or {}), conf=f"{g.get('confidence') or 0:.2f}")
        ev.append({"what": "amount", "text": f"Total {t:.2f}, {word}" if isinstance(t, (int, float)) else f"No total; amounts {word}", "strength": STRENGTH[src],
                   **({"reason": g["override"]["reason"]} if src in ("human", "ai_check", "unattributed") and (g.get("override") or {}).get("reason") else {})})
    if g.get("qr_conflict"):
        c = g["qr_conflict"]
        ev.append({"what": "qr", "text": f"The parsed invoice reads {c['read']:.2f}; its QR code says {c['qr']:.2f}. " + ("A person's total is kept; check it." if c["kept"] == "human" else "Neither is used until a person checks the invoice."), "strength": "conflict"})
    vc = g.get("vat_check") or {}
    if vc.get("status") == "ok":
        o = g.get("override") or {}
        by_ai = "vat" in (o.get("fields") or []) and override_kind(o) == "ai_check"
        where = f"read off the page image by {o['by']} (the parser missed it)" if by_ai \
            else "printed on another part of the invoice" if g.get("vat_printed") else "read from the invoice"
        ev.append({"what": "vat", "text": f"VAT {vc['vat']:.2f} {where}; it is 15% of the net: {vc['total']:.2f} x 15/115 = {vc['expected']:.2f}", "strength": "ai" if by_ai else "rule",
                   **({"reason": o["reason"]} if by_ai and o.get("reason") else {})})
    elif vc.get("status") == "mismatch":
        ev.append({"what": "vat", "text": f"VAT does not add up: the invoice reads {vc['vat']:.2f}, but 15% of the net on a {vc['total']:.2f} total is {vc['expected']:.2f}. A person should read the invoice", "strength": "conflict"})
    elif vc.get("status") == "zero":
        ev.append({"what": "vat", "text": "No VAT charged on this invoice", "strength": "rule"})
    elif vc.get("status") == "missing" and not g.get("unreadable") and vc.get("why") == "no VAT figure read":
        ev.append({"what": "vat", "text": "No VAT figure found on the parsed invoice, so none is claimed. If the paper shows VAT, enter it with Edit", "strength": "missing"})
    elif vc.get("status") == "missing" and not g.get("unreadable"):
        ev.append({"what": "vat", "text": f"No total read on the invoice ({vc.get('why')})", "strength": "missing"})
    sv = g.get("seller_vat") or {}
    if sv.get("source") == "vendor":
        how = f"(same vendor: {' / '.join(sv['via']) or 'linked through its other invoices'})"
        ev.append({"what": "seller", "text": (f"Seller VAT number {sv['no']}: this invoice reads {sv['read_as']}, a few digits off, so a misread; the vendor's number on "
                   if sv.get("read_as") else f"Seller VAT number {sv['no']}: not printed on this invoice, taken from the same vendor's invoice ")
                   + f"{', '.join(sv['from'])} {how}", "strength": "rule"})
    elif sv.get("no"):
        ev.append({"what": "seller", "text": f"Seller VAT number {sv['no']} ({'from the QR code' if sv['source'] == 'qr' else 'printed on the invoice'})", "strength": "machine" if sv["source"] == "qr" else "ai"})
    elif sv.get("source") == "vendor_ambiguous":
        ev.append({"what": "seller", "text": f"This vendor's invoices show different VAT numbers ({', '.join(sv['candidates'])}): a person must say which applies here", "strength": "missing"})
    elif sv.get("source") == "ambiguous":
        ev.append({"what": "seller", "text": "More than one VAT number is printed on this invoice and none is the buyer's: a person must say which is the seller's", "strength": "missing"})
    elif g.get("vat_no_dropped"):
        ev.append({"what": "seller", "text": "The invoice prints the seller's VAT number beside its label (الرقم الضريبي), but the parser did not capture the digits: read it from the page with Edit", "strength": "missing"})
    else:
        ev.append({"what": "seller", "text": "Seller VAT number not found on this invoice or the same vendor's other invoices", "strength": "missing"})
    if g.get("qr"):
        q = g["qr"]
        ev.append({"what": "qr", "text": f"ZATCA QR decoded: seller VAT {q['vat_no'] or 'none'}, total {q['total']}, VAT {q['vat']}, issued {q['time']}", "strength": "machine"})
        if q.get("signature") == "verified":
            ev.append({"what": "signature", "text": f"Phase-2 QR: the seller device's signature of the invoice hash verifies ({q.get('signature_scheme')}). "
                       "The code is the device's, unaltered; the total itself is proven only by the XML e-invoice", "strength": "machine"})
        elif q.get("signature") == "not_checked":
            ev.append({"what": "signature", "text": "Phase-2 QR: its signature could not be checked from the QR alone (it may cover the XML's signed "
                       "properties). Not treated as invalid; check the e-invoice if it matters", "strength": "missing"})
    else:
        ev.append({"what": "qr", "text": "No ZATCA QR code decoded on this receipt", "strength": "missing"})
    o = g.get("override")
    if o and src not in ("human", "ai_check", "unattributed") and o["fields"]:
        ev.append({"what": "override", "text": f"{', '.join(o['fields'])} changed by hand ({_who(o)})", "strength": "human" if override_kind(o) == "human" else override_kind(o), **({"reason": o["reason"]} if o["reason"] else {})})
    refs = g.get("refs") or []
    if refs:
        how = LINK_HOW.get(g["id"], {})
        parts = [rows_by_ref[r] for r in refs if r in rows_by_ref]
        line = " + ".join(f"{p['amount']:.2f} on {p['date']} {(p.get('time') or '')[:5]} (ref {p['ref']})" for p in parts)
        ev.append({"what": "payment", "text": f"Paid by the petty-cash card: {line}", "strength": "machine"})
        rule = how.get("rule")
        if rule == "override":
            ev.append({"what": "link", "text": f"Linked by hand ({_who(how)})", "strength": override_kind(how), **({"reason": how["reason"]} if how.get("reason") else {})})
        elif rule:
            ev.append({"what": "link", "text": LINK_RULE_WORD.get(rule, rule), "strength": "rule"})
    elif g["status"] in ("CASH", "OTHER_CARD"):
        d = g.get("decided_by") or {}
        word = "Paid in cash" if g["status"] == "CASH" else "Paid with another card"
        if override_kind(d) == "human":
            ev.append({"what": "payment", "text": f"{word}: decided by {_who(d)}", "strength": "human", **({"reason": d["reason"]} if d.get("reason") else {})})
        else:
            ev.append({"what": "payment", "text": f"{word}: classified from what the receipt shows, by {_who(d)}. A person can change it in the review queue",
                       "strength": "ai", **({"reason": d["reason"]} if d.get("reason") else {})})
    elif g["status"] == "DUPLICATE":
        ev.append({"what": "payment", "text": g.get("reason") or "second copy", "strength": "rule"})
    else:
        ev.append({"what": "payment", "text": "No payment found on the petty-cash card statement, and no payment proof recorded", "strength": "missing"})
    if g.get("proposal"):
        p = g["proposal"]
        ev.append({"what": "proposal", "text": f"Proposed, not applied: {'paid in cash' if p['status'] == 'CASH' else 'paid with another card' if p['status'] == 'OTHER_CARD' else p['status']} ({_who(p)})", "strength": "ai" if override_kind(p) == "ai_check" else override_kind(p), **({"reason": p["reason"]} if p.get("reason") else {})})
    return ev

LINK_RULE_WORD = {"slip_ref": "The card slip on the receipt prints this payment's reference number", "score": "Matched on amount, date and shop", "sequential": "Matched by invoice-number order among same-day payments at the same shop",
                  "split": "One invoice paid in two card payments that add up to its total", "bundle": "Several invoices paid together; the card payments add up to their sum",
                  "elimination": "The only candidate left after the other receipts were matched", "near": "Same shop and day, amount close but not equal: a proposal for a person"}

def basis(status, row=None):
    """The verdict's footing: agreed (independent sources agree exactly), rule (a difference inside a rule a person set), proposed (a person
    must accept), human (a named person decided), needs_evidence (something is missing)."""
    if row and row.get("rounding_rule"): return "rule"
    return {"MATCHED": "agreed", "TIED": "agreed", "INQUIRY": "agreed", "DUPLICATE": "agreed", "LINKED": "agreed",
            "AMOUNT_MISMATCH": "proposed", "REVIEW": "proposed", "CASH": "human", "OTHER_CARD": "human"}.get(status, "needs_evidence")

def row_evidence(row, by_id):
    ev = [{"what": "statement", "text": f"Card statement: {row['amount']:.2f} on {row['date']} {(row.get('time') or '')[:5]}, ref {row['ref']}", "strength": "machine"}]
    if row.get("receipt_ids"):
        for gid in row["receipt_ids"]:
            g = by_id.get(gid)
            if g: ev += [dict(e, receipt=gid) for e in receipt_evidence(g, {}) if e["what"] in ("amount", "qr", "link", "override")]
        rr = row.get("rounding_rule")
        if row.get("difference") and rr:
            ev.append({"what": "difference", "text": f"The card paid {row['paid']:.2f}; the invoice says {row['invoiced']:.2f}. The {abs(row['difference']):.2f} difference is inside the rounding rule "
                       f"(up to {rr['max']:.2f} SAR{' below the invoice' if rr['applies'] == 'card_less' else ' either way'}) set by {rr.get('by') or 'author not recorded'}", "strength": "rule"})
        elif row.get("difference"):
            ev.append({"what": "difference", "text": f"The card paid {row['paid']:.2f}; the invoice says {row['invoiced']:.2f}. Not accepted until a person does.", "strength": "missing"})
    elif row["status"] == "MISSING_RECEIPT":
        ev.append({"what": "receipt", "text": "No receipt in the pack for this payment", "strength": "missing"})
    elif row["status"] == "REVIEW":
        ev.append({"what": "receipt", "text": "Receipts in the pack could be this payment, but none is certain", "strength": "missing"})
    led = row["citations"].get("ledger")
    if led and led["relation"] == "rolled-up":
        ev.append({"what": "ledger", "text": f"Ledger: the month's expenses are one lump sum, {led['code']} (cell {led['cell']}, {led['amount']:,.2f}). It lists no invoices, "
                   "so this payment cannot be matched to a ledger line; only the month's total can be tied", "strength": "missing"})
    elif led:
        ev.append({"what": "ledger", "text": f"Ledger {led['code']} cell {led['cell']} ({led['amount']:,.2f}) matches this line", "strength": "machine"})
    return ev

def main():
    global STATEMENT_FILE, RECEIPTS_FILE, LEDGER_FILE
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/abujhd"); a = ap.parse_args(); common.set_data(a.data)
    cfg = common.config(); STATEMENT_FILE, RECEIPTS_FILE, LEDGER_FILE = (cfg["names"][k] for k in ("statement", "receipts", "ledger"))
    statement = tag_inquiries(load_json(common.DATA / "statement.json")); ledger = load_json(common.DATA / "ledger.json"); groups = load_json(common.DATA / "groups.json")
    overrides = load_json(common.DATA / "overrides.json") if (common.DATA / "overrides.json").exists() else {}
    text_of = {g["id"]: "\n".join(filter(None, [g.get("text"), g.get("notes")])) for g in groups}   # the parser's description of a piece is parsed content too
    raw_groups = [dict(g, amounts=list(g.get("amounts") or [])) for g in groups]
    groups = collapse_fragments(collapse_card_slips(apply_group_overrides(groups, overrides), statement))
    for g in groups:   # 12-digit references printed anywhere on the record's pieces (a stapled slip's RRN), for the slip_ref rule
        g["printed_refs"] = sorted({x for i in g.get("ids") or [g["id"]] for x in re.findall(r"\b\d{12}\b", text_of.get(i, ""))})
    qr = load_json(common.DATA / "qr.json") if (common.DATA / "qr.json").exists() else None
    if qr is None: print("qr.json missing: run scripts/abujhd/qr_decode.ts first; no QR code counts as decoded", file=sys.stderr)
    part_ids = {k for k, v in ((overrides or {}).get("receipts") or {}).items() if v.get("status") == "PART"}
    loose_qr = attach_qr(groups, qr, part_ids, (overrides or {}).get("qr"))
    RULES.clear(); RULES.update(rules_of(overrides)); TEXT_OF.clear(); TEXT_OF.update(text_of)
    AMOUNTS_OF.clear(); AMOUNTS_OF.update({g["id"]: [a["value"] for a in g.get("amounts") or []] for g in raw_groups})
    # a recorded fragment's text (a header, a stamp: overrides.json PART, "part of the document read as pX-gY") is that document's text too
    for fid, fx in ((overrides or {}).get("receipts") or {}).items():
        m = re.search(r"read as (p\d+-g\d+)", fx.get("reason") or "") if fx.get("status") == "PART" else None
        parent = fx.get("part_of") or (m and m.group(1))
        # every piece merged into the fragment's record belongs to the document too (p19-g4, merged into p19-g3, prints the VAT)
        pieces = next((r.get("ids") for r in groups if fid in (r.get("ids") or [r["id"]])), None) or [fid]
        for piece in pieces:
            if parent and piece in text_of: TEXT_OF[parent] = (TEXT_OF.get(parent) or "") + "\n" + text_of[piece]
            if parent and piece in AMOUNTS_OF: AMOUNTS_OF[parent] = AMOUNTS_OF.get(parent, []) + AMOUNTS_OF[piece]
    BUYER_VAT[0] = buyer_vat(text_of.values())
    parts = [g for g in groups if g["id"] in part_ids]   # recorded fragments of another document: kept out of the matching
    groups = gate_amounts([g for g in groups if g["id"] not in part_ids])
    groups, duplicates = mark_duplicates(groups)
    groups, other_month = split_other_month(groups, cfg["month"], statement)
    links, review = match_receipts(groups, statement, overrides)
    links, review = second_pass(groups, statement, links, review)
    tieout = tie_out_ledger(statement, ledger, cfg["month"])
    rows, receipts = assign_statuses(statement, groups, links, review, tieout, ledger, other_month=other_month, month=cfg["month"], duplicates=duplicates)
    receipts += [{**g, "ref": None, "refs": [], "status": "ORPHAN", "review": [], "reason": None,
                  "citations": {"receipt": _receipt_cites(g), "statement": None, "ledger": None}} for g in parts]
    receipts = apply_receipt_overrides(receipts, overrides)
    rows_by_ref = {r["ref"]: r for r in rows}; rec_by_id = {g["id"]: g for g in receipts}
    for g in receipts:
        f = g.get("fields") or {}
        linked = [rows_by_ref[x] for x in g.get("refs") or [] if x in rows_by_ref]
        if not isinstance(f.get("total"), (int, float)) and len(linked) == 1 and linked[0]["status"] == "MATCHED" and len(linked[0]["receipt_ids"]) == 1:
            # no total line read, but an amount read on the invoice equals the card payment to the halala: that amount is its total
            f = g["fields"] = {**f, "total": linked[0]["invoiced"]}; g["total_from_match"] = linked[0]["ref"]
        if not isinstance(f.get("vat"), (int, float)):
            pv = printed_vat(g)
            if pv is not None: g["fields"] = {**f, "vat": pv}; g["vat_printed"] = True
        g["vat_check"] = vat_check(g)
        no, src = seller_vat(g, TEXT_OF); g["seller_vat"] = {"no": no, "source": src}
        cand = labelled_vat_number(g)
        if cand and cand != no: g["vat_no_candidate"] = cand
        o = g.get("override") or {}
        if "vat_no" in (o.get("fields") or []) and override_kind(o) != "human" and (g.get("fields") or {}).get("vat_no"):
            # a VAT number someone other than a named person read off the page: offered in the Edit form, never used until a person saves it
            g["vat_no_candidate"] = g["fields"]["vat_no"]; g["vat_no_candidate_by"] = {"by": o.get("by"), "reason": o.get("reason")}
        if not no and vat_label_without_digits(g): g["vat_no_dropped"] = True
    vendor_vat_numbers(receipts, rows_by_ref, [_vendor_name(w) for w in re.split(r"\s+", cfg.get("client") or "") if len(w) >= 4])
    for g in receipts:
        g["evidence"] = receipt_evidence(g, rows_by_ref)
        row_st = {rows_by_ref[x]["status"] for x in g.get("refs") or [] if x in rows_by_ref}
        by_ai = g.get("decided_by") and override_kind(g["decided_by"]) != "human"   # an AI's cash / other-card call is not a person's decision
        g["basis"] = "proposed" if g["status"] == "LINKED" and row_st - {"MATCHED"} or g.get("proposal") or by_ai else basis(g["status"])
        g["link_how"] = LINK_HOW.get(g["id"])
    for r in rows:
        r["evidence"] = row_evidence(r, rec_by_id); r["basis"] = basis(r["status"], r)
    import collections
    ovs = collections.Counter((r["orange"], r["status"]) for r in rows if r["kind"] == "purchase")
    summary = {"rows": dict(collections.Counter(r["status"] for r in rows)), "receipts": dict(collections.Counter(r["status"] for r in receipts))}
    save_json(common.DATA / "matches.json", {"rows": rows, "receipts": receipts, "ledger": ledger, "tieout": tieout, "loose_qr": loose_qr,
                                              "qr_decoder": (qr or {}).get("decoder"), "confidence_min": CONFIDENCE_MIN, "vat_tolerance": VAT_TOLERANCE,
                                              "orange_vs_status": {f"{'orange' if o else 'plain'}|{s}": n for (o, s), n in ovs.items()}, "summary": summary})
    print("rows:", summary["rows"]); print("receipts:", summary["receipts"]); print("tieout:", {k: v for k, v in tieout.items() if k != "ledger_status" and k != "small_credits"})
    for gid, cands in review.items(): print("REVIEW", gid, cands)
    for g in other_month: print("OTHER_MONTH", g["id"], (g.get("fields") or {}).get("date") or g["dates"][:1])
    for g in duplicates: print("DUPLICATE", g["id"], "of", g["duplicate_of"])

if __name__ == "__main__":
    main()
