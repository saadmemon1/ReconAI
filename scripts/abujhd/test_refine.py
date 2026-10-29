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

from a_refine import parse_statement_line

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

from a_refine import parse_ledger

LEDGER_SEG = {"coordinates": {"sheetName": "General Ledger", "startRow": 2, "startCol": 1},
    "markdown": "Sheet: General Ledger\nRange: A2:I4\n\n| Column 1 | Column 2 | From 04/01/2026 to 09/30/2026 | c4 | c5 | c6 | c7 | c8 | c9 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
                "|  | MISC/2026/09/0031 | 09/30/2026 | Petty Cash for SEP |  |  |  | 19420.8 | -1272.31 |\n"
                "|  | MISC/2026/09/0020 | 09/01/2026 | Top up |  |  | 3000 |  | 3793.34 |\n"}

def test_ledger():
    rows = parse_ledger([LEDGER_SEG, {"coordinates": {"sheetName": "Filters"}, "markdown": "| x |"}])
    assert [r["code"] for r in rows] == ["MISC/2026/09/0031", "MISC/2026/09/0020"]
    assert rows[0]["date"] == "2026-09-30" and rows[0]["credit"] == 19420.8 and rows[0]["debit"] is None
    assert rows[1]["debit"] == 3000.0 and rows[1]["month"] == "2026-09"
    # data row i of a chunk is sheet row startRow + i; every row carries its sheet/row/cell
    assert [r["row"] for r in rows] == [2, 3] and rows[0]["cell"] == "B2" and rows[0]["sheet"] == "General Ledger"
    seg2 = {"coordinates": {"sheetName": "General Ledger", "startRow": 42, "startCol": 1},
            "markdown": "Sheet: General Ledger\nRange: A42:I42\n\n| Column 1 | Column 2 | c3 | c4 | c5 | c6 | c7 | c8 | c9 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
                        "|  | MISC/2026/06/0024 | 06/30/2026 | Petty cash expenses |  |  |  | 6773.46 | 3314.98 |\n"}
    r2 = parse_ledger([LEDGER_SEG, seg2])[-1]
    assert r2["code"] == "MISC/2026/06/0024" and r2["row"] == 42 and r2["cell"] == "B42"

from a_refine import clean_segment, group_page, derive_fields, build_groups

def seg(i, page, x0, y0, x1, y1, text, typ="text"):
    return {"id": f"s{i}", "type": typ, "markdown": text,
            "coordinates": {"pageNumber": page, "xmin": x0, "ymin": y0, "xmax": x1, "ymax": y1}}

def test_clean_and_group():
    c = clean_segment(seg(0, 1, 0, 0, 10, 10, "<table><tr><td>A</td><td>٤١.٠٠</td></tr></table>", "table"))
    assert c["text"] == "A | 41.00" and c["raw"].startswith("<table") and c["noise"] is False
    assert clean_segment(seg(1, 1, 0, 0, 1, 1, "Page 1 of 1", "page_number"))["noise"] is True
    # two receipts side by side: left column s1, s2, s5 (x 50-300, y 50-600), right column s3, s4 (x 400-700, y 40-400); no noise segments
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

def test_derive_totals_and_invoice():
    # a repeated amount keeps total_candidate if any occurrence follows "Total"
    assert derive_fields("Item 41.00 Total 41.00", [])["amounts"] == [{"value": 41.0, "total_candidate": True}]
    # "Invoice Date", "Tax Invoice MAZA" and "Investment" are not invoice numbers; "Inv No." is
    assert derive_fields("Invoice Date 2026", [])["invoice_no"] is None
    assert derive_fields("Tax Invoice MAZA REST", [])["invoice_no"] is None
    assert derive_fields("Investment 2026", [])["invoice_no"] is None
    assert derive_fields("Inv No. 896409", [])["invoice_no"] == "896409"

def test_group_small_merges_to_nearest():
    # two large components far apart; a one-segment component sits under the second, so it joins the second
    segs = [seg(1, 1, 0, 0, 400, 140, "MAZA REST"), seg(2, 1, 0, 160, 400, 300, "Total 10.00"),
            seg(3, 1, 600, 0, 1000, 140, "CAFE"), seg(4, 1, 600, 160, 1000, 300, "Total 20.00"),
            seg(5, 1, 620, 400, 700, 420, "x")]
    groups = group_page([clean_segment(s) for s in segs])
    assert sorted(sorted(s["id"] for s in g) for g in groups) == [["s1", "s2"], ["s3", "s4", "s5"]]

def test_cross_page_rules():
    p2 = seg(1, 2, 50, 50, 900, 300, "MAZA REST Net 41.00")
    # "Page 1 of 2" starts a new receipt; "Page 2 of 2" continues the previous one
    for text, joined in [("Page 1 of 2 BLUE CAFE Total 9.00", False), ("Page 2 of 2 BLUE CAFE Total 9.00", True)]:
        groups = build_groups([clean_segment(p2), clean_segment(seg(2, 3, 50, 50, 900, 300, text))])
        assert (len(groups) == 1) == joined, text
    # a merged group's box is the union of both boxes, and its amounts come from both pages
    groups = build_groups([clean_segment(seg(1, 2, 50, 50, 900, 300, "Ibrahim Al-Fares Inv No. 896409 page 1 of 2")),
                           clean_segment(seg(2, 3, 40, 20, 880, 500, "continued Inv No. 896409 Total 218.50"))])
    assert len(groups) == 1 and groups[0]["box"] == [40, 20, 900, 500]
    assert groups[0]["amounts"] == [{"value": 218.5, "total_candidate": True}]
    # no invoice number on the continuation: it joins the previous-page group it sits under, not the first one
    segs = [seg(1, 2, 0, 0, 300, 200, "Shop A"), seg(2, 2, 0, 220, 300, 400, "Total 10.00"),
            seg(3, 2, 600, 0, 900, 200, "Shop B"), seg(4, 2, 600, 220, 900, 400, "Total 20.00"),
            seg(5, 3, 620, 0, 880, 200, "continued Total 20.00")]
    groups = build_groups([clean_segment(s) for s in segs])
    assert [g["id"] for g in groups if g["pages"] == [2, 3]] == ["p02-g2"]

from a_refine import link_candidates, broken_rules, garbage_rate

ROWS = [{"ref": "A", "amount": 41.0, "date": "2026-09-01", "kind": "purchase"},
        {"ref": "B", "amount": 41.0, "date": "2026-09-05", "kind": "purchase"},
        {"ref": "L", "amount": 41.0, "date": "2026-09-01", "kind": "load"}]

def test_link_and_broken():
    g = {"amounts": [{"value": 41.0, "total_candidate": True}], "dates": ["2026-09-02"], "text": "Net 41.00 01/09/2026"}
    assert link_candidates(g, ROWS) == ["A"]
    g2 = {"amounts": [{"value": 41.0, "total_candidate": True}], "dates": [], "text": "x"}
    assert link_candidates(g2, ROWS) == ["A", "B"]
    assert broken_rules({"amounts": [], "dates": [], "candidates": [], "text": "hello", "merchant_candidates": ["M"]}, []) == ["unlinked_no_total", "no_date"]
    assert broken_rules({"amounts": [{"value": 1, "total_candidate": True}, {"value": 2, "total_candidate": True}], "dates": ["2026-09-01"], "candidates": ["A"], "text": "ok", "merchant_candidates": ["M"]}, []) == ["conflicting_totals"]
    assert garbage_rate("���� ���") > 0.3 and garbage_rate("Total 41.00") == 0.0
    assert broken_rules({"amounts": [{"value": 1, "total_candidate": True}], "dates": ["2026-09-01"], "candidates": ["A"], "text": "ok", "merchant_candidates": ["M"]},
                        [{"type": "table", "cellsSource": "grid-estimate"}]) == ["bad_table"]

def test_days_guard():
    from a_refine import _days
    # calendar-invalid date (find_dates only range-checks day <= 31): no match, no exception
    g = {"amounts": [{"value": 41.0, "total_candidate": True}], "dates": ["2026-02-31"], "text": "x"}
    assert link_candidates(g, ROWS) == []
    assert _days("2026-09-01", "2026-09-03") == 2

def test_statement_guards():
    # no PDF needed: the guard counts ref-looking lines against parsed rows
    import a_refine, subprocess, types
    real = subprocess.run
    def fake(text_layout, bbox):
        def run(cmd, **k):
            return types.SimpleNamespace(stdout=text_layout if "-layout" in cmd and "-bbox-layout" not in cmd else bbox)
        return run
    bbox = '<page width="595.3" height="841.9"></page>'
    try:
        subprocess.run = fake(LINE_PURCHASE + "\n633333333333 garbled line\n", bbox)
        try: a_refine.build_statement("x.pdf"); raise AssertionError("expected RuntimeError")
        except RuntimeError as e: assert "2 ref lines but 1 parsed" in str(e), e
        subprocess.run = fake(LINE_PURCHASE + "\n", bbox + bbox)
        try: a_refine.build_statement("x.pdf"); raise AssertionError("expected RuntimeError")
        except RuntimeError as e: assert "one-page" in str(e), e
    finally:
        subprocess.run = real

def test_apply_fields_and_overrides():
    from a_refine import apply_fields
    segs = [clean_segment(seg(1, 1, 50, 50, 900, 150, "Item 41.00")), clean_segment(seg(2, 1, 50, 160, 900, 300, "Total 55.00"))]
    g = build_groups(segs)[0]
    assert [a["value"] for a in g["amounts"] if a["total_candidate"]] == [55.0]
    apply_fields(g, segs, {"total": 41.0, "date": "2026-09-02", "merchant": "MAZA"})
    assert [a["value"] for a in g["amounts"] if a["total_candidate"]] == [41.0] and len(g["amounts"]) == 2
    assert g["dates"][0] == "2026-09-02" and g["merchant_candidates"][0] == "MAZA"
    assert link_candidates(g, [{"ref": "A", "amount": 41.0, "date": "2026-09-01", "kind": "purchase"}]) == ["A"]

def test_strong_total_keyword_beats_amount():
    f = derive_fields("Amount 560.87 VAT 84.13 Total 645.00", [])
    assert [a["value"] for a in f["amounts"] if a["total_candidate"]] == [645.0]
    assert derive_fields("Amount 10.00", [])["amounts"] == [{"value": 10.0, "total_candidate": True}]   # weak keyword still counts alone
    # a total-family keyword qualified as before-tax/subtotal flags nothing (real fuel receipt shape)
    f = derive_fields("Diesel price 1.79\n645.00 SAR\n1 x 645.00 SAR\nالمجموع قبل الضريبة\n560.87 SAR\nالضريبة 15%\n84.13 SAR", [])
    assert [a["value"] for a in f["amounts"] if a["total_candidate"]] == []
    from common import total_flags
    assert total_flags("Net 5.00 x 9.99") == {5.0: True, 9.99: False}
    assert total_flags("Internet 5.00 Amount 9.99") == {5.0: False, 9.99: True}   # "net" inside a word is not a total keyword
    assert total_flags("Net 5.00") == {5.0: True}
    assert total_flags("Subtotal 5.00 Total 9.99") == {5.0: False, 9.99: True}
    assert total_flags("قبل الضريبة 560.87 الإجمالي 645.00") == {560.87: False, 645.0: True}   # window stops at the previous amount

def test_docai_base_url_from_env():
    import os, importlib, common
    old = os.environ.get("DOCAI_BASE_URL")
    try:
        os.environ["DOCAI_BASE_URL"] = "http://localhost:8787"; importlib.reload(common)
        assert common.DOCAI == "http://localhost:8787"
    finally:
        if old is None: os.environ.pop("DOCAI_BASE_URL", None)
        else: os.environ["DOCAI_BASE_URL"] = old
        importlib.reload(common)

def test_junk_merchant_candidates_and_no_merchant_rule():
    # a date, a bare number, an amount, or a DocAI caption is not a merchant
    f = derive_fields("07/09/2026\nTotal 41.00", [clean_segment(seg(1, 1, 0, 0, 1, 1, "07/09/2026", "title"))])
    assert f["merchant_candidates"] == [], f
    f = derive_fields("39421\nTotal 41.00", [clean_segment(seg(1, 1, 0, 0, 1, 1, "39421", "header"))])
    assert f["merchant_candidates"] == [], f
    f = derive_fields("KIND: photo\n\nTEXT:\nA receipt on a desk\nTotal 41.00", [])
    assert f["merchant_candidates"] == [], f
    f = derive_fields("MAZA REST\nTotal 41.00", [clean_segment(seg(1, 1, 0, 0, 1, 1, "MAZA REST", "title"))])
    assert f["merchant_candidates"] == ["MAZA REST"], f
    # no real merchant is a reason to heal, even when the group is linkable
    g = {"amounts": [{"value": 41.0, "total_candidate": True}], "dates": ["2026-09-01"], "candidates": ["A"], "text": "ok", "merchant_candidates": []}
    assert broken_rules(g, []) == ["no_merchant"]
    g["merchant_candidates"] = ["MAZA REST"]
    assert broken_rules(g, []) == []

def test_figure_descriptions_carry_no_text():
    # DocAI describes pictures in figure segments ("KIND: photo ... TEXT: ..."); the box stays for geometry, the prose does not
    c = clean_segment(seg(0, 1, 0, 0, 500, 500, "KIND: photo\n\nTEXT:\nThe image shows a receipt with a total of 41.00", "figure"))
    assert c["text"] == "" and c["noise"] is False, c
    assert clean_segment(seg(1, 1, 0, 0, 10, 10, "Total 41.00", "text"))["text"] == "Total 41.00"
    # a figure that carries real OCR (a logo with the merchant name) keeps its text
    assert clean_segment(seg(2, 1, 0, 0, 10, 10, "HASSAN SALEH ALMUHANNA TRADING", "figure"))["text"] == "HASSAN SALEH ALMUHANNA TRADING"

def test_healer_retries_transient_failures():
    import healer, requests
    calls = []
    def fake_post(url, **kw):
        calls.append(url)
        if len(calls) < 3:
            raise requests.ConnectionError("boom")
        class R:
            status_code = 200
            text = ""
            def json(self):
                return {"status": "completed", "output_text": '{"segments": [], "fields": {}, "confidence": 1, "notes": ""}'}
        return R()
    real_post, real_sleep = requests.post, healer.time.sleep
    requests.post, healer.time.sleep = fake_post, lambda s: None
    try:
        import os; os.environ["OPENAI_API_KEY"] = "x"
        out = healer._openai("prompt", b"png")
        assert out["confidence"] == 1 and len(calls) == 3, (out, calls)
        calls.clear()
        def always_fail(url, **kw):
            calls.append(url); raise requests.ConnectionError("boom")
        requests.post = always_fail
        try:
            healer._openai("prompt", b"png"); raise AssertionError("expected RuntimeError")
        except RuntimeError as e:
            assert "request failed" in str(e) and len(calls) == 3, (e, calls)
    finally:
        requests.post, healer.time.sleep = real_post, real_sleep

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)
