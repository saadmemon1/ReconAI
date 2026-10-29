# scripts/abujhd/c_report.py
"""Step C: report.json, the UI-shaped copy of matches.json that the app's Report tab renders
(src/components/petty-cash/). Nothing here is styled; coordinates stay in the matcher's 0-1000 page space.
Spec: docs/superpowers/specs/2026-10-23-petty-cash-report-ui-design.md.
"""
import argparse, re, sys, pathlib
from datetime import datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import common
from common import load_json, save_json

ROW_KEYS = ("ref", "amount", "date", "time", "merchant", "kind", "orange", "status", "reason", "receipt_ids", "basis", "evidence", "paid", "invoiced", "difference",
            "rounding_rule")
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


# A card number as a slip prints it: masked, with the first six and last four digits ("513213******6879") or only the last four
# ("***8679"). Saudi VAT numbers (15 digits, ending 0003) and terminal references are unmasked, so they never match.
_MASKED_CARD = re.compile(r"(?<![\d*xX•#])(\d{6})? ?[*xX•#]{2,12} ?(\d{4})(?!\d)")   # one line only: "*** thanks ***\n1289" is not a card


def _card(text):
    """The masked card number printed on a receipt, as {"first6", "last4"}, or None when the receipt shows none. A full mask
    (first six and last four) wins over a bare "***1234" elsewhere on the same receipt."""
    found = list(_MASKED_CARD.finditer(text or ""))
    m = next((x for x in found if x.group(1)), found[0] if found else None)
    return {"first6": m.group(1), "last4": m.group(2)} if m else None


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
            "refs": g.get("refs") or [], "review": g.get("review") or [], "card": _card(g.get("text")),
            "citations": [_cite(c) for c in g["citations"]["receipt"]],
            "basis": g.get("basis"), "evidence": g.get("evidence") or [], "amount_source": g.get("amount_source"),
            "unreadable": g.get("unreadable"), "withheld_amounts": g.get("withheld_amounts"), "proposal": g.get("proposal"),
            "decided_by": g.get("decided_by"), "link_how": g.get("link_how"), "qr": g.get("qr"), "vat": g.get("vat"),
            "vat_check": g.get("vat_check"), "seller_vat": g.get("seller_vat"), "vat_no_candidate": g.get("vat_no_candidate"),
            "vat_no_candidate_by": g.get("vat_no_candidate_by"), "vat_no_dropped": g.get("vat_no_dropped"),
            "override": g.get("override")}


VAT_NO = re.compile(r"^3\d{13}3$")   # a Saudi VAT registration number: 15 digits, first and last 3


SOURCE_WORD = {"person": "entered by {by}", "qr": "from the ZATCA QR code", "parsed": "read from the invoice",
               "ai_page": "read off the page image by {by} (the parser missed it); a person can confirm it with Edit"}


def _person(o):
    return bool(o and o.get("by") and not o.get("proposed") and not common.is_ai_author(o["by"]))


def vat_status(g, finding=None):
    """The VAT on one receipt, accepted from wherever it is found: a person's entry, the ZATCA QR code, the parsed invoice; if no VAT figure
    is found but the total and the seller's VAT number are, it is calculated (total x 15/115). The seller's VAT number may come from the
    same vendor's other invoices. A person is asked only when ReconAI cannot find or calculate it: no total, no seller VAT number, or two
    sources that disagree. A page check (overrides.json "vat", with its author) is a note, never the verdict."""
    f = g.get("fields") or {}
    q = g.get("qr") or {}
    vc = g.get("vat_check") or {}
    sv = g.get("seller_vat") or {}
    o = g.get("override") or {}
    note = None
    if finding:
        word = {"absent": "no QR code on the invoice", "covered": "the QR code is covered (by a stapled slip)", "cut_off": "the QR code is cut off the scan"}.get(finding.get("qr"), finding.get("qr"))
        note = {"text": word, "by": common.author_name(finding.get("by")), "reason": finding.get("reason"), "proposed": bool(finding.get("proposed"))}
    def out(status, amount, source, why):
        return {"status": status, "amount": amount, "source": source, "why": why, "seller_vat": sv.get("no"), **({"finding": note} if note else {})}
    if g["status"] == "DUPLICATE":
        return out("excluded", None, None, "Second copy of an invoice: claim the VAT once, on the first copy")
    if g.get("slip_only"):
        return out("excluded", None, None, f"A card slip, not an invoice: the VAT is on the invoices it pays ({', '.join(g['slip_only'])})")
    if q and (not q.get("vat_no") or q.get("vat") == 0):
        return out("no_vat", 0, "qr", "The QR code shows no seller VAT number or zero VAT: nothing to reclaim")
    total = f.get("total") if isinstance(f.get("total"), (int, float)) else None
    amounts = sorted({a["value"] for a in g.get("amounts") or []})
    if total is None and len(amounts) == 1 and not g.get("unreadable"):
        total = amounts[0]   # one amount on the invoice and no total line read: that amount is the total
    if g.get("unreadable") and not q:
        return out("not_verified", None, None, f"The amount could not be read ({g['unreadable']}): a person must read the invoice or scan its QR code")
    # the VAT figure, by source: a person, the QR, the parsed invoice
    parsed_vat = f.get("vat") if isinstance(f.get("vat"), (int, float)) else None
    if _person(o) and "vat" in (o.get("fields") or []) and parsed_vat is not None:
        vat, src = parsed_vat, "person"
    elif q.get("vat") is not None:
        vat, src = q["vat"], "qr"
        if parsed_vat is not None and abs(parsed_vat - q["vat"]) > 0.02 and not g.get("qr_confirms"):
            return out("check", q["vat"], "qr", f"The invoice reads VAT {parsed_vat:.2f} but its QR code says {q['vat']:.2f}: a person must check")
    elif "vat" in (o.get("fields") or []) and o.get("by") and parsed_vat is not None:
        vat, src = parsed_vat, "ai_page"   # signed, but not a person: said as the AI's reading of the page, never as the parsed invoice
    elif parsed_vat is not None:
        vat, src = parsed_vat, "parsed"
    elif total is not None:
        return out("no_vat", 0, None, "No VAT figure found on the parsed invoice, so none is claimed. If the paper shows VAT, enter it with Edit")
    else:
        return out("not_verified", None, None, "No total could be read: a person must read the invoice or scan its QR code")
    if vat == 0:
        return out("no_vat", 0, src, "The invoice charges no VAT")
    if src == "parsed" and vc.get("status") == "mismatch":
        return out("check", vat, src, f"The VAT does not add up: {vc['vat']:.2f} read, but 15% of the net on a {vc['total']:.2f} total is {vc['expected']:.2f}. A person must read the invoice")
    cand = g.get("vat_no_candidate")
    if sv.get("no") and cand and g.get("vat_no_candidate_by") and cand != sv["no"]:
        return out("not_verified", vat, src, f"VAT {vat:.2f} found, but two readings of the seller's VAT number disagree: the parsed invoice gives {sv['no']}, "
                   f"{common.author_name(g['vat_no_candidate_by'].get('by'))} read {cand} off the page. A person must confirm the number in Edit")
    if not sv.get("no"):
        why = ("this vendor's invoices show different VAT numbers (" + ", ".join(sv.get("candidates") or []) + ")") if sv.get("source") == "vendor_ambiguous" \
            else f"the parser {'dropped its digits' if g.get('vat_no_dropped') else 'misread it'}; {common.author_name((g.get('vat_no_candidate_by') or {}).get('by'))} read {g['vat_no_candidate']} off the page, waiting for a person to confirm it in Edit" if g.get("vat_no_candidate_by") \
            else "it is printed beside its label (الرقم الضريبي) but the parser did not capture the digits" if g.get("vat_no_dropped") \
            else f"the number beside its label reads {g['vat_no_candidate']}, which is not a valid VAT number as parsed (a misread)" if g.get("vat_no_candidate") and not VAT_NO.match(g["vat_no_candidate"]) \
            else "it is not on this invoice or the same vendor's others"
        return out("not_verified", vat, src, f"VAT {vat:.2f} found ({SOURCE_WORD[src].format(by=common.author_name(o.get('by')))}), but not the seller's VAT number: {why}. A person must find it")
    whose = {"qr": "from the QR code", "parsed": "printed on the invoice", "vendor": f"from the same vendor's invoice {', '.join(sv.get('from') or [])}"}.get(sv.get("source"), "")
    sig = {"verified": "; QR signature verified", "not_checked": "; QR signature not checkable from the QR"}.get(q.get("signature"), "")
    entered = f"; QR text entered by {q['entered'].get('by')}" if q.get("entered") else ""
    return out("reclaimable", vat, src, f"VAT {vat:.2f} {SOURCE_WORD[src].format(by=common.author_name(o.get('by')))}; seller VAT number {sv['no']} {whose}{sig}{entered}")


def _ledger(lines, tieout):
    status = tieout["ledger_status"]; rollup = set(tieout["purchases_vs_rollup"]["rollup_codes"])
    out = []
    for l in lines:
        s = "ROLLUP" if l["code"] in rollup else status.get(f'{l["code"]}|{l["text"]}')
        out.append({**{k: l.get(k) for k in LEDGER_KEYS}, "status": "NO_CARD_TXN" if s == "UNEXPLAINED" else s})
    return out


def _closings(rows, ledger, month):
    """Card closing = running balance on the last statement row; ledger closing = balance on the month's last ledger row (sheet order,
    since codes are not posted in date order). Their difference is the gap the client sees in Odoo."""
    money = [r for r in rows if r.get("balance") is not None]
    led = [l for l in ledger if l.get("month") == month and l.get("balance") is not None]
    card = max(money, key=lambda r: (r["date"], r.get("time") or ""))["balance"] if money else None
    book = max(led, key=lambda l: l.get("row") or 0)["balance"] if led else None
    return card, book


def _kpis(rows, tieout, ledger=(), month=None):
    pr = tieout["purchases_vs_rollup"]
    card_close, ledger_close = _closings(rows, ledger, month)
    purchases = [r for r in rows if r["kind"] == "purchase"]
    missing = [r for r in rows if r["status"] == "MISSING_RECEIPT"]
    return {"card_spend": pr["statement"], "purchase_count": len(purchases), "atm_count": sum(1 for r in rows if r["kind"] == "atm"),
            "purchases_amount": pr["purchases_only"],
            "evidenced_amount": round(sum(r["amount"] for r in purchases if r["status"] in ("MATCHED", "AMOUNT_MISMATCH")), 2),   # a receipt exists
            "rollup": pr["ledger"], "open_gap": round(pr["ledger"] - pr["statement"], 2),
            "missing_count": len(missing), "missing_amount": round(sum(r["amount"] for r in missing), 2),
            "card_closing": card_close, "ledger_closing": ledger_close,
            "gap": round(card_close - ledger_close, 2) if card_close is not None and ledger_close is not None else None,
            "inquiry_count": sum(1 for r in rows if r["kind"] == "inquiry")}


def build_report(matches, cfg, page_files, now=None, inputs=None, findings=None, rules=None):
    """The UI-shaped report. page_files: file names in the pages/ folder, any order. inputs: {file: sha256} of what this run read, so
    the report can be reproduced; findings: overrides.json's "vat" section (page checks of the QR code, with their author)."""
    month = cfg["month"]
    # a bare card slip paying invoices that are records of their own (p42: STC's slip for three invoices) carries no VAT itself
    by_ref = {}
    for g in matches["receipts"]:
        for r in g.get("refs") or []: by_ref.setdefault(r, []).append(g)
    for g in matches["receipts"]:
        if g.get("kind") == "card_slip":
            others = sorted({h["id"] for r in g.get("refs") or [] for h in by_ref[r] if h is not g and h.get("kind") != "card_slip"})
            if others: g["slip_only"] = others
    for g in matches["receipts"]:
        g["vat"] = vat_status(g, (findings or {}).get(g["id"]))
    report = {
        "meta": {"client": cfg.get("client", "ABUJHD"), "month": month,
                 "month_label": datetime.strptime(month, "%Y-%m").strftime("%B %Y"),
                 "built_at": (now or datetime.now()).isoformat(timespec="seconds"),
                 "sheet": cfg.get("sheet"), "files": cfg.get("names", {}),
                 "page_images": {"receipts": sorted(f"pages/{n}" for n in page_files if n.startswith("page-") and n.endswith(".png")),
                                 "statement": ["pages/statement-200.png"]}},
        "kpis": _kpis(matches["rows"], matches["tieout"], matches["ledger"], month),
        "counts": matches["summary"],
        "rows": [_row(r) for r in matches["rows"] if r["kind"] != "inquiry"],   # balance inquiries move no money
        "receipts": [_receipt(g) for g in matches["receipts"] if g["status"] != "PART"],   # fragments of another document's crop
        "ledger": _ledger(matches["ledger"], matches["tieout"]),
        "tieout": {k: matches["tieout"][k] for k in TIEOUT_KEYS},
        "loose_qr": matches.get("loose_qr") or [],
    }
    report["meta"]["audit"] = {"inputs": inputs or {}, "pipeline": _pipeline_version(), "qr_decoder": matches.get("qr_decoder"),
                               "confidence_min": matches.get("confidence_min"), "vat_tolerance": matches.get("vat_tolerance"),
                               "rules": rules or {}}
    # config.json's optional display section (clean names, the polished layout) is the UI's to apply; absent, the report is unchanged
    if cfg.get("display"):
        report["meta"]["display"] = cfg["display"]
    return report


def _pipeline_version():
    """The scripts' git commit, and whether they had uncommitted changes, so a report says which code produced it."""
    import subprocess
    try:
        rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=common.ROOT, capture_output=True, text=True, timeout=5).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "scripts/abujhd"], cwd=common.ROOT, capture_output=True, text=True, timeout=5).stdout.strip()
        return f"{rev}{'+uncommitted' if dirty else ''}" if rev else None
    except (OSError, subprocess.SubprocessError):
        return None


def _hashes(names):
    import hashlib
    return {n: hashlib.sha256((common.DATA / n).read_bytes()).hexdigest()[:16] for n in names if (common.DATA / n).exists()}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data", default="data/abujhd"); a = ap.parse_args(); common.set_data(a.data)
    overrides = load_json(common.DATA / "overrides.json") if (common.DATA / "overrides.json").exists() else {}
    inputs = _hashes(["statement.json", "groups.json", "ledger.json", "qr.json", "overrides.json", "config.json"])
    report = build_report(load_json(common.DATA / "matches.json"), common.config(), [p.name for p in common.PAGES.iterdir()],
                          inputs=inputs, findings=overrides.get("vat"), rules=overrides.get("rules"))
    save_json(common.DATA / "report.json", report)
    print("wrote", common.DATA / "report.json", f'({len(report["rows"])} rows, {len(report["receipts"])} receipts, {len(report["ledger"])} ledger lines)')


if __name__ == "__main__":
    main()
