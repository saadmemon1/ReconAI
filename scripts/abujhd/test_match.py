# scripts/abujhd/test_match.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from b_match import norm_merchant, receipt_amounts, collapse_card_slips, collapse_fragments, score, match_receipts

def G(id, page, amounts, dates, merchant, kind="receipt", fields=None, notes=None):
    return {"id": id, "page": page, "pages": [page], "amounts": [{"value": a, "total_candidate": True} for a in amounts],
            "dates": dates, "merchant_candidates": [merchant], "fields": fields, "kind": kind, "notes": notes, "candidates": []}

def R(ref, amount, date, merchant, kind="purchase", time="00:00:00"):
    return {"ref": ref, "amount": amount, "date": date, "time": time, "merchant": merchant, "kind": kind}

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
    links2, _ = match_receipts([exact, near, tie_a, orphan, weak], ROWS, {"links": {"g3": "r4", "g1": {"ref": None, "by": "Reviewer (app)"}}})
    assert links2["g3"] == "r4" and links2["g1"] is None   # a named person's "no card payment" is kept

def test_collapse_and_amounts():
    inv = G("g1", 2, [218.5, 190.0], ["2026-09-01"], "Al-Fares", kind="invoice")
    slip = G("g2", 2, [218.5], ["2026-09-01"], "Al-Fares", kind="card_slip")
    out = collapse_card_slips([inv, slip])
    assert len(out) == 1 and out[0]["ids"] == ["g1", "g2"]
    healed = G("g9", 9, [1.0, 2.0], [], "x", fields={"total": 773.0, "card_slip_amount": None})
    assert receipt_amounts(healed) == {773.0}
    assert receipt_amounts(G("g8", 8, [5.0], [], "x")) == {5.0}

def test_greedy_contention_and_collapse_order():
    # (a) slip listed before its receipt still collapses; ids in receipt-then-slip order
    inv = G("g1", 2, [218.5, 190.0], ["2026-09-01"], "Al-Fares", kind="invoice")
    slip = G("g2", 2, [218.5], ["2026-09-01"], "Al-Fares", kind="card_slip")
    out = collapse_card_slips([slip, inv])
    assert len(out) == 1 and out[0]["ids"] == ["g1", "g2"], out
    # (b) X and Y both score 5 for rB, but X can take rA at 7 -> X gets rA, Y gets rB, no tie
    rA = R("rA", 10.0, "2026-09-01", "ALPHA STORE")
    rB = R("rB", 10.0, "2026-09-03", "BETA SHOP")
    X = G("X", 1, [10.0], ["2026-09-01", "2026-09-03"], "Alpha Store")
    Y = G("Y", 2, [10.0], ["2026-09-03"], "Gamma")
    links, review = match_receipts([X, Y], [rA, rB], {})
    assert links["X"] == "rA" and links["Y"] == "rB" and "X" not in review and "Y" not in review, (links, review)
    # (c) two groups score identically for the SAME single row -> both review, neither linked
    rC = R("rC", 10.0, "2026-09-01", "FOO")
    P = G("P", 1, [10.0], ["2026-09-01"], "Foo")
    Q = G("Q", 2, [10.0], ["2026-09-01"], "Foo")
    links, review = match_receipts([P, Q], [rC], {})
    assert links["P"] is None and links["Q"] is None and "P" in review and "Q" in review, (links, review)
    # (d) only candidate row forced to another group -> None and review entry with empty list
    rA = R("rA", 10.0, "2026-09-01", "ALPHA")
    other = G("other", 1, [10.0], ["2026-09-01"], "Alpha")
    Z = G("Z", 2, [10.0], ["2026-09-01"], "Alpha")
    links, review = match_receipts([other, Z], [rA], {"links": {"other": "rA"}})
    assert links["other"] == "rA" and links["Z"] is None and review["Z"] == [], (links, review)
    # (e) full-token overlap counts once: 3 (amount) + 1 (merchant) = 4, not 5
    g = G("g", 1, [10.0], [], "SUPERMARKET")
    assert score(g, R("rS", 10.0, "2026-09-01", "supermarket")) == 4

from b_match import tie_out_ledger, assign_statuses

def test_tieout_and_statuses():
    stmt = [R("p1", 41.0, "2026-09-01", "MAZA"), R("p2", 9.0, "2026-09-02", "ASDAF"), R("a1", 500.0, "2026-09-03", "BANKX", kind="atm"), R("l1", 3000.0, "2026-09-01", "FROM", kind="load")]
    for r in stmt: r["orange"] = r["ref"] == "p2"
    ledger = [{"code": "MISC/2026/09/0020", "date": "2026-09-01", "text": "Top up", "debit": 3000.0, "credit": None, "month": "2026-09"},
              {"code": "MISC/2026/09/0008", "date": "2026-09-13", "text": "Top up", "debit": 3000.0, "credit": None, "month": "2026-09"},
              {"code": "MISC/2026/09/0031", "date": "2026-09-30", "text": "Petty Cash for SEP", "debit": None, "credit": 1600.0, "month": "2026-09"},
              {"code": "MISC/2026/09/0034", "date": "2026-09-01", "text": "against INV", "debit": None, "credit": 9.0, "month": "2026-09"}]
    for l, n in zip(ledger, (74, 60, 83, 84)): l.update(sheet="General Ledger", row=n, cell=f"B{n}")
    t = tie_out_ledger(stmt, ledger)
    assert t["loads_vs_topups"]["statement"] == 3000.0 and t["loads_vs_topups"]["ledger"] == 6000.0 and t["loads_vs_topups"]["diff"] == -3000.0
    assert t["purchases_vs_rollup"]["statement"] == 550.0 and t["purchases_vs_rollup"]["ledger"] == 1600.0 and t["purchases_vs_rollup"]["diff"] == -1050.0
    assert t["ledger_status"]["MISC/2026/09/0020|Top up"] == "TIED" and t["ledger_status"]["MISC/2026/09/0008|Top up"] == "UNEXPLAINED"
    assert t["small_credits"][0]["ref"] == "p2"
    groups = [G("g1", 1, [41.0], ["2026-09-01"], "MAZA"), G("g2", 2, [77.0], [], "x"), G("g3", 3, [9.0], [], "y")]
    assert t["row_status"]["l1"] == "TIED" and t["row_ledger"]["l1"] == "MISC/2026/09/0020"
    rows, receipts = assign_statuses(stmt, groups, {"g1": "p1", "g2": None, "g3": None}, {"g3": [("p2", 3)]}, t, ledger)
    st = {r["ref"]: r["status"] for r in rows}
    assert st == {"p1": "MATCHED", "p2": "REVIEW", "a1": "ATM_CASH", "l1": "TIED"}, st   # no withdrawal line: cash spent on receipts in the roll-up
    assert {r["ref"]: r["citations"]["ledger"] for r in rows}["a1"]["code"] == "MISC/2026/09/0031"
    assert {r["ref"]: r.get("ledger_code") for r in rows}["l1"] == t["row_ledger"]["l1"] == "MISC/2026/09/0020"
    rc = {r["id"]: r["status"] for r in receipts}
    assert rc == {"g1": "LINKED", "g2": "ORPHAN", "g3": "REVIEW"}
    # a withdrawal line 1:1 with the ATM row (same amount, <=2 days) ties it
    wd = {"code": "MISC/2026/09/0064", "date": "2026-09-03", "text": "Reconciliation - Cash Withdrawal", "debit": None, "credit": 500.0, "month": "2026-09", "sheet": "General Ledger", "row": 70, "cell": "B70"}
    t2 = tie_out_ledger(stmt, ledger + [wd])
    assert t2["row_status"]["a1"] == "TIED" and t2["ledger_status"]["MISC/2026/09/0064|Reconciliation - Cash Withdrawal"] == "TIED"
    rows2, _ = assign_statuses(stmt, groups, {"g1": "p1", "g2": None, "g3": None}, {"g3": [("p2", 3)]}, t2, ledger + [wd])
    assert {r["ref"]: r["status"] for r in rows2}["a1"] == "TIED"

def test_inquiries_are_not_withdrawals():
    from b_match import tag_inquiries
    stmt = [R("a1", 500.0, "2026-09-03", "BANKX", kind="atm"), R("q1", 0.0, "2026-09-03", "BANKX", kind="atm"), R("q2", 0.0, "2026-09-04", "BANKY", kind="atm")]
    stmt[0]["txn_code"] = "1"; stmt[1]["txn_code"] = "30"; stmt[2]["txn_code"] = "35"
    tag_inquiries(stmt)
    assert [r["kind"] for r in stmt] == ["atm", "inquiry", "inquiry"]
    ledger = [{"code": "MISC/2026/09/0031", "date": "2026-09-30", "text": "Petty Cash for SEP", "debit": None, "credit": 1600.0, "month": "2026-09", "sheet": "GL", "row": 83, "cell": "B83"}]
    t = tie_out_ledger(stmt, ledger)
    assert t["atm_vs_withdrawals"]["statement"] == 500.0
    rows, _ = assign_statuses(stmt, [], {}, {}, t, ledger)
    assert {r["ref"]: r["status"] for r in rows} == {"a1": "ATM_CASH", "q1": "INQUIRY", "q2": "INQUIRY"}

def test_receipt_overrides():
    from b_match import apply_receipt_overrides
    recs = [{"id": "a", "status": "ORPHAN", "reason": "r", "review": []}, {"id": "b", "status": "REVIEW", "reason": "r", "review": [["x", 3]]},
            {"id": "c", "status": "LINKED", "reason": "linked", "review": []}, {"id": "d", "status": "ORPHAN", "reason": "r", "review": []}]
    recs += [{"id": "e", "status": "ORPHAN", "reason": "r", "review": []}, {"id": "f", "status": "ORPHAN", "reason": "r", "review": []}]
    ov = {"receipts": {"a": {"status": "CASH", "reason": "Paid in cash", "by": "Saad"}, "b": {"status": "PART", "part_of": "c"},
                       "c": {"status": "CASH"}, "d": {"status": "NONSENSE"}, "e": {"status": "OTHER_CARD", "reason": "slip"},
                       "f": {"status": "CASH", "by": "Claude (AI assistant)", "proposed": True, "reason": "change given"}}}
    out = {g["id"]: g for g in apply_receipt_overrides(recs, ov)}
    assert out["a"]["status"] == "CASH" and out["a"]["reason"] == "Paid in cash" and out["a"]["decided_by"]["by"] == "Saad"
    # a payment verdict with no author waits for a person: not applied, carried as a proposal
    assert out["e"]["status"] == "ORPHAN" and out["e"]["proposal"]["status"] == "OTHER_CARD" and out["e"]["proposal"]["by"] is None
    # a classification ReconAI made from the receipt counts in Payments, labelled as its own; a person can change it
    assert out["f"]["status"] == "CASH" and out["f"]["decided_by"]["by"] == "ReconAI" and "proposal" not in out["f"]   # shown under the product name, never the model's
    assert out["b"]["status"] == "PART" and out["b"]["part_of"] == "c" and out["b"]["review"] == []
    assert out["c"]["status"] == "LINKED" and out["d"]["status"] == "ORPHAN"   # linked never overridden; unknown status ignored

def test_citations():
    stmt = [R("p1", 41.0, "2026-09-01", "MAZA"), R("p2", 9.0, "2026-09-02", "ASDAF"), R("a1", 500.0, "2026-09-03", "BANKX", kind="atm"), R("l1", 3000.0, "2026-09-01", "FROM", kind="load")]
    for r in stmt: r.update(orange=False, y=100.0, crop=f"crops/stmt-{r['ref']}.png", box=[0, 118, 1000, 123])
    ledger = [{"code": "MISC/2026/09/0020", "date": "2026-09-01", "text": "Top up", "debit": 3000.0, "credit": None, "month": "2026-09", "sheet": "General Ledger", "row": 74, "cell": "B74"},
              {"code": "MISC/2026/09/0031", "date": "2026-09-30", "text": "Petty Cash for SEP", "debit": None, "credit": 1600.0, "month": "2026-09", "sheet": "General Ledger", "row": 83, "cell": "B83"}]
    t = tie_out_ledger(stmt, ledger)
    g1 = G("g1", 7, [41.0], ["2026-09-01"], "MAZA"); g1["box"] = [10, 20, 300, 400]
    rows, receipts = assign_statuses(stmt, [g1], {"g1": "p1"}, {}, t, ledger)
    by = {r["ref"]: r["citations"] for r in rows}
    assert {r["ref"]: r["status"] for r in rows} == {"p1": "MATCHED", "p2": "MISSING_RECEIPT", "a1": "ATM_CASH", "l1": "TIED"}
    led = by["p1"]["ledger"]
    assert led["code"] == "MISC/2026/09/0031" and led["relation"] == "rolled-up" and led["cell"] == "B83" and led["amount"] == 1600.0
    assert len(by["p1"]["receipts"]) == 1 and by["p1"]["receipts"][0]["crop"] == "crops/g1.png" and by["p1"]["receipts"][0]["page"] == 7
    assert by["l1"]["ledger"]["relation"] == "tied" and by["l1"]["ledger"]["code"] == "MISC/2026/09/0020" and by["l1"]["ledger"]["cell"] == "B74"
    assert by["a1"]["ledger"]["relation"] == "rolled-up" and by["a1"]["ledger"]["code"] == "MISC/2026/09/0031"   # ATM cash sits inside the roll-up
    assert by["p2"]["receipts"] == [] and by["p2"]["statement"]["page"] == 1 and by["p2"]["statement"]["crop"] == "crops/stmt-p2.png"
    assert by["p2"]["ledger"]["relation"] == "rolled-up"   # a MISSING purchase is still inside the month's roll-up
    assert receipts[0]["citations"]["statement"]["ref"] == "p1" and receipts[0]["citations"]["ledger"]["cell"] == "B83"

from b_match import collapse_fragments, real_merchant_tokens, assign_statuses, tie_out_ledger

def test_fragments_and_tolerance():
    a = G("g1", 19, [313.95], ["2026-09-24"], "ALWAN PAINT COMPANY", kind="invoice")
    b = G("g2", 19, [313.95], [], "Total Invoice", kind=None)
    c = G("g3", 20, [313.95], [], "Amount in Words :", kind=None)
    d1 = G("g4", 10, [10.0], ["2026-09-03"], "ASDAF ALMUHIT")
    d2 = G("g5", 10, [10.0], ["2026-09-03"], "مؤسسة درة البندقية للمواد الغذائية")
    e = G("g6", 40, [313.95], [], "ALWAN PAINT COMPANY")          # far page: not merged
    for g in (a, b, c, d1, d2, e):
        g["ids"] = [g["id"]]; g["boxes"] = [(g["page"], None)]
    out = collapse_fragments([a, b, c, d1, d2, e])
    byid = {o["ids"][0]: o for o in out}
    assert byid["g1"]["ids"] == ["g1", "g2", "g3"] and byid["g1"]["pages"] == [19, 20]
    assert "g4" in byid and "g5" in byid and len(out) == 4          # different real merchants stay apart; g6 stays apart
    assert real_merchant_tokens(b) == set() and "alwan" in real_merchant_tokens(a)
    row = R("r1", 10.0, "2026-09-03", "AJMY COMPANY")
    assert score(G("h1", 1, [10.01], ["2026-09-03"], "Ajmi Trading"), row) == 2 + 2 + 1
    assert score(G("h2", 1, [10.06], ["2026-09-03"], "Ajmi Trading"), row) == 0
    assert score(G("h3", 1, [10.0], ["2026-09-03"], "Ajmi Trading"), row) == 3 + 2 + 1
    # order-independence: a merchant-less piece first must not swallow two different shops
    def rec(id, m):
        g = G(id, 10, [10.0], [], m); g["ids"] = [id]; g["boxes"] = [(10, None)]; return g
    gen, asd, dur = rec("x1", "Total Invoice"), rec("x2", "ASDAF ALMUHIT"), rec("x3", "مؤسسة درة البندقية للمواد الغذائية")
    out = collapse_fragments([gen, asd, dur])
    assert [o["ids"] for o in out] == [["x1"], ["x2"], ["x3"]] and all("_rm" not in o for o in out), out
    merged = collapse_fragments([rec("x1", "Total Invoice"), rec("x2", "ASDAF ALMUHIT")])
    assert len(merged) == 1 and sorted(merged[0]["ids"]) == ["x1", "x2"]
    assert len(collapse_fragments(merged + [rec("x3", "مؤسسة درة البندقية للمواد الغذائية")])) == 2   # a later shop does not join the merged record
    assert real_merchant_tokens(G("k", 1, [1.0], [], "الإجمالي إجمالي Total")) == set()
    # tolerance needs support; assign_statuses reasons
    assert score(G("t1", 1, [10.01], [], "xyz"), row) == 0 and score(G("t2", 1, [10.01], ["2026-09-03"], "xyz"), row) == 4
    assert score(G("t3", 1, [10.0], [], "xyz"), row) == 3
    stmt = [R("s1", 10.0, "2026-09-03", "AJMY COMPANY")]
    ok, bad = G("o1", 1, [10.01], ["2026-09-03"], "Ajmi"), G("o2", 2, [10.1], [], "zzz")
    links, rev = match_receipts([ok], stmt, {})
    rows, _ = assign_statuses(stmt, [ok], links, rev, tie_out_ledger(stmt, []), [])
    assert rows[0]["status"] == "AMOUNT_MISMATCH" and "differs by 0.01" in rows[0]["reason"], rows   # a halala apart is a proposal, never MATCHED
    assert rows[0]["paid"] == 10.0 and rows[0]["invoiced"] == 10.01 and rows[0]["difference"] == -0.01
    links, rev = match_receipts([bad], stmt, {"links": {"o2": "s1"}})
    rows, _ = assign_statuses(stmt, [bad], links, rev, tie_out_ledger(stmt, []), [])
    assert rows[0]["status"] == "AMOUNT_MISMATCH", rows

def test_override_robustness():
    import io, contextlib
    # a forced link on an id that collapse_fragments merged (not the head) resolves to the head
    a = G("g1", 5, [20.0], ["2026-09-03"], "ALWAN PAINT COMPANY", kind="invoice")
    b = G("g2", 5, [20.0], [], "Total Invoice", kind=None)
    for g in (a, b): g["ids"] = [g["id"]]; g["boxes"] = [(g["page"], None)]
    merged = collapse_fragments([a, b])
    assert len(merged) == 1 and merged[0]["ids"] == ["g1", "g2"]
    rows = [R("r1", 99.0, "2026-09-03", "OTHER"), R("r2", 77.0, "2026-09-04", "ELSE")]
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        links, _ = match_receipts(merged, rows, {"links": {"g2": "r1", "nope": "r2", "g1x": None}})
    assert links["g1"] == "r1" and "g2" not in links and "nope" not in links, links
    assert "unknown group id nope" in err.getvalue() and "unknown group id g1x" in err.getvalue()
    # unknown statement ref: skipped with a warning, the group is matched normally
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        links, _ = match_receipts(merged, rows, {"links": {"g1": "zzz"}})
    assert "unknown statement ref zzz for g1" in err.getvalue() and links["g1"] is None

def test_ledger_status_default():
    stmt = [R("p1", 41.0, "2026-09-01", "MAZA")]
    ledger = [{"code": "MISC/2026/09/0050", "date": "2026-09-05", "text": "Office supplies", "debit": 75.0, "credit": None, "month": "2026-09", "sheet": "General Ledger", "row": 5, "cell": "B5"},
              {"code": "MISC/2026/08/0001", "date": "2026-08-05", "text": "Other month", "debit": 5.0, "credit": None, "month": "2026-08", "sheet": "General Ledger", "row": 6, "cell": "B6"}]
    st = tie_out_ledger(stmt, ledger)["ledger_status"]
    assert st == {"MISC/2026/09/0050|Office supplies": "UNEXPLAINED"}, st

def test_multi_document_notes_go_to_review():
    row = R("r1", 41.0, "2026-09-01", "MAZA REST")
    clean = G("c", 1, [41.0], ["2026-09-01"], "MAZA REST")
    multi = G("m", 1, [41.0], ["2026-09-01"], "MAZA REST", notes="The crop contains more than one document; fields are for the largest.")
    assert match_receipts([clean], [row], {})[0]["c"] == "r1"
    links, review = match_receipts([multi], [row], {})
    assert links["m"] is None and [r for r, _ in review["m"]] == ["r1"]
    # the note survives collapsing into a record
    multi2 = G("m2", 1, [41.0], ["2026-09-01"], "MAZA REST", notes="two documents"); multi2["ids"] = ["m2"]; multi2["boxes"] = [(1, None)]
    clean2 = G("c2", 1, [41.0], [], "MAZA REST"); clean2["ids"] = ["c2"]; clean2["boxes"] = [(1, None)]
    assert "two documents" in collapse_fragments([clean2, multi2])[0]["notes"]

from b_match import second_pass

def _left(gs):
    for g in gs: g.setdefault("ids", [g["id"]]); g.setdefault("boxes", [(g["page"], None)])
    return gs

def test_second_pass_split_payment():
    rows = [R("a", 33.0, "2026-09-01", "QALAT REST"), R("b", 8.0, "2026-09-01", "QALAT REST"), R("c", 8.0, "2026-09-01", "OTHER SHOP")]
    g = _left([G("g1", 1, [41.0], ["2026-09-01"], "Qalat")])[0]
    links, review = second_pass([g], rows, {"g1": None}, {})
    assert links["g1"] == ["a", "b"], links          # same merchant string, same day, exact sum
    # a row parked in another group's review list is settled by an exact split (and leaves that list); a linked row is never consumed
    links, review = second_pass([g], rows, {"g1": None}, {"zz": [("b", 3)]})
    assert links["g1"] == ["a", "b"] and review == {"zz": []}, (links, review)
    links, review = second_pass([g], rows, {"g1": None, "g2": "a"}, {})
    assert links["g1"] is None, links
    rows4 = [R("a", 25.0, "2026-09-19", "PURE OIL"), R("b", 45.0, "2026-09-19", "PURE OIL")]
    g4 = _left([G("g4", 54, [70.02], ["2026-09-19"], "Purein")])[0]
    assert second_pass([g4], rows4, {"g4": None}, {})[0]["g4"] == ["a", "b"]     # sum within 0.05 of the total, like pass 1

def test_second_pass_amount_tolerance():
    rows = [R("a", 172.0, "2026-09-09", "ALMAQHAWI IND"), R("b", 500.0, "2026-09-09", "X")]
    g = _left([G("g1", 1, [172.5], ["2026-09-09"], "Ibrahim Al-Mughawi")])[0]; g["confidence"] = 0.9   # no merchant overlap: the healer's confidence carries it
    links, _ = second_pass([g], rows, {"g1": None}, {})
    assert links["g1"] == "a", links                  # same day, 0.50 apart, unique both ways
    rows2, _ = assign_statuses(rows, [g], links, {}, tie_out_ledger(rows, []), [])
    assert {r["ref"]: r["status"] for r in rows2}["a"] == "AMOUNT_MISMATCH"   # flagged, not promoted
    for bad in ([R("a", 175.51, "2026-09-09", "Y")],                          # 3.01 apart
                [R("a", 172.0, "2026-09-10", "Y")],                           # other day
                [R("a", 172.0, "2026-09-09", "Y"), R("a2", 171.0, "2026-09-09", "Z")]):   # two rows within 3.00: ambiguous
        assert second_pass([g], bad, {"g1": None}, {})[0]["g1"] is None, bad
    # two leftover receipts within 3.00 of the same row: ambiguous the other way
    g2 = _left([G("g2", 2, [171.0], ["2026-09-09"], "Other")])[0]
    assert second_pass([g, g2], rows, {"g1": None, "g2": None}, {})[0]["g1"] is None
    # a NON-leftover row (linked or in review) within tolerance on the same day still makes the receipt ambiguous
    rows3 = [R("a", 172.0, "2026-09-09", "Y"), R("z", 171.5, "2026-09-09", "Z")]
    assert second_pass([g], rows3, {"g1": None, "gz": "z"}, {})[0]["g1"] is None
    assert second_pass([g], rows3, {"g1": None}, {"gq": [("z", 3)]})[0]["g1"] is None

def test_second_pass_near_amount_guard():
    day = "2026-09-08"
    weak = _left([G("g1", 1, [37.99], [day], "Othaim")])[0]; weak["confidence"] = 0.42
    assert second_pass([weak], [R("a", 40.0, day, "AJMY COMPANY")], {"g1": None}, {})[0]["g1"] is None   # no merchant overlap, low confidence
    assert second_pass([weak], [R("a", 40.0, day, "AL OTHAIM MARKETS")], {"g1": None}, {})[0]["g1"] == "a"   # merchant overlap carries it
    sure = _left([G("g2", 2, [30.0], [day], "Nobody Alike")])[0]; sure["confidence"] = 0.95
    rows = [R("a", 31.5, day, "ZZZ")]
    links, _ = second_pass([sure], rows, {"g2": None}, {})
    assert links["g2"] == "a", links                  # confident healer: 1.50 <= min(3.00, 10% of 31.50)
    rows2, _ = assign_statuses(rows, [sure], links, {}, tie_out_ledger(rows, []), [])
    assert "differs by 1.50" in rows2[0]["reason"] and rows2[0]["status"] == "AMOUNT_MISMATCH", rows2[0]
    rows3 = [R("c", 32.5, day, "ZZZ")]
    l3, _ = second_pass([sure], rows3, {"g2": None}, {})
    assert "differs by 2.50" in assign_statuses(rows3, [sure], l3, {}, tie_out_ledger(rows3, []), [])[0][0]["reason"]
    small = _left([G("g3", 3, [7.5], [day], "Nobody Alike")])[0]; small["confidence"] = 0.95
    assert second_pass([small], [R("b", 5.0, day, "ZZZ")], {"g3": None}, {})[0]["g3"] is None   # 2.50 > 10% of 5.00

def test_second_pass_no_total_to_review():
    rows = [R("a", 93.0, "2026-09-08", "AL OTHAIM MARKETS COMPANY"), R("b", 6.0, "2026-09-08", "ASDAF")]
    g = _left([G("g1", 26, [], ["2026-09-08"], "Othaim", fields={"merchant": "أسواق العثيم / Othaim", "date": "2026-09-08", "total": None, "card_slip_amount": None})])[0]
    links, review = second_pass([g], rows, {"g1": None}, {})
    assert links["g1"] is None and review["g1"] == [("a", 0)], (links, review)   # a suggestion for the human, not a match
    rows2, rc = assign_statuses(rows, [g], links, review, tie_out_ledger(rows, []), [])
    assert {r["ref"]: r["status"] for r in rows2}["a"] == "REVIEW" and rc[0]["status"] == "REVIEW"
    # two same-merchant rows that day: no suggestion
    assert "g1" not in second_pass([g], rows + [R("c", 20.0, "2026-09-08", "AL OTHAIM MARKETS")], {"g1": None}, {})[1]

def test_split_link_statuses():
    rows = [R("a", 33.0, "2026-09-01", "QALAT REST"), R("b", 8.0, "2026-09-01", "QALAT REST")]
    g = _left([G("g1", 1, [41.0], ["2026-09-01"], "Qalat")])[0]; g["box"] = [0, 0, 10, 10]
    rows2, rc = assign_statuses(rows, [g], {"g1": ["a", "b"]}, {}, tie_out_ledger(rows, []), [])
    assert [r["status"] for r in rows2] == ["MATCHED", "MATCHED"] and "split" in rows2[0]["reason"], rows2
    assert rc[0]["status"] == "LINKED" and rc[0]["ref"] == "a" and rc[0]["refs"] == ["a", "b"]

def test_receipt_amounts_reranks_unhealed_totals():
    g = {"id": "u", "page": 1, "pages": [1], "fields": None, "dates": [], "merchant_candidates": [],
         "text": "Amount 560.87 VAT 84.13 Total 645.00",
         "amounts": [{"value": 560.87, "total_candidate": True}, {"value": 645.0, "total_candidate": False}]}
    assert receipt_amounts(g) == {645.0}
    g["text"] = "645.00 SAR\nالمجموع قبل الضريبة\n560.87 SAR"      # no total keyword survives: every amount is a candidate
    assert receipt_amounts(g) == {645.0, 560.87}
    g["ids"] = ["u", "v"]                                            # a merged record keeps its merged flags (head text is partial)
    assert receipt_amounts(g) == {560.87}

def test_no_total_suggestion_despite_stray_amounts():
    # the healer read merchant and date but no total; a stray amount in the text must not block the suggestion
    rows = [R("a", 93.0, "2026-09-08", "AL OTHAIM MARKETS COMPANY"), R("b", 6.0, "2026-09-08", "ASDAF")]
    g = _left([G("g1", 26, [0.0], ["2026-09-08"], "Othaim", fields={"merchant": "أسواق العثيم / Othaim", "date": "2026-09-08", "total": None, "card_slip_amount": None})])[0]
    g["amounts"] = [{"value": 0.0, "total_candidate": False}]
    links, review = second_pass([g], rows, {"g1": None}, {})
    assert links["g1"] is None and review["g1"] == [("a", 0)], (links, review)
    # with a real total candidate the rule stays out of the way
    g2 = _left([G("g2", 27, [52.5], ["2026-09-08"], "Cafe", fields={"merchant": "Cafe", "date": "2026-09-08", "total": None, "card_slip_amount": None})])[0]
    assert "g2" not in second_pass([g2], [R("c", 50.0, "2026-09-08", "CAFE")], {"g2": None}, {})[1]

def test_attached_card_slip_is_one_document():
    row = R("r1", 900.0, "2026-09-02", "ALANDALUS TRADING CO")
    g = G("g", 8, [900.0], ["2026-09-02"], "ALANDALUS TRADING", notes="The crop contains two documents: a simplified tax invoice and an attached Mada POS/card slip.")
    assert match_receipts([g], [row], {})[0]["g"] == "r1"          # invoice + its own slip is one purchase
    g2 = G("g2", 8, [900.0], ["2026-09-02"], "ALANDALUS TRADING", notes="The crop contains two separate receipts from different shops.")
    links, review = match_receipts([g2], [row], {})
    assert links["g2"] is None and "g2" in review                  # genuinely two documents still goes to a human

from b_match import split_other_month

def test_split_other_month():
    aug = G("a", 1, [10.0], ["2026-08-14"], "Shop")                      # previous month
    oct_ = G("o", 2, [10.0], ["2026-10-02"], "Shop")                     # next month
    edge = G("e", 3, [10.0], ["2026-08-31"], "Shop")                     # one day before: stays (card can post next day)
    mixed = G("m", 4, [10.0], ["2025-09-03", "2026-09-03"], "Shop")      # OCR gave two years, one in month: stays
    far = G("f", 5, [10.0], ["2024-09-20"], "Shop")                      # years off: unreadable date, not another month
    nodate = G("n", 6, [10.0], [], "Shop")
    healed = G("h", 7, [10.0], ["2026-09-05"], "Shop", fields={"merchant": "Shop", "date": "2026-07-05", "total": 10.0, "card_slip_amount": None})  # healer date wins
    yearoff = G("y", 8, [10.0], ["2025-09-02"], "Shop")                  # OCR year off by one: this month
    swapped = G("w", 9, [10.0], ["2026-12-09"], "Shop")                  # day/month swapped (12 Sep): this month
    arabic = G("q", 10, [10.0], ["2026-03-16"], "Shop")                   # ٣ read for ٩: 16 Sep, this month
    keep, other = split_other_month([aug, oct_, edge, mixed, far, nodate, healed, yearoff, swapped, arabic], "2026-09")
    assert [g["id"] for g in other] == ["a", "o", "h"], [g["id"] for g in other]
    assert [g["id"] for g in keep] == ["e", "m", "f", "n", "y", "w", "q"], [g["id"] for g in keep]
    # an amount that matches a purchase row of this statement proves the receipt is this month's, whatever the date says
    keep2, other2 = split_other_month([aug], "2026-09", [R("r", 10.0, "2026-09-14", "SHOP")])
    assert [g["id"] for g in keep2] == ["a"] and other2 == []

def test_other_month_receipts_get_their_own_status():
    rows = [R("r1", 10.0, "2026-09-05", "SHOP")]
    aug = G("a", 1, [10.0], ["2026-08-14"], "Shop"); aug["box"] = [0, 0, 1, 1]
    sep = G("s", 2, [10.0], ["2026-09-05"], "Shop"); sep["box"] = [0, 0, 1, 1]
    keep, other = split_other_month([aug, sep], "2026-09")
    links, review = match_receipts(keep, rows, {})
    rows2, receipts = assign_statuses(rows, keep, links, review, tie_out_ledger(rows, []), [], other_month=other)
    st = {r["id"]: r["status"] for r in receipts}
    assert st == {"s": "LINKED", "a": "OTHER_MONTH"}, st
    a = next(r for r in receipts if r["id"] == "a")
    assert a["ref"] is None and "2026-08-14" in a["reason"] and "September 2026" in a["reason"], a["reason"]
    assert rows2[0]["status"] == "MATCHED"                                # the August receipt never competed for the September row

def test_no_total_suggestion_uses_derived_merchants_too():
    # the healer wrote the merchant in Arabic only; the derived candidate still carries the Latin name
    rows = [R("a", 93.0, "2026-09-08", "AL OTHAIM MARKETS COMPANY"), R("b", 6.0, "2026-09-08", "ASDAF")]
    g = _left([G("g1", 26, [], ["2026-09-08"], "شركة أسواق عبدالله العثيم (Othaim)", fields={"merchant": "شركة أسواق عبدالله العثيم", "date": "2026-09-08", "total": None, "card_slip_amount": None})])[0]
    assert second_pass([g], rows, {"g1": None}, {})[1]["g1"] == [("a", 0)]

def test_guarded_near_amount_becomes_a_suggestion():
    # unique both ways on the day, but no merchant overlap and low healer confidence: suggest, never link
    rows = [R("a", 30.98, "2026-09-08", "AL OTHAIM MARKETS COMPANY"), R("b", 500.0, "2026-09-08", "X")]
    g = _left([G("g1", 34, [30.2], ["2026-09-08"], "Al-Dawaa Pharmacies", fields={"merchant": "Al-Dawaa Pharmacies", "date": "2026-09-08", "total": 30.2, "card_slip_amount": None})])[0]
    g["confidence"] = 0.62
    links, review = second_pass([g], rows, {"g1": None}, {})
    assert links["g1"] is None and review["g1"] == [("a", 0)], (links, review)
    rows2, rc = assign_statuses(rows, [g], links, review, tie_out_ledger(rows, []), [])
    assert {r["ref"]: r["status"] for r in rows2}["a"] == "REVIEW" and rc[0]["status"] == "REVIEW"

def test_score_date_support_survives_ocr_year_and_month_errors():
    row = R("r1", 40.25, "2026-09-03", "SHATI ALTAWFIR COMPANY")
    assert score(G("y", 1, [40.25], ["2025-09-03"], "zzz"), row) == 3 + 2      # year off by one: same day
    assert score(G("w", 1, [40.25], ["2026-03-09"], "zzz"), row) == 3 + 2      # day/month swapped
    assert score(G("q", 1, [40.25], ["2026-03-03"], "zzz"), row) == 3 + 2      # Arabic 3 read for 9 in the month
    assert score(G("n", 1, [40.25], ["2026-09-20"], "zzz"), row) == 3          # a different day stays unsupported

def test_collapse_fragments_keeps_different_days_apart():
    # same shop, same total, adjacent pages, different days: two purchases, never one record
    a = G("g1", 5, [11.5], ["2026-09-02"], "شركة ساطي الوفير التجارية", fields={"merchant": "شركة ساطي الوفير التجارية", "date": "2026-09-02", "total": 11.5, "card_slip_amount": None})
    b = G("g2", 6, [11.5], ["2026-09-03"], "فاتورة ضريبية مبسطة", fields={"merchant": None, "date": "2026-09-03", "total": 11.5, "card_slip_amount": None})
    for g in (a, b): g["ids"] = [g["id"]]; g["boxes"] = [(g["page"], None)]
    assert [o["ids"] for o in collapse_fragments([a, b])] == [["g1"], ["g2"]]
    # a merchant-less piece with no date of its own still folds into its invoice
    c = G("g3", 6, [11.5], [], "Total Invoice", fields=None)
    c["ids"] = ["g3"]; c["boxes"] = [(6, None)]
    assert [o["ids"] for o in collapse_fragments([a, c])] == [["g1", "g3"]]

def test_collapse_fragments_keeps_distinct_invoices_apart():
    # p23/p24: one shop, one day, one total, adjacent pages, but each piece carries its own invoice number: two purchases
    F = lambda inv: {"merchant": "KARIM SALEH AL FAHMAN SANITARY WARE EST.", "date": "2026-09-07", "total": 10.01, "invoice_no": inv}
    a = G("g1", 23, [10.01], ["2026-09-07"], "KARIM SALEH AL FAHMAN SANITARY WARE EST.", kind="invoice", fields=F("1635"))
    b = G("g2", 24, [10.01], ["2026-09-07"], "KARIM SALEH AL FAHMAN SANITARY WARE EST.", kind="invoice", fields=F("1634"))
    for g in (a, b): g["ids"] = [g["id"]]; g["boxes"] = [(g["page"], None)]
    assert [o["ids"] for o in collapse_fragments([a, b])] == [["g1"], ["g2"]]
    # the same number with an OCR digit dropped (one a prefix of the other) is still one invoice
    b2 = {**b, "fields": F("16350")}
    assert [o["ids"] for o in collapse_fragments([a, b2])] == [["g1", "g2"]]
    # p82/p83: two copies that each print their own total line are two documents, invoice number or not
    Fz = {"merchant": "Green Star Fuel", "date": "2026-09-28", "total": 628.0, "invoice_no": "47-11075"}
    c = G("g3", 82, [628.0], ["2026-09-28"], "Green Star Fuel", kind="receipt", fields=Fz); c["text"] = "Diesel 1.79\n628.00 SAR\nالإجمالي 628.00 SAR"
    d = G("g4", 83, [628.0], ["2026-09-28"], "Green Star Fuel", kind="invoice", fields=dict(Fz)); d["text"] = c["text"]
    for g in (c, d): g["ids"] = [g["id"]]; g["boxes"] = [(g["page"], None)]
    assert [o["ids"] for o in collapse_fragments([c, d])] == [["g3"], ["g4"]]
    # the footer of an invoice (no merchant, no number, no total line of its own) still folds into its header half
    e = G("g5", 83, [628.0], [], "Amount in Words :", fields={"merchant": None, "date": None, "total": 628.0, "invoice_no": None}); e["text"] = "Amount in Words : six hundred twenty eight riyals"
    e["ids"] = ["g5"]; e["boxes"] = [(83, None)]
    assert [o["ids"] for o in collapse_fragments([c, e])] == [["g3", "g5"]]

def test_sequential_invoices_pair_with_payment_order():
    # two invoices of one shop numbered 1634 and 1635, two card payments of that shop at 13:06 and 13:10: issued in payment order
    rows = [R("late", 10.0, "2026-09-07", "KARIM ALFAHMAN EST", time="13:10:33"), R("early", 10.0, "2026-09-07", "KARIM ALFAHMAN EST", time="13:06:34")]
    F = lambda inv: {"merchant": "Karim Al Fahman", "date": "2026-09-07", "total": 10.01, "invoice_no": inv}
    a, b = _left([G("g1", 23, [10.01], ["2026-09-07"], "Karim Al Fahman", fields=F("1635")), G("g2", 24, [10.01], ["2026-09-07"], "Karim Al Fahman", fields=F("1634"))])
    links, review = match_receipts([a, b], rows, {})
    assert links["g1"] is None and links["g2"] is None and set(review) == {"g1", "g2"}          # pass 1: a genuine tie
    links, review = second_pass([a, b], rows, links, review)
    assert links == {"g1": "late", "g2": "early"} and not review, (links, review)
    # three groups over the same two rows, or unnumbered invoices: still a human decision
    c = _left([G("g3", 25, [10.01], ["2026-09-07"], "Karim Al Fahman", fields=F("1636"))])[0]
    l3, r3 = match_receipts([a, b, c], rows, {}); l3, r3 = second_pass([a, b, c], rows, l3, r3)
    assert set(r3) == {"g1", "g2", "g3"} and not any(l3.values()), (l3, r3)
    u1, u2 = _left([G("u1", 23, [10.01], ["2026-09-07"], "Karim Al Fahman", fields=F(None)), G("u2", 24, [10.01], ["2026-09-07"], "Karim Al Fahman", fields=F(None))])
    l4, r4 = match_receipts([u1, u2], rows, {}); l4, r4 = second_pass([u1, u2], rows, l4, r4)
    assert set(r4) == {"u1", "u2"} and not any(l4.values()), (l4, r4)

def test_unhealed_card_slip_joins_the_receipt_it_pays_for():
    rows = [R("091017099294", 1010.85, "2026-09-10", "ALBOSAAD TRADING COMPANY", time="10:17:41"), R("090810003459", 330.0, "2026-09-21", "NORA ALQHTANY EST", time="08:10:46")]
    # p38: a Latin-named invoice and an unhealed Arabic-named mada slip that prints the same total and the statement's own reference number
    inv = G("i", 38, [1010.85], ["2026-09-10"], "AL BOSAAD TARDING COMPANY", kind="invoice", fields={"merchant": "AL BOSAAD TARDING COMPANY", "date": "2026-09-10", "total": 1010.85})
    slip = G("s", 38, [1010.85], ["2026-09-10"], "شركة البوسعد التجارية", kind=None); slip["text"] = "شركة البوسعد التجارية\n10:17:54\n1520 1 RU.01L 091017099294\nمدى mada PURCHASE\nPURCHASE AMOUNT 1010.85\nAPPROVED"
    out = collapse_card_slips([inv, slip], rows)
    assert len(out) == 1 and out[0]["ids"] == ["i", "s"] and out[0]["fields"]["card_slip_amount"] == 1010.85, out
    # p65: a handwritten form with only a total, and a slip whose OCR amount is garbage (335.55) but whose reference is the 330.00 row's
    form = G("f", 65, [330.0], [], "Customer Sig.", kind="other", fields={"merchant": None, "date": None, "total": 330})
    slip2 = G("s2", 65, [335.55], ["2026-03-21"], "نقليات الناصر", kind=None); slip2["text"] = "نقليات الناصر\n21/03/2026 08:10:57\n1520 090810003459\nمدى\nPURCHASE AMOUNT 335.55\nAPPROVED"
    out = collapse_card_slips([form, slip2], rows)
    assert len(out) == 1 and out[0]["ids"] == ["f", "s2"] and "2026-03-21" in out[0]["dates"], out     # the slip dates the payment
    links, review = match_receipts(out, rows, {})
    assert links["f"] == "090810003459" and not review, (links, review)                                 # 330 + 21/09 (٣ read for ٩): matched, not a bare-amount review
    # a slip on a page whose receipts have another total stays its own record, after the receipts
    lone = G("l", 20, [10.0], ["2026-09-06"], "x", kind=None); lone["text"] = "mada PURCHASE AMOUNT 10.00 624910165282"
    other = G("o", 20, [11.5], ["2026-09-06"], "Shop", kind="invoice", fields={"merchant": "Shop", "date": "2026-09-06", "total": 11.5})
    assert [o["ids"] for o in collapse_card_slips([lone, other], rows + [R("624910165282", 10.0, "2026-09-06", "X")])] == [["o"], ["l"]]
    # a healed receipt with an embedded slip section is a receipt, not a slip
    rcpt = G("r", 30, [97.5], ["2026-09-08"], "MAZA REST", kind="receipt", fields={"merchant": "MAZA REST", "date": "2026-09-08", "total": 97.5}); rcpt["text"] = "MAZA REST\nmada PURCHASE AMOUNT 97.50 625101016891"
    assert [o["ids"] for o in collapse_card_slips([rcpt, other], rows)] == [["r"], ["o"]]

def test_split_invoice_halves_merge_despite_a_numeric_header_line():
    # p78: the header+items half (merchant, total computed from the lines) and the totals block whose first line is "Total Invoice | 275.00"
    head = G("h", 78, [250.0, 37.5], ["2026-09-24"], "ALWAN PAINT COMPANY", kind="invoice", fields={"merchant": "ALWAN PAINT COMPANY", "date": "2026-09-24", "total": 316.25, "invoice_no": "1214"})
    foot = G("f", 78, [275.0, 41.25, 316.25], ["2026-09-24"], "Total Invoice | 275.00", kind="invoice", fields={"merchant": None, "date": "2026-09-24", "total": 316.25, "invoice_no": None})
    foot["text"] = "Total Invoice | 275.00\nVAT Amount | 41.25\nNet Invoice | 316.25"
    for g in (head, foot): g["ids"] = [g["id"]]; g["boxes"] = [(78, None)]
    assert real_merchant_tokens(foot) == set()                    # a number is not a shop name
    out = collapse_fragments([foot, head])
    assert [o["ids"] for o in out] == [["h", "f"]], out
    # merged, the record is the day's only candidate for the 316.00 card row and links by near-amount (0.25 off)
    row = R("r", 316.0, "2026-09-24", "mwssh sbgh alalwanalauon amro"); out[0]["confidence"] = 0.98
    links, review = match_receipts(out, [row], {}); links, review = second_pass(out, [row], links, review)
    assert links["h"] == "r", (links, review)

def test_split_payment_settles_review_rows_and_elimination_follows():
    # p10: two 10.00 ASDAF payments at 08:44/08:45 and a 10.00 Durrat payment at 09:30; the ASDAF receipt totals 20.00 (slip 10.00, year misread 2025), the Durrat invoice 10.00
    rows = [R("a44", 10.0, "2026-09-03", "ASDAF ALMUHITAl Oyoun FirsAL A", time="08:44:49"), R("a45", 10.0, "2026-09-03", "ASDAF ALMUHITAl Oyoun FirsAL A", time="08:45:23"),
            R("d30", 10.0, "2026-09-03", "mwssh drh albndqyh llmwadalaiu", time="09:30:27")]
    asdaf = _left([G("asdaf", 10, [20.0, 10.0], ["2025-09-03"], "ASDAF ALMUHIT", fields={"merchant": "ASDAF ALMUHIT", "date": "2025-09-03", "total": 20.0, "card_slip_amount": 10.0})])[0]
    durrat = _left([G("durrat", 10, [10.0], ["2026-09-03"], "مؤسسة درة البندقية للمواد الغذائية", fields={"merchant": "مؤسسة درة البندقية للمواد الغذائية", "date": "2026-09-03", "total": 10.0})])[0]
    links, review = match_receipts([asdaf, durrat], rows, {})
    assert set(review) == {"asdaf", "durrat"} and not any(links.values()), (links, review)        # pass 1: a three-way tie
    links, review = second_pass([asdaf, durrat], rows, links, review)
    assert links["asdaf"] == ["a44", "a45"] and links["durrat"] == "d30" and not review, (links, review)   # split, then the last candidate standing
    # a group the healer flagged as several documents keeps its decision even when it is the last candidate standing
    multi = _left([G("multi", 11, [10.0], ["2026-09-03"], "مؤسسة درة البندقية للمواد الغذائية", notes="two separate receipts", fields={"merchant": "مؤسسة درة البندقية للمواد الغذائية", "date": "2026-09-03", "total": 10.0})])[0]
    links, review = match_receipts([asdaf, multi], rows, {}); links, review = second_pass([asdaf, multi], rows, links, review)
    assert links["asdaf"] == ["a44", "a45"] and links["multi"] is None and review == {"multi": [("d30", 5)]}, (links, review)

def test_healer_dated_receipt_on_another_day_is_no_bare_amount_candidate():
    # p73-g1 (24.00, healer date 28/09) held the 19/09 24.00 row in REVIEW on amount alone; p59-g1 (24.15, 19/09, same shop) then links by near-amount
    row = R("r", 24.0, "2026-09-19", "karim alfahman estMAIN RD", time="07:38:23")
    far = _left([G("far", 73, [24.0], ["2026-09-28"], "مؤسسة تموينات عارف", fields={"merchant": "مؤسسة تموينات عارف", "date": "2026-09-28", "total": 24.0})])[0]
    close = _left([G("close", 59, [24.15], ["2026-09-19"], "KARIM SALEH AL FAHMAN SANITARY WARE EST.", fields={"merchant": "KARIM SALEH AL FAHMAN SANITARY WARE EST.", "date": "2026-09-19", "total": 24.15})])[0]
    assert score(far, row) == 0
    assert score(G("undated", 1, [24.0], [], "xyz"), row) == 3              # no date at all: still the bare-amount review candidate
    assert score(G("ocr", 1, [24.0], ["2026-09-28"], "xyz"), row) == 3       # an unhealed OCR date is not trusted enough to rule the receipt out
    assert score(G("ocrh", 1, [24.0], ["2026-09-28"], "xyz", fields={"merchant": "xyz", "date": None, "total": 24.0}), row) == 3   # healed, but no date read
    links, review = match_receipts([far, close], [row], {})
    assert "far" not in review and links["close"] is None, (links, review)
    links, review = second_pass([far, close], [row], links, review)
    assert links["close"] == "r" and links["far"] is None and not review, (links, review)
    # a same-day 25.00 row already taken by another shop's split payment is within 3.00 too, but only the 24.00 row names this shop
    twin = R("t", 25.0, "2026-09-19", "PURE OIL COMPANY", time="18:24:19")
    links, review = second_pass([far, close], [row, twin], {"far": None, "close": None, "oil": ["t", "x"]}, {})
    assert links["close"] == "r", (links, review)
    nameless = _left([G("nameless", 60, [24.15], ["2026-09-19"], "Somebody Else", fields={"merchant": "Somebody Else", "date": "2026-09-19", "total": 24.15})])[0]; nameless["confidence"] = 0.95
    assert second_pass([nameless], [row, twin], {"nameless": None, "oil": ["t", "x"]}, {})[0]["nameless"] is None   # no name support: still ambiguous

def test_bundle_of_invoices_paid_in_two_same_minute_card_payments():
    # p42-44: three STC invoices (115 + 34.50 + 57.50 = 207) paid as 202 + 5 within one minute; the healer read the 202 slip as a total
    rows = [R("c202", 202.0, "2026-09-12", "STC Channels 73008King Abdulla", time="10:21:20"), R("c5", 5.0, "2026-09-12", "STC Channels 73008King Abdulla", time="10:21:53"),
            R("z", 5.0, "2026-09-28", "ASDAF ALMUHIT", time="16:36:17")]
    slip = _left([G("slip", 42, [202.0], ["2026-09-12"], "STC Channels-73008", kind="card_slip", fields={"merchant": "STC Channels-73008", "date": "2026-09-12", "total": 202.0, "card_slip_amount": 202.0})])[0]
    F = lambda t, inv: {"merchant": None, "date": "2026-09-12", "total": t, "invoice_no": inv}
    i1, i2, i3 = _left([G("i1", 42, [115.0], ["2026-09-12"], "نوع الهوية: سجل تجاري", kind="invoice", fields=F(115.0, "13163902689")),
                        G("i2", 43, [34.5], ["2026-09-12"], "نوع الهوية: سجل تجاري", kind="invoice", fields=F(34.5, "13162924623")),
                        G("i3", 44, [57.5], ["2026-09-12"], "نوع الهوية: سجل تجاري", kind="invoice", fields=F(57.5, "13163338088"))])
    five = _left([G("five", 20, [5.0], ["2026-09-06"], "x")])[0]          # an unhealed 5.00 receipt elsewhere parks both 5.00 rows on amount alone
    groups = [slip, i1, i2, i3, five]
    links, review = match_receipts(groups, rows, {})
    assert links["slip"] == "c202" and {r for r, _ in review["five"]} == {"c5", "z"}, (links, review)
    links, review = second_pass(groups, rows, links, review)
    assert links["i1"] == links["i2"] == links["i3"] == ["c202", "c5"] and links["slip"] == "c202", (links, review)
    assert review == {"five": [("z", 3)]}, review                           # the STC 5.00 left the other list
    rows2, rc = assign_statuses(rows, groups, links, review, tie_out_ledger(rows, []), [])
    assert {r["ref"]: r["status"] for r in rows2} == {"c202": "MATCHED", "c5": "MATCHED", "z": "REVIEW"}
    assert {g["id"]: g["status"] for g in rc} == {"slip": "LINKED", "i1": "LINKED", "i2": "LINKED", "i3": "LINKED", "five": "REVIEW"}
    # the run must be consecutive pages: with the middle invoice on page 45 nothing sums to 207
    i2["page"] = 45; i2["pages"] = [45]
    links, review = match_receipts(groups, rows, {}); links, review = second_pass(groups, rows, links, review)
    assert links["i1"] is None and links["i2"] is None and links["i3"] is None and {r for r, _ in review["five"]} == {"c5", "z"}, (links, review)

from b_match import mark_duplicates

def test_duplicate_copies_are_marked_and_the_first_copy_links():
    # p12/p30: battery invoice 4942 (280.00, 06/09) filed twice; the card row must go to the first copy, the second is a DUPLICATE
    row = R("r", 280.0, "2026-09-06", "SHINING WAY CORPOTATION FGen", time="11:19:21")
    F = lambda m, t=280.0: {"merchant": m, "date": "2026-09-06", "total": t, "invoice_no": "4942"}
    a = _left([G("a", 12, [280.0], ["2026-09-06"], "مؤسسة الطريق المضي للتجارة", kind="invoice", fields=F("مؤسسة الطريق المضي للتجارة"))])[0]
    b = _left([G("b", 30, [280.0], ["2026-09-06"], "مؤسسة الطريق المضى للتجارة", kind="invoice", fields=F("مؤسسة الطريق المضى للتجارة"))])[0]      # ي/ى: the same shop
    o = _left([G("o", 31, [290.0], ["2026-09-06"], "Somebody Else", kind="invoice", fields=F("Somebody Else", 290.0))])[0]                      # same number, another shop and total
    keep, dups = mark_duplicates([a, b, o])
    assert [g["id"] for g in keep] == ["a", "o"] and [g["id"] for g in dups] == ["b"] and dups[0]["duplicate_of"] == "a", (keep, dups)
    links, review = match_receipts(keep, [row], {})
    assert links["a"] == "r" and not review, (links, review)                                        # no rival copy: a plain match
    rows2, rc = assign_statuses([row], keep, links, review, tie_out_ledger([row], []), [], duplicates=dups)
    assert rows2[0]["status"] == "MATCHED" and {g["id"]: g["status"] for g in rc} == {"a": "LINKED", "o": "ORPHAN", "b": "DUPLICATE"}
    dup = next(g for g in rc if g["id"] == "b")
    assert dup["ref"] is None and "a" in dup["reason"] and "4942" in dup["reason"] and dup["citations"]["statement"]["ref"] == "r", dup
    # no invoice number, or a different total: two purchases, not a copy
    c1, c2 = _left([G("c1", 5, [10.0], ["2026-09-06"], "Shop", fields={"merchant": "Shop", "date": "2026-09-06", "total": 10.0, "invoice_no": None}),
                    G("c2", 6, [10.0], ["2026-09-06"], "Shop", fields={"merchant": "Shop", "date": "2026-09-06", "total": 10.0, "invoice_no": None})])
    assert mark_duplicates([c1, c2])[1] == [] and mark_duplicates([a, o])[1] == []

def test_same_minute_receipt_links_within_three_sar_without_a_name():
    # p12-g2: Shawaya receipt 48.00 at 2:21 PM marked cash (unhealed; OCR date 2026/04/09 for 04/09), card 04/09 14:21 45.00
    row = R("r", 45.0, "2026-09-04", "shooyat althyafaalamDAMMAMSAU", time="14:21:12")
    g = _left([G("g", 12, [48.0], ["2026-04-09"], "مدعى مراجعة الـ افة")])[0]
    g["text"] = "مدعى مراجعة الـ افة\nرقم الضريبة : 310676595200003\n2026/04/09 2:21 PM\nCash كاش:\nالمبلغ المدفوع: 48.00"
    links, review = second_pass([g], [row], {"g": None}, {})
    assert links["g"] == "r" and not review, (links, review)
    rows2, _ = assign_statuses([row], [g], links, review, tie_out_ledger([row], []), [])
    assert rows2[0]["status"] == "AMOUNT_MISMATCH" and "differs by 3.00" in rows2[0]["reason"], rows2[0]
    # ten minutes apart: back to a suggestion for a human
    late = {**g, "text": g["text"].replace("2:21 PM", "2:31 PM")}
    links, review = second_pass([late], [row], {"g": None}, {})
    assert links["g"] is None and review["g"] == [("r", 0)], (links, review)
    # a healer time wins over the text; an Arabic evening marker is PM, a following Arabic word is not
    h = _left([G("h", 12, [48.0], ["2026-09-04"], "zzz", fields={"merchant": "zzz", "date": "2026-09-04", "time": "02:22 م", "total": 48.0})])[0]; h["text"] = "09:00 مبيعات"
    assert second_pass([h], [row], {"h": None}, {})[0]["h"] == "r"
    h["fields"]["time"] = None
    assert second_pass([h], [row], {"h": None}, {})[0]["h"] is None

def test_cash_receipt_dated_after_the_card_charge_is_a_suggestion_not_a_match():
    # p64-g1: Munhali invoice 8780, 16.00, dated 21/09 08:51 and marked cash; the 16.00 ASDAF card row is 20/09 07:44
    row = R("r", 16.0, "2026-09-20", "ASDAF ALMUHITAl Oyoun FirsAL A", time="07:44:54")
    g = _left([G("g", 64, [16.0], ["2026-09-21"], "مؤسسة تموينات عارف بن سعيد", kind="invoice", notes="Single Saudi VAT invoice; payment is marked as cash.",
                 fields={"merchant": "مؤسسة تموينات عارف بن سعيد", "date": "2026-09-21", "time": "08:51", "total": 16.0})])[0]
    g["text"] = "فاتورة ضريبية\nالتاريخ 2026/09/21\nنقداً\nالإجمالي 16.00"
    links, review = match_receipts([g], [row], {})
    assert links["g"] is None and review["g"] == [("r", 4)], (links, review)
    links, review = second_pass([g], [row], links, review)
    assert links["g"] is None and review["g"] == [("r", 4)], (links, review)       # the suggestion survives the second pass
    rows2, rc = assign_statuses([row], [g], links, review, tie_out_ledger([row], []), [])
    assert rows2[0]["status"] == "REVIEW" and rc[0]["status"] == "REVIEW"
    # dated the day before the charge, or card-paid the day after: still a match
    before = {**g, "fields": {**g["fields"], "date": "2026-09-19"}, "dates": ["2026-09-19"]}
    assert match_receipts([before], [row], {})[0]["g"] == "r"
    card = {**g, "notes": "Single invoice with an attached mada slip.", "text": "فاتورة ضريبية\nالتاريخ 2026/09/21\nمدى\nالإجمالي 16.00"}
    assert match_receipts([card], [row], {})[0]["g"] == "r"

def test_unpriced_dated_piece_of_a_single_receipt_page_dates_its_record():
    # p87: an online invoice printed as blocks; only the totals block (p87-g1 with g2/g5) has an amount, the date sits alone on p87-g3
    tot = G("tot", 87, [194.01], [], "مركز المعرفة العلمية للتدريب", kind="other", fields={"merchant": "مركز المعرفة العلمية للتدريب", "date": None, "total": 194.01})
    day = G("day", 87, [], ["2026-09-23"], "تاريخ الطلب: Wednesday 23 September", kind="other", fields={"merchant": None, "date": "2026-09-23", "time": "01:25 PM", "total": None})
    cust = G("cust", 87, [], [], "ACME INDUSTRIAL COMPANY", kind="other", fields={"merchant": "ACME INDUSTRIAL COMPANY", "date": None, "total": None})
    for g in (tot, day, cust): g["ids"] = [g["id"]]; g["boxes"] = [(87, None)]
    out = collapse_fragments([day, cust, tot])                    # order-independent: the date block comes first here
    rec = next(o for o in out if "tot" in o["ids"])
    assert sorted(rec["ids"]) == ["day", "tot"] and "2026-09-23" in rec["dates"] and rec["fields"]["merchant"] == "مركز المعرفة العلمية للتدريب", out
    row = R("r", 194.01, "2026-09-23", "Knowledge tc SAU", time="13:25:22")
    assert match_receipts(out, [row], {})[0][rec["id"]] == "r"
    # a page whose priced record already has a date keeps another receipt's header apart (p26: an Othaim header beside an Asdaf slip)
    asdaf = G("asdaf", 26, [6.0], ["2026-09-08"], "ASDAF ALMUHIT", fields={"merchant": "ASDAF ALMUHIT", "date": "2026-09-08", "total": 6.0})
    oth = G("oth", 26, [], ["2026-09-08"], "Othaim", fields={"merchant": "Othaim", "date": "2026-09-08", "total": None})
    for g in (asdaf, oth): g["ids"] = [g["id"]]; g["boxes"] = [(26, None)]
    assert [o["ids"] for o in collapse_fragments([oth, asdaf])] == [["oth"], ["asdaf"]]
    # two priced records on the page: nobody can tell whose date it is
    two = G("two", 87, [50.0], [], "Other Shop", fields={"merchant": "Other Shop", "date": None, "total": 50.0}); two["ids"] = ["two"]; two["boxes"] = [(87, None)]
    assert len(collapse_fragments([day, tot, two])) == 3

from b_match import apply_group_overrides

def test_group_overrides_apply_without_a_healer_run():
    # overrides.json's groups section used to land only through Step A (a full, paid heal); the matcher applies it to the cached groups too
    import io, contextlib
    g = G("p55-g2", 55, [29.97], ["2026-03-16"], "قانونة ضريبية مبسطة،")        # never healed: garbage merchant, misread date
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        apply_group_overrides([g, G("x", 1, [5.0], [], "x")], {"groups": {"p55-g2": {"total": 29.97, "date": "2026-09-19", "merchant": "Othaim"}, "nope": {"total": 1.0}}})
    assert g["fields"]["total"] == 29.97 and g["dates"][0] == "2026-09-19" and g["merchant_candidates"][0] == "Othaim" and "[override]" in g["notes"], g
    assert receipt_amounts(g) == {29.97} and "2026-03-16" in g["dates"] and "unknown group id nope" in err.getvalue()
    row = R("r", 29.97, "2026-09-19", "AL OTHAIM MARKETS COMPANY", time="10:57:14")
    assert score(g, row) == 3 + 2 + 1
    # a non-numeric amount is ignored with a warning, like Step A; applying twice marks the note once
    err = io.StringIO()
    with contextlib.redirect_stderr(err): apply_group_overrides([g], {"groups": {"p55-g2": {"total": "29.97"}}})
    assert g["fields"]["total"] == 29.97 and "not a number" in err.getvalue() and g["notes"].count("[override]") == 1, (g["notes"], err.getvalue())
    # p26-g1: a healed header with no total gains one, and the amounts list carries it as the total candidate
    h = G("p26-g1", 26, [], ["2026-09-08"], "Othaim", fields={"merchant": "شركة أسواق العثيم / Othaim", "date": "2026-09-08", "total": None, "card_slip_amount": None})
    apply_group_overrides([h], {"groups": {"p26-g1": {"total": 93.0, "card_slip_amount": 93.0}}})
    assert receipt_amounts(h) == {93.0} and h["amounts"] == [{"value": 93.0, "total_candidate": True}] and h["fields"]["merchant"] == "شركة أسواق العثيم / Othaim"

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print("ok", name)


def test_qr_attach_and_abstain():
    from b_match import attach_qr, gate_amounts, amount_source
    inv = G("q1", 3, [700.0, 91.5], ["2026-09-06"], "ALWAN PAINT", fields={"total": 700.0}); inv["ids"] = ["q1"]; inv["boxes"] = [(3, [0, 0, 1000, 500])]
    other = G("q2", 3, [12.0], ["2026-09-06"], "OTHER"); other["ids"] = ["q2"]; other["boxes"] = [(3, [0, 600, 1000, 900])]
    qr = {"pages": {"page-03.png": {"width": 1000, "height": 1000, "codes": [
        {"box": [100, 100, 200, 200], "zatca": {"seller": "Alwan", "vat_no": "312452829200003", "time": "t", "total": 701.5, "vat": 91.5}},
        {"box": [100, 950, 200, 990], "zatca": {"seller": "Nobody", "vat_no": "", "time": "t", "total": 5.0, "vat": 0}}]}}}
    inv["confidence"] = 0.5   # too weak to use: the QR fills the total
    loose = attach_qr([inv, other], qr)
    # the code inside the invoice's crop fills a total the parsed read could not be trusted for; a code nobody explains stays loose
    assert inv["fields"]["total"] == 701.5 and receipt_amounts(inv) == {701.5} and inv["qr_fills"] == {"read": 700.0} and "qr_conflict" not in inv
    assert [l["zatca"]["total"] for l in loose] == [5.0] and "qr" not in other
    weak = G("w1", 4, [30.2], ["2026-09-08"], "Othaim", fields={"total": 30.2}); weak["confidence"] = 0.42
    strong = G("w2", 4, [12.0], ["2026-09-08"], "Othaim", fields={"total": 12.0}); strong["confidence"] = 0.9
    marked = G("w3", 4, [52.5], ["2026-09-08"], "Cafe", fields={"total": 52.5}); marked["confidence"] = 0.9
    marked["unreadable_by"] = {"by": "Saad", "reason": "handwritten", "at": None, "proposed": False}
    gate_amounts([weak, strong, marked, inv])
    assert receipt_amounts(weak) == set() and weak["withheld_amounts"] == [30.2] and "0.42" in weak["unreadable"]
    assert receipt_amounts(strong) == {12.0} and amount_source(strong) == "ai" and amount_source(inv) == "qr"
    assert receipt_amounts(marked) == set() and "by Saad" in marked["unreadable"]
    assert score(weak, R("x", 30.98, "2026-09-08", "AL OTHAIM MARKETS")) == 0   # a withheld amount is never matched


def test_slip_reference_links():
    from b_match import LINK_HOW
    rows = [R("624910165282", 10.0, "2026-09-06", "ALWAN"), R("x2", 11.5, "2026-09-06", "ALWAN")]
    g = G("s1", 20, [11.5], ["2026-09-06"], "Alwan Paint"); g["printed_refs"] = ["624910165282", "999999999999"]
    links, review = match_receipts([g], rows, {})
    # the stapled slip prints the payment's reference: linked to that payment even though another row has the invoice's exact amount
    assert links["s1"] == "624910165282" and LINK_HOW["s1"]["rule"] == "slip_ref"
    rows2, _ = assign_statuses(rows, [g], links, review, tie_out_ledger(rows, []), [])
    assert rows2[0]["status"] == "AMOUNT_MISMATCH" and rows2[0]["difference"] == -1.5


def test_parsed_first_then_qr():
    from b_match import _apply_qr, amount_source, gate_amounts, vat_check
    z = {"seller": "S", "vat_no": "300000000000003", "time": "t", "total": 218.5, "vat": 28.5}
    same = G("a", 3, [218.5], ["2026-09-01"], "Fares", fields={"total": 218.5}); same["confidence"] = 0.95
    _apply_qr(same, z, {"page": 3}); gate_amounts([same])
    assert same.get("qr_confirms") and amount_source(same) == "ai_qr" and same["fields"]["vat"] == 28.5   # QR confirms, and adds the VAT it carries
    differ = G("b", 3, [281.5], ["2026-09-01"], "Fares", fields={"total": 281.5}); differ["confidence"] = 0.95
    _apply_qr(differ, z, {"page": 3}); gate_amounts([differ])
    # a confident parsed read and the QR disagree: neither is used, a person checks
    assert differ["qr_conflict"]["kept"] == "none" and receipt_amounts(differ) == set() and "a person must check" in differ["unreadable"]
    assert vat_check({"fields": {"total": 218.5, "vat": 28.5}})["status"] == "ok"
    assert vat_check({"fields": {"total": 16.0, "vat": 2.21}}) == {"status": "mismatch", "total": 16.0, "vat": 2.21, "expected": 2.09}
    assert vat_check({"fields": {"total": 280.0, "vat": 0}})["status"] == "zero" and vat_check({"fields": {"total": 10.0}})["status"] == "missing"


def test_rounding_rule_only_when_a_person_set_it():
    import b_match
    from b_match import rules_of
    assert rules_of({"rules": {"rounding": {"max": 0.99, "applies": "card_less"}}}) == {}          # no author: not a rule
    rows = [R("r1", 313.0, "2026-09-06", "ALWAN"), R("r2", 23.0, "2026-09-06", "ALWAN")]
    gs = [G("g1", 19, [313.95], ["2026-09-06"], "Alwan", fields={"total": 313.95}), G("g2", 76, [21.0], ["2026-09-06"], "Alwan", fields={"total": 21.0})]
    b_match.RULES.clear(); b_match.RULES.update(rules_of({"rules": {"rounding": {"max": 0.99, "applies": "card_less", "by": "Saad", "at": "t"}}}))
    try:
        out, _ = assign_statuses(rows, gs, {"g1": "r1", "g2": "r2"}, {}, tie_out_ledger(rows, []), [])
    finally:
        b_match.RULES.clear()
    # 0.95 below the invoice: inside the rule, still AMOUNT_MISMATCH but accepted by it; 2.00 above the invoice: a person decides
    assert out[0]["status"] == "AMOUNT_MISMATCH" and out[0]["rounding_rule"]["by"] == "Saad" and b_match.basis(out[0]["status"], out[0]) == "rule"
    assert not out[1].get("rounding_rule") and b_match.basis(out[1]["status"], out[1]) == "proposed"


def test_vendor_vat_number_carried_and_misreads_named():
    import b_match
    from b_match import vendor_vat_numbers
    rows = {"t1": {"merchant": "MASDAR TECHNICAL SUPPLIES"}, "t2": {"merchant": "MASDAR TECHNICAL SUPPLIES"}, "t3": {"merchant": "SHARED TERMINAL"}}
    def rec(id, no, refs, src="parsed", merchant="Masdar Technical Supplies", text=""):
        b_match.TEXT_OF[id] = text or (no or "")
        return {"id": id, "ids": [id], "refs": refs, "fields": {"merchant": merchant}, "seller_vat": {"no": no, "source": src if no else None}}
    b_match.TEXT_OF.clear(); b_match.BUYER_VAT[0] = "311676513300003"
    a = rec("a", "300188493310003", ["t1"]); b = rec("b", "300188493310003", [], merchant="Masdar Technical Supplies")
    c = rec("c", None, ["t2"]); d = rec("d", "300184933130003", [], merchant="Masdar Technical Supplies")
    x = rec("x", "300689074500003", ["t3"], merchant="Al-Munhali"); y = rec("y", "310231837700003", ["t3"], merchant="Modern Distribution")
    z = rec("z", None, ["t3"], merchant="Somebody")
    vendor_vat_numbers([a, b, c, d, x, y, z], rows)
    # same terminal / same name: the number read most often is lent, and a one-off variant a few digits off is named a misread
    assert c["seller_vat"]["no"] == "300188493310003" and c["seller_vat"]["source"] == "vendor"
    assert d["seller_vat"] == {**d["seller_vat"], "no": "300188493310003", "read_as": "300184933130003"}
    # a terminal shared by two sellers with different numbers lends nothing
    assert z["seller_vat"]["no"] is None


def test_printed_vat_found_on_any_piece_of_the_invoice():
    import b_match
    b_match.TEXT_OF.clear(); b_match.AMOUNTS_OF.clear()
    b_match.TEXT_OF["a"] = "Net Invoice 839.5"; b_match.AMOUNTS_OF["a"] = [839.5]; b_match.AMOUNTS_OF["b"] = []
    b_match.TEXT_OF["frag"] = "VAT Amount 109.5"   # a fragment's text, joined to its document by main()
    g = {"id": "a", "ids": ["a", "frag"], "fields": {"total": 839.5}, "amounts": [{"value": 839.5}]}
    assert b_match.printed_vat(g) == 109.5           # one decimal, as Alwan prints it
    h = {"id": "b", "ids": ["b"], "fields": {"total": 280.0}, "amounts": [{"value": 280.0}]}
    b_match.TEXT_OF["b"] = "Total 280.00"
    assert b_match.printed_vat(h) is None             # nothing printed: no VAT is invented


def test_vat_label_without_digits_is_named():
    import b_match
    b_match.TEXT_OF.clear()
    b_match.TEXT_OF["s"] = "1520 018535 6.05 626316434837\nالرقم الضريبي\nمؤسسة علي محمد السبيتي التجارية"   # p60: the digits were dropped
    b_match.TEXT_OF["t"] = "الرقم الضريبي: ٣٠٠٤٧٠٢٣٦٧٠٠٠٠٣"                                                   # printed and captured
    b_match.TEXT_OF["u"] = "الرقم الضريبي للعميل"                                                                   # the buyer's label: not the seller's
    assert b_match.vat_label_without_digits({"id": "s"}) is True
    assert b_match.vat_label_without_digits({"id": "t"}) is False and b_match.labelled_vat_number({"id": "t"}) == "300470236700003"
    assert b_match.vat_label_without_digits({"id": "u"}) is False


def test_arabic_indic_amounts_with_a_decimal_comma():
    from common import ascii_digits, find_amounts
    assert find_amounts("المبلغ المطلوب ٤٦٠,٠٠ مبلغ الضريبة ٦٠,٠٠") == [460.0, 60.0]   # p84: the comma is the decimal point
    assert find_amounts("﷼ ١٦٨٫٧٠") == [168.7]                                           # the Arabic decimal separator
    assert find_amounts("Total 1,234.50") == [1234.5]                                    # an ASCII thousands comma is unchanged
    assert ascii_digits("٢٨٠٨٠٢٠٢") == "28080202"


def test_an_unsigned_no_link_does_not_block_the_matcher():
    g = G("g1", 64, [16.0], ["2026-09-20"], "ASDAF ALMUHIT")
    rows = [R("r16", 16.0, "2026-09-20", "ASDAF ALMUHITAl Oyoun")]
    links, _ = match_receipts([g], rows, {"links": {"g1": None}})                              # no author: ignored
    assert links["g1"] == "r16"
    links, _ = match_receipts([g], rows, {"links": {"g1": {"ref": None, "by": "Reviewer (app)"}}})   # a named person: kept
    assert links["g1"] is None


def test_merging_pieces_keeps_a_total_already_set():
    # p84: the piece holding the page check's 460 / VAT 60 has no merchant field; the header piece names the shop
    head = G("a", 84, [460.0], ["2026-09-28"], "Al-Motawaa Transportation", kind="invoice", fields={"merchant": None, "total": 460.0, "vat": 60.0})
    piece = G("b", 84, [460.0], ["2026-09-28"], "Al-Motawaa Transportation", kind="invoice", fields={"merchant": "Al-Motawaa Transportation", "total": None, "vat": None})
    for g in (head, piece): g["ids"] = [g["id"]]; g["boxes"] = [(84, None)]
    out = collapse_fragments([head, piece])
    assert len(out) == 1
    f = out[0]["fields"]
    assert f["total"] == 460.0 and f["vat"] == 60.0 and f["merchant"] == "Al-Motawaa Transportation"


def test_an_ai_author_is_shown_as_reconai_only():
    from common import author_name, is_ai_author
    assert author_name("Claude (AI assistant)") == "ReconAI" and author_name("GPT (AI check)") == "ReconAI" and author_name("ReconAI") == "ReconAI"
    assert author_name("Reviewer (app)") == "Reviewer (app)" and author_name(None) is None
    assert is_ai_author("ReconAI") and not is_ai_author("Reviewer (app)")
